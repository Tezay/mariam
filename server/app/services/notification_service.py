import json
import logging
import os
from datetime import time, timedelta

from pywebpush import WebPushException, webpush

from ..utils.push_endpoint import is_push_service_url
from ..utils.time import format_date_fr, paris_now, paris_today, weekday_fr
from ..utils.urls import public_page_path
from .redis_client import acquire_job_lock

logger = logging.getLogger(__name__)


def get_vapid_claims():
    return {
        'private_key': os.environ.get('VAPID_PRIVATE_KEY', ''),
        'claims': {
            'sub': f"mailto:{os.environ.get('VAPID_CONTACT_EMAIL', 'contact@mariam.app')}"
        }
    }


def get_vapid_public_key():
    return os.environ.get('VAPID_PUBLIC_KEY', '')


def send_push_notification(subscription_info: dict, payload: dict) -> bool:
    """False when nothing was sent. A subscription whose endpoint is not a push
    service, or one the push service no longer knows (404, 410), is deleted.
    """
    endpoint = subscription_info['endpoint']
    # Checked again where the request leaves: a row can predate the check the
    # routes make.
    if not is_push_service_url(endpoint):
        logger.warning('Subscription dropped, not on a push service: %r', endpoint[:80])
        _remove_subscription(endpoint)
        return False

    vapid = get_vapid_claims()

    if not vapid['private_key']:
        logger.warning("VAPID_PRIVATE_KEY unset, notification skipped")
        return False

    # Urgency and Topic: docs/ARCHITECTURE.md, "Push notifications".
    topic = payload.get('tag', '')
    push_headers: dict[str, str | int | float] = {'Urgency': 'high'}
    if topic:
        # RFC 8030: at most 32 characters of the base64url alphabet.
        push_headers['Topic'] = topic[:32]

    try:
        resp = webpush(
            subscription_info=subscription_info,
            data=json.dumps(payload, ensure_ascii=False),
            vapid_private_key=vapid['private_key'],
            vapid_claims=vapid['claims'],
            timeout=10,
            ttl=86400,
            headers=push_headers,
        )
        logger.debug(
            "Push sent (HTTP %s) to %s",
            resp.status_code,
            endpoint[:80],
        )
        return True

    except WebPushException as e:
        status_code = e.response.status_code if e.response is not None else None

        if status_code in (404, 410):
            # The browser dropped this endpoint.
            logger.info(f"Endpoint gone (HTTP {status_code}), removing it: {endpoint[:80]}...")
            _remove_subscription(endpoint)
            return False

        logger.error(f"Web Push failed (HTTP {status_code}): {e}")
        return False

    except Exception as e:
        logger.error(f"Push failed: {e}")
        return False


def _remove_subscription(endpoint: str):
    from ..extensions import db
    from ..models.push_subscription import PushSubscription

    sub = PushSubscription.query.filter_by(endpoint=endpoint).first()
    if sub:
        db.session.delete(sub)
        db.session.commit()
        logger.info(f"Subscription {sub.id} removed")


def _format_menu_body(menu_items: list[dict]) -> str | None:
    """None when there is nothing to announce."""
    if not menu_items:
        return None

    seen: dict[int | None, str] = {}
    for item in menu_items:
        if item.get('is_out_of_stock'):
            continue
        category_id = item.get('category_id')
        name = (item.get('dish') or {}).get('name', '')
        if category_id not in seen and name:
            seen[category_id] = name

    lines = [f"• {name}" for name in seen.values()]
    return '\n'.join(lines) if lines else None


def build_today_menu_payload(menu_items: list[dict], url: str) -> dict | None:
    """None when there is no menu to announce."""
    body = _format_menu_body(menu_items)
    if body is None:
        return None

    return {
        'title': '\U0001F37D\uFE0F Menu du jour',
        'body': body,
        'icon': '/web-app-manifest-192x192.png',
        'badge': '/favicon-96x96.png',
        'url': url,
        'tag': f"menu-today-{paris_today().isoformat()}",
    }


