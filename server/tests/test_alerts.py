"""Live alerts: each rule fires on its own threshold, and never across tenants."""
from datetime import timedelta

from app.extensions import db
from app.models import (
    DishCatalog,
    Menu,
    MenuItem,
    Organization,
    PageViewRollup,
    Restaurant,
    User,
)
from app.models.menu_vote import MenuVote
from app.models.telemetry import VisitorDailyUnique
from app.services.alerts import live_alerts
from app.utils.time import paris_today
from conftest import auth_headers, get_token, make_category, make_restaurant, make_user


def _quiet(user, **overrides):
    """Silence every rule but the ones under test."""
    prefs = {key: False for key in user.get_notification_preferences() if key.startswith('notify_')}
    prefs.update(overrides)
    user.notification_preferences = prefs
    db.session.commit()
    return user


def _serves_every_day(restaurant_id):
    restaurant = Restaurant.query.get(restaurant_id)
    restaurant.service_days = [0, 1, 2, 3, 4, 5, 6]
    db.session.commit()


def _published_menu(restaurant_id, day, category_id):
    dish = DishCatalog(restaurant_id=restaurant_id, category_id=category_id, name='Poulet')
    db.session.add(dish)
    menu = Menu(restaurant_id=restaurant_id, date=day, status='published')
    db.session.add(menu)
    db.session.flush()
    db.session.add(
        MenuItem(menu_id=menu.id, category_id=category_id, dish_id=dish.id, order=0)
    )
    db.session.commit()
    return menu


def _views(restaurant_id, day, count, page_kind='today'):
    db.session.add(PageViewRollup(
        restaurant_id=restaurant_id, date=day, hour=12, page_kind=page_kind, views=count
    ))
    db.session.commit()


def _attach_org(restaurant_id, slug='org-alerts'):
    org = Organization.query.filter_by(slug=slug).first()
    if org is None:
        org = Organization(name='Org', slug=slug)
        db.session.add(org)
        db.session.commit()
    Restaurant.query.get(restaurant_id).organization_id = org.id
    db.session.commit()
    return org.id


def _votes(restaurant_id, day, count, rating):
    """A vote hangs from an organization and from the menu it judges."""
    org_id = Restaurant.query.get(restaurant_id).organization_id or _attach_org(restaurant_id)
    menu = Menu.query.filter_by(restaurant_id=restaurant_id, date=day).first()
    if menu is None:
        menu = Menu(restaurant_id=restaurant_id, date=day, status='published')
        db.session.add(menu)
        db.session.commit()
    for index in range(count):
        db.session.add(MenuVote(
            organization_id=org_id, restaurant_id=restaurant_id, menu_id=menu.id, date=day,
            device_id=f'{day}-{index}', rating=rating,
        ))
    db.session.commit()


class TestMenuRules:
    def test_today_without_menu_alerts(self, app, client):
        rid = make_restaurant(app)
        user = User.query.get(make_user(app))
        _serves_every_day(rid)
        _quiet(user, notify_menu_unpublished=True)

        alerts = live_alerts(user, [rid])

        assert [alert['key'].split(':')[0] for alert in alerts] == ['menu_unpublished']

    def test_a_published_menu_silences_it(self, app, client):
        rid = make_restaurant(app)
        user = User.query.get(make_user(app))
        _serves_every_day(rid)
        _published_menu(rid, paris_today(), make_category(app, rid))
        _quiet(user, notify_menu_unpublished=True)

        assert live_alerts(user, [rid]) == []

    def test_a_disabled_preference_silences_it(self, app, client):
        rid = make_restaurant(app)
        user = User.query.get(make_user(app))
        _serves_every_day(rid)
        _quiet(user)

        assert live_alerts(user, [rid]) == []


