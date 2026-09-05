"""Page-view telemetry: collection, flush, day close, purge and exposure."""
import datetime

from app.extensions import db
from app.models import Organization, PageViewRollup, Restaurant, User, VisitorDailyUnique
from app.services import telemetry
from app.utils.time import paris_today
from conftest import auth_headers, get_token, make_restaurant, make_user


class FakeRedis:
    """Enough of the Redis surface for the telemetry service.

    A dict-backed double keeps the suite free of a Redis dependency; the flush
    logic it exercises is the same one production runs.
    """

    def __init__(self):
        self.hashes: dict[str, dict[str, int]] = {}
        self.sets: dict[str, set] = {}
        self.strings: dict[str, str] = {}
        self.hll: dict[str, set] = {}

    def pipeline(self):
        return self

    def execute(self):
        return []

    def expire(self, *_args, **_kwargs):
        return True

    def hincrby(self, key, field, amount=1):
        self.hashes.setdefault(key, {})
        self.hashes[key][field] = self.hashes[key].get(field, 0) + amount
        return self.hashes[key][field]

    def hgetall(self, key):
        return {k: str(v) for k, v in self.hashes.get(key, {}).items()}

    def sadd(self, key, *values):
        self.sets.setdefault(key, set()).update(str(v) for v in values)
        return len(values)

    def smembers(self, key):
        return set(self.sets.get(key, set()))

    def set(self, key, value, nx=False, ex=None):
        if nx and key in self.strings:
            return False
        self.strings[key] = value
        return True

    def get(self, key):
        return self.strings.get(key)

    def incr(self, key):
        value = int(self.strings.get(key, 0)) + 1
        self.strings[key] = str(value)
        return value

    def pfadd(self, key, *members):
        bucket = self.hll.setdefault(key, set())
        before = len(bucket)
        bucket.update(members)
        return int(len(bucket) > before)

    def pfcount(self, key):
        return len(self.hll.get(key, set()))


def _track(client, page_kind, site=None, ip='198.51.100.4', user_agent='Mozilla/5.0'):
    """Post a beacon the way a browser does, Origin header included."""
    payload = {'page_kind': page_kind}
    if site:
        payload['site'] = site
    return client.post(
        '/v1/public/track',
        json=payload,
        headers={
            'Origin': 'http://localhost:5173',
            'X-Forwarded-For': ip,
            'User-Agent': user_agent,
        },
    )


def _use_fake_redis(monkeypatch) -> FakeRedis:
    fake = FakeRedis()
    monkeypatch.setattr(telemetry, 'get_redis', lambda: fake)
    return fake


def _org_with_site(monkeypatch, slug='tel-org', code='TEL'):
    """Create an organization and one site, and make the test Host resolve to it.

    The public endpoints derive the tenant from the Host; the test client sends
    `localhost`, which falls back to DEFAULT_ORG_SLUG.
    """
    org = Organization(name=slug, slug=slug)
    db.session.add(org)
    db.session.commit()
    rid = make_restaurant(None, name=code, code=code)
    site = Restaurant.query.get(rid)
    site.organization_id = org.id
    site.slug = code.lower()
    db.session.commit()
    monkeypatch.setenv('DEFAULT_ORG_SLUG', slug)
    return org.id, rid


class TestCollection:
    def test_site_view_counts_and_feeds_uniques(self, app, client, monkeypatch):
        fake = _use_fake_redis(monkeypatch)
        _, rid = _org_with_site(monkeypatch)

        res = _track(client, 'today', 'tel')
        assert res.status_code == 204

        day = paris_today().isoformat()
        counters = fake.hashes[f'mariam:pv:r{rid}:{day}']
        assert list(counters.values()) == [1]
        assert next(iter(counters)).endswith(':today')
        assert fake.pfcount(f'mariam:uv:{rid}:{day}') == 1

    def test_screen_views_are_counted_but_never_as_visitors(self, app, client, monkeypatch):
        fake = _use_fake_redis(monkeypatch)
        _, rid = _org_with_site(monkeypatch, 'tel-org-2', 'TEL2')

        _track(client, 'tv', 'tel2')

        day = paris_today().isoformat()
        assert fake.hashes[f'mariam:pv:r{rid}:{day}']
        assert fake.pfcount(f'mariam:uv:{rid}:{day}') == 0

    def test_site_list_is_counted_on_the_organization(self, app, client, monkeypatch):
        fake = _use_fake_redis(monkeypatch)
        org_id, _ = _org_with_site(monkeypatch, 'demo', 'TEL3')

        _track(client, 'sites')

        day = paris_today().isoformat()
        assert fake.hashes[f'mariam:pv:o{org_id}:{day}']

    def test_unknown_kind_is_ignored(self, app, client, monkeypatch):
        fake = _use_fake_redis(monkeypatch)
        _org_with_site(monkeypatch, 'tel-org-4', 'TEL4')

        assert _track(client, 'bogus').status_code == 204
        assert fake.hashes == {}

    def test_unknown_site_is_ignored(self, app, client, monkeypatch):
        fake = _use_fake_redis(monkeypatch)
        _org_with_site(monkeypatch, 'tel-org-5', 'TEL5')

        res = _track(client, 'today', 'nope')
        assert res.status_code == 204
        assert fake.hashes == {}


