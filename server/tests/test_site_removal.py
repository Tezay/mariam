"""`flask site delete`: a disabled site goes, with every row and file of it, and nothing else."""
from datetime import date, datetime, timedelta

import pytest
from sqlalchemy import func, select

from app.extensions import db
from app.models import (
    ActivationLink,
    AuditLog,
    Certification,
    DietaryTag,
    EgalimDeclaration,
    Event,
    EventImage,
    ExceptionalClosure,
    ImportSession,
    Menu,
    PushSubscription,
    Restaurant,
    RestaurantCalendarSettings,
    RestaurantPhoto,
    SubscriptionReminder,
    User,
)
from app.services import site_removal, telemetry
from app.utils.time import paris_today
from conftest import TEST_ORG_SLUG, FakeRedis, join_site, make_restaurant, make_user


def _delete(app, path, *args, input=None):
    org, site = path.split('/')
    return app.test_cli_runner().invoke(
        args=['site', 'delete', site, '--org', org, *args], input=input
    )


def _disable(site_id):
    db.session.get(Restaurant, site_id).is_active = False
    db.session.commit()


def _rows_of(site_id) -> dict[str, int]:
    """Rows still pointing at the site, in every table with a key to `restaurants`."""
    counts = {}
    for table in db.metadata.sorted_tables:
        for key in table.foreign_keys:
            if key.column.table.name == 'restaurants':
                query = select(func.count()).select_from(table).where(key.parent == site_id)
                counts[f'{table.name}.{key.parent.name}'] = db.session.execute(query).scalar()
    return counts


class TestAFullSite:
    def test_nothing_of_it_is_left_and_its_neighbour_is_untouched(self, app, bucket):
        seeded = app.test_cli_runner().invoke(args=['seed-demo', '--password', 'demo-password-1'])
        assert seeded.exit_code == 0, seeded.output
        nord = Restaurant.query.filter_by(slug='nord').one()
        demo = Restaurant.query.filter_by(slug='demo').one()
        event = Event.query.filter_by(restaurant_id=nord.id).first() or Event(
            restaurant_id=nord.id, title='Fête', event_date=date.today()
        )
        db.session.add(event)
        db.session.flush()
        member = make_user(app, email='only@mariam.app', restaurant_id=nord.id)
        nord.enabled_certifications.append(Certification.query.first())
        nord.enabled_tags.append(DietaryTag.query.first())
        db.session.add_all([
            EgalimDeclaration(restaurant_id=nord.id, year=2026, sustainable_share=50,
                              organic_share=20),
            ExceptionalClosure(restaurant_id=nord.id, start_date=date.today(),
                               end_date=date.today()),
            ImportSession(id='0' * 36, user_id=member, restaurant_id=nord.id, kind='menus',
                          filename='menus.csv', columns=[], rows=[]),
            RestaurantCalendarSettings(restaurant_id=nord.id),
            EventImage(event_id=event.id, storage_key='news/a.jpg', url='https://i/a.jpg'),
            RestaurantPhoto(restaurant_id=nord.id, storage_key='photos/b.jpg',
                            url='https://i/b.jpg', alt='Salle'),
            ActivationLink(token='t' * 40, link_type='invite', restaurant_id=nord.id,
                           expires_at=datetime.now() + timedelta(days=1)),
            PushSubscription(restaurant_id=nord.id, endpoint='https://push.example/1',
                             p256dh='k', auth='a'),
            AuditLog(action='menu_publish', restaurant_id=nord.id,
                     organization_id=nord.organization_id),
            SubscriptionReminder(restaurant_id=nord.id, ends_on=date.today(), days=30),
        ])
        db.session.commit()
        demo_menus = Menu.query.filter_by(restaurant_id=demo.id).count()
        empty = sorted(name for name, count in _rows_of(nord.id).items() if not count)
        assert not empty, ' '.join(empty)
        _disable(nord.id)

        result = _delete(app, 'demo/nord', '--yes')

        assert result.exit_code == 0, result.output
        assert db.session.get(Restaurant, nord.id) is None
        assert {name: count for name, count in _rows_of(nord.id).items() if count} == {}
        assert Menu.query.filter_by(restaurant_id=demo.id).count() == demo_menus
        assert {'news/a.jpg', 'photos/b.jpg'} <= set(bucket.deleted)


