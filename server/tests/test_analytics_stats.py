"""Publication analytics: rates, punctuality, completeness and the status matrix."""
import datetime
from datetime import UTC

from app.extensions import db
from app.models import (
    DishCatalog,
    ExceptionalClosure,
    Menu,
    MenuCategory,
    MenuItem,
    Organization,
    Restaurant,
)
from app.utils.time import PARIS_TZ, paris_today
from conftest import auth_headers, get_token, make_restaurant, make_user

WEEKDAYS = [0, 1, 2, 3, 4]


def _last_full_week():
    """Monday and Friday of a week that is entirely in the past."""
    today = paris_today()
    monday = today - datetime.timedelta(days=today.weekday() + 7)
    return monday, monday + datetime.timedelta(days=4)


def _utc_naive(day, hour, minute=0):
    """Naive-UTC value matching a Paris wall-clock time, as the column stores it."""
    paris = datetime.datetime(day.year, day.month, day.day, hour, minute, tzinfo=PARIS_TZ)
    return paris.astimezone(UTC).replace(tzinfo=None)


def _org(slug='an-org'):
    org = Organization(name=slug, slug=slug)
    db.session.add(org)
    db.session.commit()
    return org.id


def _site(org_id, code, service_days=WEEKDAYS):
    rid = make_restaurant(None, name=code, code=code)
    site = db.session.get(Restaurant, rid)
    site.organization_id = org_id
    site.service_days = list(service_days)
    db.session.commit()
    return rid


def _category(rid, label, order=0):
    category = MenuCategory(restaurant_id=rid, label=label, order=order)
    db.session.add(category)
    db.session.commit()
    return category.id


def _menu(rid, day, status='published', published_at=None, chef_note=None):
    menu = Menu(
        restaurant_id=rid, date=day, status=status,
        published_at=published_at, chef_note=chef_note,
    )
    db.session.add(menu)
    db.session.commit()
    return menu.id


def _item(menu_id, rid, category_id, name, image_url=None):
    dish = DishCatalog(
        restaurant_id=rid, category_id=category_id, name=name, image_url=image_url
    )
    db.session.add(dish)
    db.session.flush()
    db.session.add(MenuItem(menu_id=menu_id, category_id=category_id, dish_id=dish.id))
    db.session.commit()


def _director(rid, org_id, email='dir@mariam.app'):
    from app.models import User
    uid = make_user(None, email=email, role='org_admin', restaurant_id=rid)
    db.session.get(User, uid).organization_id = org_id
    db.session.commit()
    return uid


def _publications(client, token, start, end, extra=''):
    res = client.get(
        f'/v1/analytics/publications?start={start.isoformat()}&end={end.isoformat()}{extra}',
        headers=auth_headers(token),
    )
    assert res.status_code == 200, res.get_json()
    return res.get_json()


def _analytics(client, token, path, query=''):
    res = client.get(f'/v1/analytics/{path}?{query}', headers=auth_headers(token))
    assert res.status_code == 200, res.get_json()
    return res.get_json()


class TestCalendarWindow:
    def test_the_calendar_ignores_the_selected_period(self, app, client):
        """It answers "did every site publish lately", which the filter does not change."""
        org = _org('cal1')
        rid = _site(org, 'CAL1')
        _director(rid, org)
        token = get_token(client, email='dir@mariam.app')

        today = _analytics(client, token, 'publications', 'period=1d')
        quarter = _analytics(client, token, 'publications', 'period=90d')

        assert len(today['matrix'][0]['days']) == 30
        assert today['matrix'][0]['days'] == quarter['matrix'][0]['days']

    def test_the_rates_still_follow_the_period(self, app, client):
        org = _org('cal2')
        rid = _site(org, 'CAL2')
        _director(rid, org)
        monday, friday = _last_full_week()
        for offset in range(5):
            day = monday + datetime.timedelta(days=offset)
            _menu(rid, day, published_at=_utc_naive(day, 9))
        token = get_token(client, email='dir@mariam.app')

        week = _publications(client, token, monday, friday)
        today = _analytics(client, token, 'publications', 'period=1d')

        assert week['summary']['publication_rate'] == 1.0
        assert today['summary']['publication_rate'] != 1.0


class TestGranularity:
    def test_a_single_day_is_reported_by_hour(self, app, client):
        org = _org('gr1')
        rid = _site(org, 'GR1')
        _director(rid, org)
        token = get_token(client, email='dir@mariam.app')

        traffic = _analytics(client, token, 'traffic', 'period=1d')
        satisfaction = _analytics(client, token, 'satisfaction', 'period=1d')

        assert traffic['granularity'] == 'hour'
        assert satisfaction['granularity'] == 'hour'
        assert len(satisfaction['series']) == 24
        assert satisfaction['series'][0]['hour'] == 0

    def test_a_longer_period_stays_daily(self, app, client):
        org = _org('gr2')
        rid = _site(org, 'GR2')
        _director(rid, org)
        token = get_token(client, email='dir@mariam.app')

        traffic = _analytics(client, token, 'traffic', 'period=7d')
        satisfaction = _analytics(client, token, 'satisfaction', 'period=7d')

        assert traffic['granularity'] == 'day'
        assert satisfaction['granularity'] == 'day'
        assert len(satisfaction['series']) == 7