class TestActivityRules:
    def test_traffic_drop_fires_under_half_the_usual(self, app, client):
        rid = make_restaurant(app)
        user = User.query.get(make_user(app))
        _quiet(user, notify_traffic_drop=True)
        yesterday = paris_today() - timedelta(days=1)
        for week in range(1, 5):
            _views(rid, yesterday - timedelta(weeks=week), 200)
        _views(rid, yesterday, 20)

        alerts = live_alerts(user, [rid])

        assert len(alerts) == 1
        assert alerts[0]['key'].startswith('traffic_drop')

    def test_traffic_drop_ignores_a_quiet_site(self, app, client):
        rid = make_restaurant(app)
        user = User.query.get(make_user(app))
        _quiet(user, notify_traffic_drop=True)
        yesterday = paris_today() - timedelta(days=1)
        for week in range(1, 5):
            _views(rid, yesterday - timedelta(weeks=week), 10)

        assert live_alerts(user, [rid]) == []

    def test_low_satisfaction_needs_enough_votes(self, app, client):
        rid = make_restaurant(app)
        user = User.query.get(make_user(app))
        _quiet(user, notify_low_satisfaction=True)
        _votes(rid, paris_today(), 10, rating=1)

        assert live_alerts(user, [rid]) == []

        _votes(rid, paris_today() - timedelta(days=1), 25, rating=1)
        alerts = live_alerts(user, [rid])

        assert len(alerts) == 1
        assert alerts[0]['key'].startswith('low_satisfaction')

    def test_vote_anomaly_compares_votes_to_visitors(self, app, client):
        rid = make_restaurant(app)
        user = User.query.get(make_user(app))
        _quiet(user, notify_vote_anomaly=True)
        yesterday = paris_today() - timedelta(days=1)
        _votes(rid, yesterday, 40, rating=3)
        db.session.add(VisitorDailyUnique(restaurant_id=rid, date=yesterday, unique_visitors=10))
        db.session.commit()

        alerts = live_alerts(user, [rid])

        assert len(alerts) == 1
        assert alerts[0]['key'].startswith('vote_anomaly')


class TestOrgScope:
    def _org_with_two_sites(self, app):
        org = Organization(name='Org', slug='org-sites')
        db.session.add(org)
        db.session.commit()
        first = make_restaurant(app, name='Créteil', code='RU_A')
        second = make_restaurant(app, name='Villejuif', code='RU_B')
        for rid in (first, second):
            restaurant = Restaurant.query.get(rid)
            restaurant.organization_id = org.id
            restaurant.service_days = [0, 1, 2, 3, 4, 5, 6]
        director = User.query.get(make_user(app, email='dir@mariam.app', role='org_admin',
                                            restaurant_id=first))
        director.restaurant_id = None
        director.organization_id = org.id
        db.session.commit()
        return org.id, first, second, director

    def test_one_entry_per_rule_naming_the_sites(self, app, client):
        _, first, second, director = self._org_with_two_sites(app)
        _quiet(director, notify_menu_unpublished=True)

        alerts = live_alerts(director, [first, second])

        assert len(alerts) == 1
        assert alerts[0]['title'].startswith('2 sites')
        assert alerts[0]['site_names'] == ['Créteil', 'Villejuif']

    def test_site_inactive_is_a_directors_rule(self, app, client):
        _, first, second, director = self._org_with_two_sites(app)
        _quiet(director, notify_site_inactive=True)

        assert len(live_alerts(director, [first, second])) == 1
        # Alone, a site admin would only be told about itself, which helps nobody
        assert live_alerts(director, [first]) == []

    def test_another_organization_never_shows(self, app, client):
        _, first, second, director = self._org_with_two_sites(app)
        stranger = make_restaurant(app, name='Ailleurs', code='RU_X')
        Restaurant.query.get(stranger).service_days = [0, 1, 2, 3, 4, 5, 6]
        db.session.commit()
        _quiet(director, notify_menu_unpublished=True)

        alerts = live_alerts(director, [first, second])

        assert 'Ailleurs' not in alerts[0]['site_names']


class TestEndpoint:
    def test_live_alerts_follow_the_caller(self, app, client):
        rid = make_restaurant(app)
        make_user(app)
        _serves_every_day(rid)
        token = get_token(client)

        res = client.get('/v1/inbox/live-alerts', headers=auth_headers(token))

        assert res.status_code == 200
        keys = [alert['key'].split(':')[0] for alert in res.get_json()['alerts']]
        assert 'menu_unpublished' in keys

    def test_live_alerts_require_a_token(self, client):
        assert client.get('/v1/inbox/live-alerts').status_code == 401
