"""Where a push notification takes its reader: the public page of its site."""
from datetime import time, timedelta

import pytest

from app.extensions import db
from app.models import Event, ExceptionalClosure, PushSubscription
from app.models.push_subscription import endpoint_fingerprint
from app.routes import push_subscriptions
from app.services import notification_service
from app.utils.time import paris_now, paris_today
from conftest import auth_headers, get_token, make_category, make_restaurant, make_user, site_path

ENDPOINT = 'https://fcm.googleapis.com/fcm/send/a'
KEYS = {'p256dh': 'A' * 87, 'auth': 'A' * 22}
NOW = paris_now().replace(second=0, microsecond=0)


@pytest.fixture()
def pushed(monkeypatch):
    """The payloads sent, in place of the push services."""
    sent = []
    for module in (notification_service, push_subscriptions):
        monkeypatch.setattr(
            module, 'send_push_notification', lambda _info, payload: sent.append(payload) or True
        )
    monkeypatch.setattr(notification_service, 'paris_now', lambda: NOW)
    monkeypatch.setattr(notification_service, 'paris_today', lambda: NOW.date())
    monkeypatch.setattr(notification_service, '_acquire_lock', lambda *_, **__: True)
    return sent


def _site_with_menu(app, client, day):
    rid = make_restaurant(app, code='RU_A')
    make_user(app, email='a@mariam.app', restaurant_id=rid)
    headers = auth_headers(get_token(client, email='a@mariam.app'))
    item = {'category_id': make_category(app, rid), 'name': 'Poulet rôti'}
    path = f'{site_path(rid)}/menus/{day.isoformat()}'
    client.put(path, json={'items': [item], 'chef_note': None}, headers=headers)
    assert client.post(f'{path}/publish', headers=headers).status_code == 200
    return rid


def _subscriber(rid, **preferences):
    db.session.add(PushSubscription(
        restaurant_id=rid, endpoint=ENDPOINT, endpoint_sha256=endpoint_fingerprint(ENDPOINT),
        **KEYS, **preferences,
    ))
    db.session.commit()


def test_the_menu_of_the_day_opens_the_page(app, client, pushed):
    rid = _site_with_menu(app, client, NOW.date())
    _subscriber(rid, notify_today_menu_time=time(NOW.hour, NOW.minute))

    notification_service.check_and_send_notifications(app)

    assert [payload['url'] for payload in pushed] == ['/ru-a']


def test_the_menu_of_tomorrow_opens_that_day(app, client, pushed):
    tomorrow = NOW.date() + timedelta(days=1)
    rid = _site_with_menu(app, client, tomorrow)
    _subscriber(
        rid, notify_today_menu=False,
        notify_tomorrow_menu=True, notify_tomorrow_menu_time=time(NOW.hour, NOW.minute),
    )

    notification_service.check_and_send_notifications(app)

    assert [payload['url'] for payload in pushed] == [f'/ru-a?date={tomorrow.isoformat()}']


def test_events_and_closures_open_the_page(app, pushed):
    rid = make_restaurant(app, code='RU_A')
    tomorrow = paris_today() + timedelta(days=1)
    db.session.add(Event(restaurant_id=rid, title='Repas à thème', event_date=tomorrow,
                         status='published'))
    db.session.add(ExceptionalClosure(restaurant_id=rid, start_date=tomorrow, end_date=tomorrow))
    _subscriber(rid)

    notification_service._check_event_notifications(db, NOW, 0)
    notification_service._check_closure_notifications(db, NOW, 0)

    assert [payload['url'] for payload in pushed] == ['/ru-a', '/ru-a']


def test_the_test_notification_opens_the_page(app, client, pushed):
    rid = make_restaurant(app, code='RU_A')
    _subscriber(rid)

    res = client.post(f'{site_path(rid)}/push-subscriptions/{endpoint_fingerprint(ENDPOINT)}/test')

    assert res.status_code == 204
    assert [payload['url'] for payload in pushed] == ['/ru-a']
