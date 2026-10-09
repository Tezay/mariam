"""In-app alerts over HTTP, and the preferences that filter them."""
import pytest

from app.extensions import db
from app.models import ExceptionalClosure, Restaurant, User
from app.utils.time import paris_today
from conftest import auth_headers, get_token, make_restaurant, make_user


def _serving_today(restaurant_id: int) -> int:
    """Pin the weekly schedule so the alert does not depend on the run date."""
    restaurant = db.session.get(Restaurant, restaurant_id)
    restaurant.service_days = list(range(7))
    db.session.commit()
    return restaurant_id


class TestInboxPreferences:
    def test_get_default_preferences(self, app, client):
        rid = make_restaurant(app)
        make_user(app, restaurant_id=rid)
        token = get_token(client)
        res = client.get('/v1/inbox/notification-preferences', headers=auth_headers(token))
        assert res.status_code == 200
        prefs = res.get_json()
        assert prefs['notify_menu_unpublished'] is True
        assert prefs['holiday_alert_days_before'] == 5

    def test_update_preferences(self, app, client):
        rid = make_restaurant(app)
        make_user(app, restaurant_id=rid)
        token = get_token(client)
        res = client.put('/v1/inbox/notification-preferences',
                         json={'notify_menu_unpublished': False,
                               'holiday_alert_days_before': 3,
                               'inconnu': 'ignoré'},
                         headers=auth_headers(token))
        assert res.status_code == 200
        prefs = client.get('/v1/inbox/notification-preferences',
                           headers=auth_headers(token)).get_json()
        assert prefs['notify_menu_unpublished'] is False
        assert prefs['holiday_alert_days_before'] == 3
        assert 'inconnu' not in prefs

    @pytest.mark.parametrize('change', [
        {'holiday_alert_days_before': 'abc'},
        {'holiday_alert_days_before': 0},
        {'holiday_alert_days_before': 31},
        {'digest_day': 7},
        {'digest_hour': 5},
        {'notify_menu_unpublished': 'x' * 100},
        ['weekly_digest'],
    ])
    def test_a_malformed_change_is_refused_and_stores_nothing(self, app, client, change):
        rid = make_restaurant(app)
        uid = make_user(app, restaurant_id=rid)
        token = get_token(client)

        res = client.put(
            '/v1/inbox/notification-preferences', json=change, headers=auth_headers(token)
        )

        assert res.status_code == 422
        assert db.session.get(User, uid).notification_preferences is None


class TestLiveAlerts:
    def test_menu_unpublished_alert(self, app, client):
        rid = _serving_today(make_restaurant(app))
        make_user(app, restaurant_id=rid)
        token = get_token(client)
        res = client.get('/v1/inbox/live-alerts', headers=auth_headers(token))
        assert res.status_code == 200
        keys = [a['key'] for a in res.get_json()['alerts']]
        assert any(k.startswith('menu_unpublished:') for k in keys)

    def test_no_menu_alert_when_the_site_does_not_serve_today(self, app, client):
        """A missing menu is only a gap on a day the restaurant opens."""
        rid = make_restaurant(app)
        restaurant = db.session.get(Restaurant, rid)
        restaurant.service_days = [(paris_today().weekday() + 1) % 7]
        db.session.commit()
        make_user(app, restaurant_id=rid)
        token = get_token(client)

        res = client.get('/v1/inbox/live-alerts', headers=auth_headers(token))

        keys = [a['key'] for a in res.get_json()['alerts']]
        assert not any(k.startswith('menu_unpublished:') for k in keys)

    def test_no_menu_alert_during_an_exceptional_closure(self, app, client):
        rid = _serving_today(make_restaurant(app))
        today = paris_today()
        db.session.add(
            ExceptionalClosure(
                restaurant_id=rid, start_date=today, end_date=today, is_active=True
            )
        )
        db.session.commit()
        make_user(app, restaurant_id=rid)
        token = get_token(client)

        res = client.get('/v1/inbox/live-alerts', headers=auth_headers(token))

        keys = [a['key'] for a in res.get_json()['alerts']]
        assert not any(k.startswith('menu_unpublished:') for k in keys)
