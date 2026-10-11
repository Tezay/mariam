"""Web Push subscriptions: which endpoints are accepted, and where the server posts."""
from types import SimpleNamespace

import pytest

from app.extensions import db
from app.models import PushSubscription, Restaurant
from app.services import notification_service
from app.utils.push_endpoint import is_push_service_url
from conftest import make_restaurant

FCM = 'https://fcm.googleapis.com/fcm/send/dX9fKq:APA91b'
WNS = 'https://wns2-par02p.notify.windows.com/w/?token=BQYAAAD%2f&ttl=1'
INTERNAL = 'http://127.0.0.1:6379/'
KEYS = {'p256dh': 'A' * 87, 'auth': 'A' * 22}


@pytest.fixture()
def outbound(monkeypatch):
    """The endpoints the server posted to, recorded in place of the network."""
    posted = []

    def webpush(subscription_info, **_):
        posted.append(subscription_info['endpoint'])
        return SimpleNamespace(status_code=201)

    monkeypatch.setenv('VAPID_PRIVATE_KEY', 'not-a-real-key')
    monkeypatch.setattr(notification_service, 'webpush', webpush)
    return posted


class TestEndpointRule:
    @pytest.mark.parametrize('url', [
        FCM,
        'https://jmt17.google.com/fcm/send/dX9fKq:APA91b',
        'https://updates.push.services.mozilla.com/wpush/v2/gAAAAABl',
        'https://web.push.apple.com/QGk3a9',
        WNS,
    ])
    def test_a_browser_push_service_is_accepted(self, url):
        assert is_push_service_url(url)

    @pytest.mark.parametrize('url', [
        '',
        INTERNAL,
        'http://fcm.googleapis.com/fcm/send/x',
        'https://127.0.0.1/',
        'https://localhost/',
        'https://fcm.googleapis.com',
        'https://fcm.googleapis.com:8443/fcm/send/x',
        'https://fcm.googleapis.com@127.0.0.1/',
        'https://fcm.googleapis.com\\@127.0.0.1/',
        'https://fcm.googleapis.com#@127.0.0.1/',
        'https://fcm.googleapis.com.example.org/fcm/send/x',
        'https://FCM.googleapis.com/fcm/send/x',
        'https://storage.googleapis.com/bucket/x',
        'https://push.apple.com/x',
        'https://fauxpush.apple.com/x',
        'https://web.push.apple.com.example.org/x',
        'https://fcm.googleapis.com/fcm/send/x\n',
        'https://fcm.googleapis.com/fcm send',
        'https://fcm.googleapis.com/' + 'x' * 2048,
    ])
    def test_anything_else_is_refused(self, url):
        assert not is_push_service_url(url)


class TestSubscribe:
    def test_a_browser_subscription_is_stored_then_updated(self, app, client):
        rid = make_restaurant(app)
        body = {'endpoint': FCM, 'keys': KEYS, 'platform': 'android', 'restaurant_id': rid}

        assert client.post('/v1/notifications/subscribe', json=body).status_code == 201
        padded = {'p256dh': KEYS['p256dh'] + '=', 'auth': KEYS['auth'] + '=='}
        res = client.post('/v1/notifications/subscribe', json={**body, 'keys': padded})

        assert res.status_code == 200
        sub = PushSubscription.query.one()
        assert (sub.endpoint, sub.restaurant_id, sub.platform) == (FCM, rid, 'android')
        assert sub.get_subscription_info()['keys'] == padded

    def test_the_default_restaurant_is_followed_when_none_is_named(self, app, client):
        rid = make_restaurant(app)

        res = client.post('/v1/notifications/subscribe', json={'endpoint': FCM, 'keys': KEYS})

        assert res.status_code == 201
        assert PushSubscription.query.one().restaurant_id == rid

    @pytest.mark.parametrize('body', [
        {'endpoint': INTERNAL, 'keys': KEYS},
        {'endpoint': FCM, 'keys': {**KEYS, 'p256dh': 'x' * 2_000_000}},
        {'endpoint': FCM, 'keys': {**KEYS, 'auth': 'A' * 21}},
        {'endpoint': FCM, 'keys': {**KEYS, 'auth': 'A' * 21 + '+'}},
        {'endpoint': FCM, 'keys': {**KEYS, 'auth': KEYS['auth'] + '\n'}},
        {'endpoint': FCM, 'keys': {'p256dh': KEYS['p256dh']}},
        {'endpoint': FCM, 'keys': 'p256dh'},
        {'endpoint': FCM, 'keys': KEYS, 'platform': 'x' * 21},
        {'keys': KEYS},
        [FCM],
    ])
    def test_a_malformed_subscription_is_refused_and_stores_nothing(self, app, client, body):
        make_restaurant(app)

        res = client.post('/v1/notifications/subscribe', json=body)

        assert res.status_code == 422
        assert PushSubscription.query.count() == 0

    def test_an_unknown_or_inactive_restaurant_is_not_found(self, app, client):
        rid = make_restaurant(app)
        db.session.get(Restaurant, rid).is_active = False
        db.session.commit()

        for restaurant_id in (rid, rid + 1, None):
            res = client.post('/v1/notifications/subscribe', json={
                'endpoint': FCM, 'keys': KEYS, 'restaurant_id': restaurant_id,
            })
            assert res.status_code == 404

        assert PushSubscription.query.count() == 0