def build_tomorrow_menu_payload(menu_items: list[dict], url: str) -> dict | None:
    """None when there is no menu to announce."""
    body = _format_menu_body(menu_items)
    if body is None:
        return None

    tomorrow = paris_today() + timedelta(days=1)

    return {
        'title': f'\U0001F37D\uFE0F Menu de demain ({weekday_fr(tomorrow)})',
        'body': body,
        'icon': '/web-app-manifest-192x192.png',
        'badge': '/favicon-96x96.png',
        'url': url,
        'tag': f"menu-tomorrow-{tomorrow.isoformat()}",
    }


def build_event_payload(event_title: str, event_date: str, url: str, tomorrow: bool) -> dict:
    """The reminder a day ahead, or a week ahead."""
    body = f"{'Demain' if tomorrow else 'Dans une semaine'} \u2014 {event_date}"

    return {
        'title': event_title,
        'body': body,
        'icon': '/web-app-manifest-192x192.png',
        'badge': '/favicon-96x96.png',
        'url': url,
        'tag': f"event-{event_title[:20]}-{'tomorrow' if tomorrow else '7days'}",
    }


def check_and_send_notifications(app):
    """Run every minute. A Redis lock keeps two scheduler instances from sending twice."""
    with app.app_context():
        from ..extensions import db
        from ..models.menu import Menu
        from ..models.push_subscription import PushSubscription
        from ..models.restaurant import Restaurant

        now = paris_now()
        current_time = time(now.hour, now.minute)
        today = paris_today()
        tomorrow = today + timedelta(days=1)

        lock_key = f"mariam:notif_lock:{now.strftime('%Y%m%d%H%M')}"
        if not _acquire_lock(lock_key, ttl=55):
            return

        sent_count = 0

        try:
            today_subs = PushSubscription.query.filter(
                PushSubscription.notify_today_menu,
                PushSubscription.notify_today_menu_time == current_time,
            ).all()

            if today_subs:
                # One menu query per site, not per subscriber.
                by_restaurant = {}
                for sub in today_subs:
                    by_restaurant.setdefault(sub.restaurant_id, []).append(sub)

                for restaurant_id, subs in by_restaurant.items():
                    restaurant = db.session.get(Restaurant, restaurant_id)
                    if not restaurant:
                        continue

                    menu = Menu.query.filter_by(
                        restaurant_id=restaurant_id,
                        date=today,
                        status='published'
                    ).first()

                    items = [item.to_dict() for item in menu.items] if menu else []
                    payload = build_today_menu_payload(items, public_page_path(restaurant))

                    if payload is not None:
                        for sub in subs:
                            if send_push_notification(sub.get_subscription_info(), payload):
                                sub.last_notified_at = now
                                sent_count += 1

                db.session.commit()

            tomorrow_subs = PushSubscription.query.filter(
                PushSubscription.notify_tomorrow_menu,
                PushSubscription.notify_tomorrow_menu_time == current_time,
            ).all()

            if tomorrow_subs:
                by_restaurant = {}
                for sub in tomorrow_subs:
                    by_restaurant.setdefault(sub.restaurant_id, []).append(sub)

                for restaurant_id, subs in by_restaurant.items():
                    restaurant = db.session.get(Restaurant, restaurant_id)
                    if not restaurant:
                        continue

                    menu = Menu.query.filter_by(
                        restaurant_id=restaurant_id,
                        date=tomorrow,
                        status='published'
                    ).first()

                    items = [item.to_dict() for item in menu.items] if menu else []
                    payload = build_tomorrow_menu_payload(
                        items, public_page_path(restaurant, tomorrow)
                    )

                    if payload is not None:
                        for sub in subs:
                            if send_push_notification(sub.get_subscription_info(), payload):
                                sub.last_notified_at = now
                                sent_count += 1

                db.session.commit()

            sent_count = _check_event_notifications(db, now, sent_count)

            sent_count = _check_closure_notifications(db, now, sent_count)

        except Exception as e:
            logger.error(f"check_and_send_notifications failed: {e}")
            db.session.rollback()

        if sent_count > 0:
            logger.info(f"{sent_count} push notification(s) sent")