class TestAbuseResistance:
    def test_a_beacon_without_an_origin_is_still_counted(self, app, client, monkeypatch):
        """Same-origin beacons do not carry an Origin on every engine."""
        fake = _use_fake_redis(monkeypatch)
        _, rid = _org_with_site(monkeypatch, 'abuse-org', 'ABU')

        res = client.post('/v1/public/track', json={'page_kind': 'today', 'site': 'abu'})

        assert res.status_code == 204
        assert fake.hashes[f'mariam:pv:r{rid}:{paris_today().isoformat()}']

    def test_a_foreign_origin_is_ignored(self, app, client, monkeypatch):
        fake = _use_fake_redis(monkeypatch)
        _org_with_site(monkeypatch, 'abuse-org-2', 'ABU2')

        res = client.post(
            '/v1/public/track',
            json={'page_kind': 'today', 'site': 'abu2'},
            headers={'Origin': 'https://evil.example'},
        )

        assert res.status_code == 204
        assert fake.hashes == {}

    def test_one_visitor_cannot_run_the_counter_up(self, app, client, monkeypatch):
        fake = _use_fake_redis(monkeypatch)
        _, rid = _org_with_site(monkeypatch, 'abuse-org-3', 'ABU3')
        monkeypatch.setenv('TELEMETRY_VISITOR_DAILY_CAP', '3')

        for _ in range(20):
            _track(client, 'today', 'abu3')

        day = paris_today().isoformat()
        assert sum(fake.hashes[f'mariam:pv:r{rid}:{day}'].values()) == 3

    def test_a_shared_address_never_clips_a_campus(self, app, client, monkeypatch):
        """A whole school behind one NAT address must be counted in full."""
        fake = _use_fake_redis(monkeypatch)
        _, rid = _org_with_site(monkeypatch, 'abuse-org-4', 'ABU4')

        for index in range(200):
            _track(client, 'today', 'abu4', ip='203.0.113.9', user_agent=f'device-{index}')

        day = paris_today().isoformat()
        assert sum(fake.hashes[f'mariam:pv:r{rid}:{day}'].values()) == 200
        assert fake.pfcount(f'mariam:uv:{rid}:{day}') == 200

    def test_rotating_the_user_agent_cannot_mint_unlimited_visitors(
        self, app, client, monkeypatch
    ):
        fake = _use_fake_redis(monkeypatch)
        _, rid = _org_with_site(monkeypatch, 'abuse-org-5', 'ABU5')
        monkeypatch.setenv('TELEMETRY_IP_UNIQUE_CAP', '5')

        for index in range(50):
            _track(client, 'today', 'abu5', ip='203.0.113.10', user_agent=f'forged-{index}')

        day = paris_today().isoformat()
        assert fake.pfcount(f'mariam:uv:{rid}:{day}') == 5

    def test_no_address_is_stored_in_the_clear(self, app, client, monkeypatch):
        fake = _use_fake_redis(monkeypatch)
        _org_with_site(monkeypatch, 'abuse-org-6', 'ABU6')

        _track(client, 'today', 'abu6', ip='203.0.113.11', user_agent='Mozilla/5.0 (probe)')

        stored = list(fake.hashes) + list(fake.sets) + list(fake.strings) + list(fake.hll)
        stored += [str(v) for v in fake.strings.values()]
        stored += [member for members in fake.hll.values() for member in members]
        assert not any('203.0.113.11' in entry for entry in stored)
        assert not any('probe' in entry for entry in stored)