class TestVoteSettings:
    def test_a_single_site_reports_what_it_offers(self, app, client):
        org = _org('vs1')
        rid = _site(org, 'VS1')
        site = db.session.get(Restaurant, rid)
        site.vote_enabled = False
        site.vote_icon_preset = 'stars'
        db.session.commit()
        _director(rid, org)
        token = get_token(client, email='dir@mariam.app')

        settings = _analytics(client, token, 'satisfaction', 'period=7d')['settings']

        assert settings['site_count'] == 1
        assert settings['sites_with_vote'] == 0
        assert settings['icon_preset'] == 'stars'

    def test_sites_disagreeing_on_the_preset_report_none(self, app, client):
        org = _org('vs2')
        first = _site(org, 'VS2A')
        second = _site(org, 'VS2B')
        db.session.get(Restaurant, first).vote_icon_preset = 'thumbs'
        db.session.get(Restaurant, second).vote_icon_preset = 'faces'
        db.session.get(Restaurant, second).vote_enabled = False
        db.session.commit()
        _director(first, org)
        token = get_token(client, email='dir@mariam.app')

        settings = _analytics(client, token, 'satisfaction', 'period=7d')['settings']

        assert settings['site_count'] == 2
        assert settings['sites_with_vote'] == 1
        assert settings['icon_preset'] is None
        assert settings['dish_question'] is None


class TestPublicationRate:
    def test_counts_only_open_days(self, app, client):
        org = _org('pr1')
        rid = _site(org, 'PR1')
        _director(rid, org)
        monday, friday = _last_full_week()
        for offset in range(3):
            day = monday + datetime.timedelta(days=offset)
            _menu(rid, day, published_at=_utc_naive(day, 9))

        body = _publications(client, get_token(client, email='dir@mariam.app'), monday, friday)
        assert body['summary']['publication_rate'] == 0.6

    def test_weekend_is_closed_not_missing(self, app, client):
        org = _org('pr2')
        rid = _site(org, 'PR2')
        _director(rid, org)
        monday, _ = _last_full_week()
        sunday = monday + datetime.timedelta(days=6)

        body = _publications(client, get_token(client, email='dir@mariam.app'), monday, sunday)
        statuses = {d['date']: d['status'] for d in body['matrix'][0]['days']}
        assert statuses[(monday + datetime.timedelta(days=5)).isoformat()] == 'closed'
        assert statuses[sunday.isoformat()] == 'closed'
        assert statuses[monday.isoformat()] == 'missing'

    def test_exceptional_closure_removes_the_open_day(self, app, client):
        org = _org('pr3')
        rid = _site(org, 'PR3')
        _director(rid, org)
        monday, friday = _last_full_week()
        db.session.add(ExceptionalClosure(
            restaurant_id=rid, start_date=monday, end_date=monday, is_active=True
        ))
        db.session.commit()
        for offset in range(1, 5):
            day = monday + datetime.timedelta(days=offset)
            _menu(rid, day, published_at=_utc_naive(day, 9))

        body = _publications(client, get_token(client, email='dir@mariam.app'), monday, friday)
        assert body['summary']['publication_rate'] == 1.0
        statuses = {d['date']: d['status'] for d in body['matrix'][0]['days']}
        assert statuses[monday.isoformat()] == 'closed'


class TestPunctuality:
    def test_published_before_service_is_on_time(self, app, client):
        org = _org('pu1')
        rid = _site(org, 'PU1')
        _director(rid, org)
        monday, friday = _last_full_week()
        _menu(rid, monday, published_at=_utc_naive(monday, 9))

        body = _publications(client, get_token(client, email='dir@mariam.app'), monday, friday)
        assert body['summary']['punctuality_rate'] == 1.0
        assert body['summary']['avg_lead_time_hours'] == 2.5
        statuses = {d['date']: d['status'] for d in body['matrix'][0]['days']}
        assert statuses[monday.isoformat()] == 'published_on_time'

    def test_published_after_service_start_is_late(self, app, client):
        org = _org('pu2')
        rid = _site(org, 'PU2')
        _director(rid, org)
        monday, friday = _last_full_week()
        _menu(rid, monday, published_at=_utc_naive(monday, 13))

        body = _publications(client, get_token(client, email='dir@mariam.app'), monday, friday)
        assert body['summary']['punctuality_rate'] == 0.0
        assert body['summary']['avg_lead_time_hours'] == -1.5
        statuses = {d['date']: d['status'] for d in body['matrix'][0]['days']}
        assert statuses[monday.isoformat()] == 'published_late'

    def test_service_hours_override_the_default(self, app, client):
        from app.models import RestaurantServiceHours
        org = _org('pu3')
        rid = _site(org, 'PU3')
        _director(rid, org)
        monday, friday = _last_full_week()
        db.session.add(RestaurantServiceHours(
            restaurant_id=rid, day_of_week=monday.weekday(),
            open_time='08:00', close_time='14:00',
        ))
        db.session.commit()
        _menu(rid, monday, published_at=_utc_naive(monday, 9))

        body = _publications(client, get_token(client, email='dir@mariam.app'), monday, friday)
        assert body['summary']['punctuality_rate'] == 0.0