def _check_event_notifications(db, now, sent_count: int) -> int:
    """Send the week and day reminders of published events; returns the updated count."""
    from ..models.event import Event
    from ..models.push_subscription import PushSubscription
    from ..models.restaurant import Restaurant

    today = paris_today()
    target_7d = today + timedelta(days=7)
    target_1d = today + timedelta(days=1)

    events = Event.query.filter(
        Event.status == 'published',
        Event.is_active,
        Event.event_date.in_([target_7d, target_1d]),
    ).all()

    for event in events:
        is_7d = (event.event_date == target_7d) and not event.notified_7d
        is_1d = (event.event_date == target_1d) and not event.notified_1d

        if not is_7d and not is_1d:
            continue

        date_str = format_date_fr(event.event_date, weekday=True, year=False)
        url = public_page_path(db.session.get(Restaurant, event.restaurant_id))
        payload = build_event_payload(event.title, date_str, url, tomorrow=is_1d)

        subs = PushSubscription.query.filter(
            PushSubscription.restaurant_id == event.restaurant_id,
            PushSubscription.notify_events,
        ).all()

        event_sent = 0
        for sub in subs:
            if send_push_notification(sub.get_subscription_info(), payload):
                sub.last_notified_at = now
                event_sent += 1

        if is_7d:
            event.notified_7d = True
        if is_1d:
            event.notified_1d = True

        sent_count += event_sent
        if event_sent:
            logger.info(f"Event '{event.title}' ({'tomorrow' if is_1d else '7days'}) : {event_sent} notification(s)")

    db.session.commit()
    return sent_count


def _check_closure_notifications(db, now, sent_count: int) -> int:
    """Closures go to the subscribers of event reminders: they share notify_events."""
    from ..models.exceptional_closure import ExceptionalClosure
    from ..models.push_subscription import PushSubscription
    from ..models.restaurant import Restaurant
    from ..utils.time import paris_today

    today = paris_today()
    target_7d = today + timedelta(days=7)
    target_1d = today + timedelta(days=1)

    closures = ExceptionalClosure.query.filter(
        ExceptionalClosure.is_active,
        ExceptionalClosure.start_date.in_([target_7d, target_1d]),
    ).all()

    for closure in closures:
        is_7d = (closure.start_date == target_7d) and not closure.notified_7d
        is_1d = (closure.start_date == target_1d) and not closure.notified_1d

        if not is_7d and not is_1d:
            continue

        if closure.start_date == closure.end_date:
            date_label = format_date_fr(closure.start_date, year=False)
        else:
            date_label = (f'du {format_date_fr(closure.start_date, year=False)} '
                          f'au {format_date_fr(closure.end_date, year=False)}')

        reason_suffix = f' — {closure.reason}' if closure.reason else ''
        title = 'Fermeture exceptionnelle'
        body = (f"Demain{reason_suffix}" if is_1d else f"Dans une semaine — {date_label}{reason_suffix}")

        payload = {
            'title': title,
            'body': body,
            'icon': '/web-app-manifest-192x192.png',
            'badge': '/favicon-96x96.png',
            'url': public_page_path(db.session.get(Restaurant, closure.restaurant_id)),
            'tag': f"closure-{closure.id}-{'1d' if is_1d else '7d'}",
        }

        subs = PushSubscription.query.filter(
            PushSubscription.restaurant_id == closure.restaurant_id,
            PushSubscription.notify_events,
        ).all()

        closure_sent = 0
        for sub in subs:
            if send_push_notification(sub.get_subscription_info(), payload):
                sub.last_notified_at = now
                closure_sent += 1

        if is_7d:
            closure.notified_7d = True
        if is_1d:
            closure.notified_1d = True

        sent_count += closure_sent
        if closure_sent:
            logger.info(f"\U0001F6AB Fermeture {date_label} ({'1d' if is_1d else '7d'}) : {closure_sent} notification(s)")

    db.session.commit()
    return sent_count


def _acquire_lock(lock_key: str, ttl: int = 55) -> bool:
    return acquire_job_lock(lock_key, ttl)