class TestByEndpoint:
    def test_preferences_are_read_and_changed(self, app, client):
        make_restaurant(app)
        client.post('/v1/notifications/subscribe', json={'endpoint': WNS, 'keys': KEYS})

        changed = client.put('/v1/notifications/preferences', json={
            'endpoint': WNS,
            'preferences': {'notify_events': False, 'notify_today_menu_time': '12:15'},
        })
        read = client.get('/v1/notifications/preferences', query_string={'endpoint': WNS})

        assert (changed.status_code, read.status_code) == (200, 200)
        subscription = read.get_json()['subscription']
        assert subscription['notify_events'] is False
        assert subscription['notify_today_menu_time'] == '12:15'

    def test_a_subscription_is_removed(self, app, client):
        make_restaurant(app)
        client.post('/v1/notifications/subscribe', json={'endpoint': FCM, 'keys': KEYS})

        res = client.delete('/v1/notifications/unsubscribe', json={'endpoint': FCM})

        assert res.status_code == 200
        assert PushSubscription.query.count() == 0

    @pytest.mark.parametrize('named, answer', [
        ({'endpoint': FCM}, 404),
        ({'endpoint': INTERNAL}, 422),
        ({'endpoint': FCM + '\x00'}, 422),
        ({}, 422),
    ])
    def test_an_endpoint_is_looked_up_only_on_a_push_service(self, client, named, answer):
        answers = {
            client.get('/v1/notifications/preferences', query_string=named).status_code,
            client.put(
                '/v1/notifications/preferences', json={**named, 'preferences': {}}
            ).status_code,
            client.delete('/v1/notifications/unsubscribe', json=named).status_code,
        }

        assert answers == {answer}

    def test_a_body_that_is_no_object_is_refused(self, client):
        assert client.put('/v1/notifications/preferences', json=[FCM]).status_code == 422
        assert client.delete('/v1/notifications/unsubscribe', json=[FCM]).status_code == 422


class TestSending:
    def test_a_test_notification_goes_to_the_push_service(self, client, outbound):
        res = client.post('/v1/notifications/test', json={'endpoint': FCM, 'keys': KEYS})

        assert res.status_code == 200
        assert outbound == [FCM]

    @pytest.mark.parametrize('body', [
        {'endpoint': INTERNAL, 'keys': KEYS},
        {'endpoint': FCM, 'keys': {**KEYS, 'p256dh': 'x' * 2_000_000}},
        {'endpoint': FCM},
        [FCM],
    ])
    def test_a_malformed_test_request_posts_nowhere(self, client, outbound, body):
        res = client.post('/v1/notifications/test', json=body)

        assert res.status_code == 422
        assert outbound == []

    def test_a_stored_endpoint_off_the_list_is_dropped_unsent(self, app, outbound):
        rid = make_restaurant(app)
        db.session.add(PushSubscription(restaurant_id=rid, endpoint=INTERNAL, **KEYS))
        db.session.add(PushSubscription(restaurant_id=rid, endpoint=FCM, **KEYS))
        db.session.commit()

        sent = [
            notification_service.send_push_notification(sub.get_subscription_info(), {'title': 'Menu'})
            for sub in PushSubscription.query.order_by(PushSubscription.id).all()
        ]

        assert sent == [False, True]
        assert outbound == [FCM]
        assert [sub.endpoint for sub in PushSubscription.query.all()] == [FCM]