class TestCompleteness:
    def test_rates_reflect_filled_categories_photos_and_notes(self, app, client):
        org = _org('co1')
        rid = _site(org, 'CO1')
        _director(rid, org)
        starters = _category(rid, 'Entrées', order=0)
        _category(rid, 'Plat principal', order=1)
        monday, friday = _last_full_week()
        menu_id = _menu(
            rid, monday, published_at=_utc_naive(monday, 9), chef_note='Bon appétit'
        )
        _item(menu_id, rid, starters, 'Carottes râpées', image_url='https://img/a.jpg')
        _item(menu_id, rid, starters, 'Salade verte')

        body = _publications(client, get_token(client, email='dir@mariam.app'), monday, friday)
        completeness = body['summary']['completeness']
        assert completeness['categories_filled_rate'] == 0.5
        assert completeness['photo_rate'] == 0.5
        assert completeness['chef_note_rate'] == 1.0

    def test_subcategory_items_count_for_their_parent(self, app, client):
        org = _org('co2')
        rid = _site(org, 'CO2')
        _director(rid, org)
        main = _category(rid, 'Plat principal')
        sub = MenuCategory(restaurant_id=rid, label='Protéines', parent_id=main, order=0)
        db.session.add(sub)
        db.session.commit()
        monday, friday = _last_full_week()
        menu_id = _menu(rid, monday, published_at=_utc_naive(monday, 9))
        _item(menu_id, rid, sub.id, 'Poulet rôti')

        body = _publications(client, get_token(client, email='dir@mariam.app'), monday, friday)
        assert body['summary']['completeness']['categories_filled_rate'] == 1.0


class TestOverview:
    def test_an_empty_org_reads_zero_everywhere(self, app, client):
        org = _org('ov1')
        rid = _site(org, 'OV1')
        _director(rid, org)
        res = client.get(
            '/v1/analytics/overview', headers=auth_headers(get_token(client, email='dir@mariam.app'))
        )
        assert res.status_code == 200
        kpis = res.get_json()['kpis']
        assert kpis['views']['value'] == 0
        assert kpis['unique_visitors']['value'] == 0
        assert kpis['satisfaction']['value'] is None
        assert kpis['participation_rate']['value'] is None
        assert kpis['publication_rate']['value'] == 0.0

    def test_delta_compares_with_the_previous_period(self, app, client):
        org = _org('ov2')
        rid = _site(org, 'OV2')
        _director(rid, org)
        # A full week: the previous window then lines up with the week before it.
        monday, _ = _last_full_week()
        sunday = monday + datetime.timedelta(days=6)
        previous_monday = monday - datetime.timedelta(days=7)
        for offset in range(5):
            day = monday + datetime.timedelta(days=offset)
            _menu(rid, day, published_at=_utc_naive(day, 9))
        for offset in range(2):
            day = previous_monday + datetime.timedelta(days=offset)
            _menu(rid, day, published_at=_utc_naive(day, 9))

        res = client.get(
            f'/v1/analytics/overview?start={monday.isoformat()}&end={sunday.isoformat()}',
            headers=auth_headers(get_token(client, email='dir@mariam.app')),
        )
        publication = res.get_json()['kpis']['publication_rate']
        assert publication['value'] == 1.0
        assert publication['previous'] == 0.4
        assert publication['delta'] == 0.6

    def test_last_published_at_is_reported_per_site(self, app, client):
        org = _org('ov3')
        rid = _site(org, 'OV3')
        _director(rid, org)
        monday, _ = _last_full_week()
        _menu(rid, monday, published_at=_utc_naive(monday, 9))

        res = client.get(
            '/v1/analytics/overview',
            headers=auth_headers(get_token(client, email='dir@mariam.app')),
        )
        site = res.get_json()['sites'][0]
        assert site['last_published_at'].startswith(monday.isoformat())


class TestAnalyticsTenantIsolation:
    def test_another_org_menus_never_count(self, app, client):
        org_a = _org('iso-a')
        rid_a = _site(org_a, 'ISOA')
        _director(rid_a, org_a, email='dira@mariam.app')

        org_b = _org('iso-b')
        rid_b = _site(org_b, 'ISOB')
        monday, friday = _last_full_week()
        for offset in range(5):
            day = monday + datetime.timedelta(days=offset)
            _menu(rid_b, day, published_at=_utc_naive(day, 9))

        body = _publications(client, get_token(client, email='dira@mariam.app'), monday, friday)
        assert [row['site_id'] for row in body['sites']] == [rid_a]
        assert body['summary']['publication_rate'] == 0.0