class TestFlush:
    def test_counters_reach_postgres(self, app, client, monkeypatch):
        _use_fake_redis(monkeypatch)
        _, rid = _org_with_site(monkeypatch, 'flush-org', 'FLU')

        for _ in range(3):
            _track(client, 'today', 'flu')
        telemetry.flush_view_counters(app)

        row = PageViewRollup.query.filter_by(restaurant_id=rid, page_kind='today').one()
        assert row.views == 3
        assert row.organization_id is None

    def test_replaying_a_flush_does_not_double_count(self, app, client, monkeypatch):
        _use_fake_redis(monkeypatch)
        _, rid = _org_with_site(monkeypatch, 'flush-org-2', 'FLU2')

        _track(client, 'today', 'flu2')
        telemetry.flush_view_counters(app)
        telemetry.flush_view_counters(app)

        rows = PageViewRollup.query.filter_by(restaurant_id=rid).all()
        assert len(rows) == 1
        assert rows[0].views == 1

    def test_a_redis_reset_never_walks_postgres_backwards(self, app, client, monkeypatch):
        fake = _use_fake_redis(monkeypatch)
        _, rid = _org_with_site(monkeypatch, 'flush-org-3', 'FLU3')

        for _ in range(5):
            _track(client, 'today', 'flu3')
        telemetry.flush_view_counters(app)

        fake.hashes.clear()
        _track(client, 'today', 'flu3')
        telemetry.flush_view_counters(app)

        assert PageViewRollup.query.filter_by(restaurant_id=rid).one().views == 5


class TestDayCloseAndPurge:
    def test_day_close_freezes_the_visitor_estimate(self, app, client, monkeypatch):
        _use_fake_redis(monkeypatch)
        _, rid = _org_with_site(monkeypatch, 'close-org', 'CLO')

        _track(client, 'today', 'clo')
        telemetry.close_day_uniques(app, paris_today())

        assert VisitorDailyUnique.query.filter_by(restaurant_id=rid).one().unique_visitors == 1

    def test_purge_drops_rows_past_retention(self, app, monkeypatch):
        _, rid = _org_with_site(monkeypatch, 'purge-org', 'PUR')
        old = paris_today() - datetime.timedelta(days=500)
        db.session.add(PageViewRollup(
            restaurant_id=rid, date=old, hour=12, page_kind='today', views=1
        ))
        db.session.add(PageViewRollup(
            restaurant_id=rid, date=paris_today(), hour=12, page_kind='today', views=1
        ))
        db.session.commit()

        telemetry.purge_telemetry(app)

        remaining = PageViewRollup.query.filter_by(restaurant_id=rid).all()
        assert [r.date for r in remaining] == [paris_today()]


class TestTrafficEndpoint:
    def _supervisor(self, org_id, rid):
        uid = make_user(None, email='sup@mariam.app', role='org_admin', restaurant_id=None)
        User.query.get(uid).organization_id = org_id
        db.session.commit()

    def test_traffic_excludes_screens_from_the_totals(self, app, client, monkeypatch):
        _use_fake_redis(monkeypatch)
        org_id, rid = _org_with_site(monkeypatch, 'traffic-org', 'TRA')
        self._supervisor(org_id, rid)

        _track(client, 'today', 'tra')
        for _ in range(9):
            _track(client, 'tv', 'tra')
        telemetry.flush_view_counters(app)

        token = get_token(client, email='sup@mariam.app')
        body = client.get('/v1/analytics/traffic?period=7d', headers=auth_headers(token)).get_json()

        assert body['totals']['views'] == 1
        assert {row['page_kind']: row['views'] for row in body['by_page_kind']} == {
            'today': 1, 'tv': 9
        }

    def test_todays_visitors_are_not_counted_twice(self, app, client, monkeypatch):
        _use_fake_redis(monkeypatch)
        org_id, rid = _org_with_site(monkeypatch, 'traffic-org-2', 'TRA2')
        self._supervisor(org_id, rid)

        _track(client, 'today', 'tra2')
        telemetry.close_day_uniques(app, paris_today())

        token = get_token(client, email='sup@mariam.app')
        body = client.get('/v1/analytics/traffic?period=7d', headers=auth_headers(token)).get_json()

        assert body['totals']['unique_visitors'] == 1

    def test_site_list_views_stay_out_of_site_totals(self, app, client, monkeypatch):
        _use_fake_redis(monkeypatch)
        org_id, rid = _org_with_site(monkeypatch, 'demo', 'TRA3')
        self._supervisor(org_id, rid)

        _track(client, 'sites')
        telemetry.flush_view_counters(app)

        token = get_token(client, email='sup@mariam.app')
        body = client.get('/v1/analytics/traffic?period=7d', headers=auth_headers(token)).get_json()

        assert body['totals']['views'] == 0
        assert body['totals']['org_root_views'] == 1
