"""Web Push subscriptions of a site: which endpoints are accepted, and where the server posts."""
from types import SimpleNamespace

import pytest

from app.extensions import db
from app.models import PushSubscription, Restaurant
from app.models.push_subscription import endpoint_fingerprint
from app.services import notification_service
from app.utils.push_endpoint import is_push_service_url
from conftest import make_restaurant, site_path

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


def _path(rid, endpoint=FCM):
    return f'{site_path(rid)}/push-subscriptions/{endpoint_fingerprint(endpoint)}'


def _subscribe(client, rid, endpoint=FCM, **fields):
    return client.put(_path(rid, endpoint), json={'endpoint': endpoint, 'keys': KEYS, **fields})


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


class TestPushKey:
    def test_without_a_key_push_is_unavailable(self, client, monkeypatch):
        monkeypatch.delenv('VAPID_PUBLIC_KEY', raising=False)

        assert client.get('/v1/push-key').get_json()['code'] == 'push_unavailable'

    def test_the_public_key_is_served(self, client, monkeypatch):
        monkeypatch.setenv('VAPID_PUBLIC_KEY', 'BPublicKey')

        assert client.get('/v1/push-key').get_json() == {'public_key': 'BPublicKey'}


class TestSubscribe:
    def test_a_browser_subscription_is_stored_then_replaced(self, app, client):
        rid = make_restaurant(app)

        created = _subscribe(client, rid, platform='android', notify_events=False)
        padded = {'p256dh': KEYS['p256dh'] + '=', 'auth': KEYS['auth'] + '=='}
        replaced = client.put(_path(rid), json={'endpoint': FCM, 'keys': padded})

        assert (created.status_code, replaced.status_code) == (201, 200)
        assert created.get_json()['id'] == endpoint_fingerprint(FCM)
        sub = PushSubscription.query.one()
        assert (sub.restaurant_id, sub.platform, sub.notify_events) == (rid, None, True)
        assert sub.get_subscription_info()['keys'] == padded

    def test_subscribing_on_another_site_moves_it_there(self, app, client):
        first = make_restaurant(app)
        second = make_restaurant(app, name='RU Nord', code='RU_NORD')
        _subscribe(client, first)

        res = _subscribe(client, second)

        assert res.status_code == 200
        assert PushSubscription.query.one().restaurant_id == second
        assert client.get(_path(first)).get_json()['code'] == 'subscription_not_found'

    def test_the_address_must_be_the_endpoints_fingerprint(self, app, client):
        rid = make_restaurant(app)

        res = client.put(_path(rid, WNS), json={'endpoint': FCM, 'keys': KEYS})

        assert res.get_json()['code'] == 'subscription_id_mismatch'
        assert PushSubscription.query.count() == 0

    def test_a_row_written_without_fingerprint_is_found_by_its_endpoint(self, app, client):
        rid = make_restaurant(app)
        db.session.add(PushSubscription(restaurant_id=rid, endpoint=FCM, **KEYS))
        db.session.commit()

        res = _subscribe(client, rid)

        assert res.status_code == 200
        assert PushSubscription.query.one().endpoint_sha256 == endpoint_fingerprint(FCM)

    @pytest.mark.parametrize('body', [
        {'endpoint': INTERNAL, 'keys': KEYS},
        {'endpoint': FCM, 'keys': {**KEYS, 'p256dh': 'x' * 2_000_000}},
        {'endpoint': FCM, 'keys': {**KEYS, 'auth': 'A' * 21}},
        {'endpoint': FCM, 'keys': {**KEYS, 'auth': 'A' * 21 + '+'}},
        {'endpoint': FCM, 'keys': {**KEYS, 'auth': KEYS['auth'] + '\n'}},
        {'endpoint': FCM, 'keys': {'p256dh': KEYS['p256dh']}},
        {'endpoint': FCM, 'keys': 'p256dh'},
        {'endpoint': FCM, 'keys': KEYS, 'platform': 'x' * 21},
        {'endpoint': FCM, 'keys': KEYS, 'notify_today_menu_time': '25:00'},
        {'keys': KEYS},
        [FCM],
    ])
    def test_a_malformed_subscription_is_refused_and_stores_nothing(self, app, client, body):
        rid = make_restaurant(app)

        res = client.put(_path(rid), json=body)

        assert res.status_code == 422
        assert PushSubscription.query.count() == 0

    def test_a_closed_site_takes_no_subscription(self, app, client):
        rid = make_restaurant(app)
        db.session.get(Restaurant, rid).is_active = False
        db.session.commit()

        res = _subscribe(client, rid)

        assert res.get_json()['code'] == 'site_not_found'
        assert PushSubscription.query.count() == 0


class TestBySubscription:
    def test_preferences_are_read_and_changed(self, app, client):
        rid = make_restaurant(app)
        _subscribe(client, rid, WNS)

        changed = client.patch(
            _path(rid, WNS), json={'notify_events': False, 'notify_today_menu_time': '12:15'}
        )
        read = client.get(_path(rid, WNS)).get_json()

        assert changed.status_code == 200
        assert (read['notify_events'], read['notify_today_menu_time']) == (False, '12:15')

    def test_a_subscription_is_removed(self, app, client):
        rid = make_restaurant(app)
        _subscribe(client, rid)

        assert client.delete(_path(rid)).status_code == 204
        assert PushSubscription.query.count() == 0

    def test_an_unknown_subscription_is_not_found(self, app, client):
        rid = make_restaurant(app)
        path = _path(rid)

        answers = {
            client.get(path).status_code,
            client.patch(path, json={'notify_events': False}).status_code,
            client.delete(path).status_code,
        }

        assert answers == {404}


class TestSending:
    def test_a_test_notification_goes_to_the_stored_subscription(self, app, client, outbound):
        rid = make_restaurant(app)
        _subscribe(client, rid)

        res = client.post(f'{_path(rid)}/test')

        assert res.status_code == 204
        assert outbound == [FCM]

    def test_an_unknown_subscription_posts_nowhere(self, app, client, outbound):
        rid = make_restaurant(app)

        res = client.post(f'{_path(rid)}/test', json={'endpoint': FCM, 'keys': KEYS})

        assert res.status_code == 404
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