@pytest.fixture()
def site(app):
    site_id = make_restaurant(app, name='RU Nord', code='RU_NORD')
    _disable(site_id)
    return site_id


PATH = f'{TEST_ORG_SLUG}/ru-nord'


class TestItsAccounts:
    def test_an_account_it_was_the_only_place_of_goes_the_others_only_lose_it(self, app, site):
        other = make_restaurant(app, name='RU Sud', code='RU_SUD')
        only = make_user(app, email='only@mariam.app', restaurant_id=site)
        both = make_user(app, email='both@mariam.app', restaurant_id=site)
        join_site(both, other, 'editor')
        organization = db.session.get(Restaurant, site).organization_id
        supervisor = make_user(app, email='sup@mariam.app', role='org_admin',
                               organization_id=organization)

        result = _delete(app, PATH, '--yes')

        assert result.exit_code == 0, result.output
        assert db.session.get(User, only) is None
        kept = db.session.get(User, both)
        assert [m.restaurant_id for m in kept.memberships] == [other]
        assert kept.restaurant_id == other
        assert db.session.get(User, supervisor) is not None

    def test_the_organization_keeps_a_trace_of_it(self, app, site):
        _delete(app, PATH, '--yes')

        (entry,) = AuditLog.query.filter_by(action='site_delete').all()
        assert (entry.restaurant_id, entry.target_id) == (None, site)
        assert '"site": "test-org/ru-nord"' in entry.details


class TestWhatItRefuses:
    def test_an_active_site_is_never_deleted(self, app):
        site_id = make_restaurant(app, name='RU Nord', code='RU_NORD')

        result = _delete(app, PATH, '--yes')

        assert result.exit_code != 0
        assert 'disable it first' in result.output
        assert db.session.get(Restaurant, site_id) is not None

    def test_a_path_typed_back_wrong_deletes_nothing(self, app, site):
        result = _delete(app, PATH, input='test-org/ru-sud\n')

        assert result.exit_code != 0
        assert db.session.get(Restaurant, site) is not None

    def test_the_path_typed_back_deletes_it(self, app, site):
        result = _delete(app, PATH, input=f'{PATH}\n')

        assert result.exit_code == 0, result.output
        assert db.session.get(Restaurant, site) is None


class TestAfterTheCommit:
    def test_its_redis_counters_go_and_those_of_others_stay(self, app, site, monkeypatch):
        fake = FakeRedis()
        monkeypatch.setattr(telemetry, 'get_redis', lambda: fake)
        other = make_restaurant(app, name='RU Sud', code='RU_SUD')
        today = paris_today()
        for site_id in (site, other):
            fake.sadd(telemetry._dirty_key(today), f'r{site_id}')
            fake.hincrby(telemetry._views_key(f'r{site_id}', today), '12:menu_today')

        _delete(app, PATH, '--yes')

        tokens = set().union(*fake.sets.values())
        assert f'r{other}' in tokens and f'r{site}' not in tokens
        assert not [key for key in fake.hashes if f'r{site}:' in key]

    def test_its_files_go_only_once_the_rows_are_gone(self, app, site, bucket, monkeypatch):
        db.session.get(Restaurant, site).logo_storage_key = 'logos/nord.png'
        db.session.commit()
        monkeypatch.setattr(site_removal.db.session, 'commit', _failing)

        result = _delete(app, PATH, '--yes')

        assert result.exit_code != 0
        assert bucket.deleted == []


def _failing():
    raise RuntimeError('commit failed')
