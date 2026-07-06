"""
Tests du centre de notifications in-app : listing, compteur, lecture, préférences.
"""
from conftest import auth_headers, get_token, make_restaurant, make_user

from app.extensions import db
from app.models.notification import Notification


def _make_notification(restaurant_id, title='Alerte test', user_id=None, **kwargs):
    notif = Notification.create(
        restaurant_id=restaurant_id,
        type='info',
        title=title,
        body='Corps du message',
        user_id=user_id,
        **kwargs,
    )
    db.session.commit()
    return notif.id


class TestInboxListing:
    def test_list_requires_auth(self, client):
        assert client.get('/v1/inbox').status_code == 401

    def test_list_notifications(self, app, client):
        rid = make_restaurant(app)
        make_user(app, restaurant_id=rid)
        token = get_token(client)
        _make_notification(rid, title='Première')
        _make_notification(rid, title='Seconde')
        res = client.get('/v1/inbox', headers=auth_headers(token))
        assert res.status_code == 200
        assert len(res.get_json()['notifications']) == 2

    def test_user_specific_notification_hidden_from_others(self, app, client):
        rid = make_restaurant(app)
        uid_a = make_user(app, email='a@mariam.app', restaurant_id=rid)
        make_user(app, email='b@mariam.app', restaurant_id=rid)
        _make_notification(rid, title='Broadcast')
        _make_notification(rid, title='Privée', user_id=uid_a)
        token_b = get_token(client, email='b@mariam.app')
        titles = [n['title'] for n in
                  client.get('/v1/inbox', headers=auth_headers(token_b)).get_json()['notifications']]
        assert titles == ['Broadcast']

    def test_other_restaurant_notifications_hidden(self, app, client):
        rid_a = make_restaurant(app, name='RU A', code='RU_A')
        rid_b = make_restaurant(app, name='RU B', code='RU_B')
        make_user(app, email='b@mariam.app', restaurant_id=rid_b)
        _make_notification(rid_a, title='Restaurant A')
        token_b = get_token(client, email='b@mariam.app')
        res = client.get('/v1/inbox', headers=auth_headers(token_b))
        assert res.get_json()['notifications'] == []


class TestInboxReadState:
    def test_unread_count(self, app, client):
        rid = make_restaurant(app)
        make_user(app, restaurant_id=rid)
        token = get_token(client)
        _make_notification(rid)
        _make_notification(rid)
        res = client.get('/v1/inbox/unread-count', headers=auth_headers(token))
        assert res.status_code == 200
        assert res.get_json()['count'] == 2

    def test_mark_read(self, app, client):
        rid = make_restaurant(app)
        make_user(app, restaurant_id=rid)
        token = get_token(client)
        notif_id = _make_notification(rid)
        res = client.put(f'/v1/inbox/{notif_id}/read', headers=auth_headers(token))
        assert res.status_code == 200
        count = client.get('/v1/inbox/unread-count',
                           headers=auth_headers(token)).get_json()['count']
        assert count == 0

    def test_mark_all_read(self, app, client):
        rid = make_restaurant(app)
        make_user(app, restaurant_id=rid)
        token = get_token(client)
        _make_notification(rid)
        _make_notification(rid)
        res = client.put('/v1/inbox/read-all', headers=auth_headers(token))
        assert res.status_code == 200
        count = client.get('/v1/inbox/unread-count',
                           headers=auth_headers(token)).get_json()['count']
        assert count == 0

    def test_delete_notification(self, app, client):
        rid = make_restaurant(app)
        make_user(app, restaurant_id=rid)
        token = get_token(client)
        notif_id = _make_notification(rid)
        res = client.delete(f'/v1/inbox/{notif_id}', headers=auth_headers(token))
        assert res.status_code == 204
        assert client.get('/v1/inbox',
                          headers=auth_headers(token)).get_json()['notifications'] == []

    def test_cannot_touch_other_restaurant_notification(self, app, client):
        rid_a = make_restaurant(app, name='RU A', code='RU_A')
        rid_b = make_restaurant(app, name='RU B', code='RU_B')
        make_user(app, email='b@mariam.app', restaurant_id=rid_b)
        notif_id = _make_notification(rid_a)
        token_b = get_token(client, email='b@mariam.app')
        assert client.put(f'/v1/inbox/{notif_id}/read',
                          headers=auth_headers(token_b)).status_code == 404
        assert client.delete(f'/v1/inbox/{notif_id}',
                             headers=auth_headers(token_b)).status_code == 404


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


class TestLiveAlerts:
    def test_menu_unpublished_alert(self, app, client):
        rid = make_restaurant(app)
        make_user(app, restaurant_id=rid)
        token = get_token(client)
        res = client.get('/v1/inbox/live-alerts', headers=auth_headers(token))
        assert res.status_code == 200
        keys = [a['key'] for a in res.get_json()['alerts']]
        assert any(k.startswith('menu_unpublished:') for k in keys)
