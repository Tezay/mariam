"""Web Push subscriptions of a site's visitors, each named by its endpoint's fingerprint.

Anonymous: only who holds the endpoint, the browser and its push service, can
compute the fingerprint.
"""
from datetime import time

from flask_smorest import Blueprint
from sqlalchemy import or_

from ..extensions import db
from ..models.push_subscription import PushSubscription, endpoint_fingerprint
from ..problems import Problem
from ..schemas.notifications import (
    PushKeySchema,
    PushPreferencesSchema,
    PushSubscriptionInputSchema,
    PushSubscriptionSchema,
)
from ..security import limiter
from ..services.notification_service import get_vapid_public_key, send_push_notification
from ..utils.time import as_utc
from .scope import public_site

push_bp = Blueprint(
    'push', __name__, description="Web Push: a visitor's notifications of a site's menus and events"
)

DEFAULTS = {
    'notify_today_menu': True,
    'notify_today_menu_time': '11:00',
    'notify_tomorrow_menu': False,
    'notify_tomorrow_menu_time': '19:00',
    'notify_events': True,
}
SUBSCRIPTION = '/orgs/<org>/sites/<site>/push-subscriptions/<subscription_id>'


def _time(value: str) -> time:
    hours, minutes = value.split(':')
    return time(int(hours), int(minutes))


def subscription_view(subscription) -> dict:
    return {
        'id': subscription.endpoint_sha256,
        'notify_today_menu': subscription.notify_today_menu,
        'notify_today_menu_time': subscription.notify_today_menu_time.strftime('%H:%M'),
        'notify_tomorrow_menu': subscription.notify_tomorrow_menu,
        'notify_tomorrow_menu_time': subscription.notify_tomorrow_menu_time.strftime('%H:%M'),
        'notify_events': subscription.notify_events,
        'platform': subscription.platform,
        'created_at': as_utc(subscription.created_at),
    }


def _set_preferences(subscription, preferences: dict) -> None:
    for field in ('notify_today_menu', 'notify_tomorrow_menu', 'notify_events'):
        if field in preferences:
            setattr(subscription, field, preferences[field])
    for field in ('notify_today_menu_time', 'notify_tomorrow_menu_time'):
        if field in preferences:
            setattr(subscription, field, _time(preferences[field]))


def _site_subscription(org: str, site: str, subscription_id: str):
    subscription = PushSubscription.query.filter_by(
        endpoint_sha256=subscription_id, restaurant_id=public_site(org, site).id
    ).first()
    if subscription is None:
        raise Problem(404, 'subscription_not_found', 'Abonnement introuvable.')
    return subscription


@push_bp.route('/push-key', methods=['GET'])
@push_bp.doc(security=[])
@limiter.limit('30 per minute')
@push_bp.response(200, PushKeySchema)
def get_push_key():
    """The server's public key, which the browser subscribes with."""
    key = get_vapid_public_key()
    if not key:
        raise Problem(503, 'push_unavailable', "Les notifications ne sont pas disponibles.")
    return {'public_key': key}


@push_bp.route(SUBSCRIPTION, methods=['PUT'])
@push_bp.doc(security=[])
@limiter.limit('10 per minute')
@push_bp.arguments(PushSubscriptionInputSchema)
@push_bp.response(200, PushSubscriptionSchema, description='The subscription replaced, or moved here')
@push_bp.alt_response(201, schema=PushSubscriptionSchema, description="The browser's first subscription")
def put_subscription(body, org: str, site: str, subscription_id: str):
    """Subscribe a browser to the site's notifications.

    `subscription_id` is the fingerprint of `endpoint`. A subscription follows
    one site: subscribing on another site moves it there. Preferences left out
    take their default.
    """
    restaurant = public_site(org, site)
    endpoint = body['endpoint']
    if endpoint_fingerprint(endpoint) != subscription_id:
        raise Problem(
            422, 'subscription_id_mismatch',
            "L'identifiant ne correspond pas à l'adresse de l'abonnement.",
        )
    # Also found by its endpoint: a row written without a fingerprint, by the
    # previous release after a rollback, gets one here.
    subscription = PushSubscription.query.filter(or_(
        PushSubscription.endpoint_sha256 == subscription_id, PushSubscription.endpoint == endpoint
    )).first()
    created = subscription is None
    if created:
        subscription = PushSubscription(endpoint=endpoint)
        db.session.add(subscription)
    subscription.endpoint_sha256 = subscription_id
    subscription.restaurant_id = restaurant.id
    subscription.p256dh = body['keys']['p256dh']
    subscription.auth = body['keys']['auth']
    subscription.platform = body.get('platform')
    _set_preferences(subscription, {**DEFAULTS, **body})
    db.session.commit()
    return subscription_view(subscription), 201 if created else 200


@push_bp.route(SUBSCRIPTION, methods=['GET'])
@push_bp.doc(security=[])
@limiter.limit('30 per minute')
@push_bp.response(200, PushSubscriptionSchema)
def get_subscription(org: str, site: str, subscription_id: str):
    """A subscription's preferences; one that follows another site is not found here."""
    return subscription_view(_site_subscription(org, site, subscription_id))


@push_bp.route(SUBSCRIPTION, methods=['PATCH'])
@push_bp.doc(security=[])
@limiter.limit('20 per minute')
@push_bp.arguments(PushPreferencesSchema)
@push_bp.response(200, PushSubscriptionSchema)
def patch_subscription(body, org: str, site: str, subscription_id: str):
    """Change a subscription's preferences."""
    subscription = _site_subscription(org, site, subscription_id)
    _set_preferences(subscription, body)
    db.session.commit()
    return subscription_view(subscription)


@push_bp.route(SUBSCRIPTION, methods=['DELETE'])
@push_bp.doc(security=[])
@limiter.limit('10 per minute')
@push_bp.response(204)
def delete_subscription(org: str, site: str, subscription_id: str):
    """Unsubscribe a browser."""
    db.session.delete(_site_subscription(org, site, subscription_id))
    db.session.commit()


@push_bp.route(f'{SUBSCRIPTION}/test', methods=['POST'])
@push_bp.doc(security=[])
@limiter.limit('5 per minute')
@push_bp.response(204)
def test_subscription(org: str, site: str, subscription_id: str):
    """Send a test notification to the subscribed browser."""
    subscription = _site_subscription(org, site, subscription_id)
    sent = send_push_notification(subscription.get_subscription_info(), {
        'title': 'Mariam — Test',
        'body': '✅ Les notifications fonctionnent !',
        'icon': '/web-app-manifest-192x192.png',
        'badge': '/favicon-96x96.png',
        'url': '/menu',
        'tag': 'test',
    })
    if not sent:
        raise Problem(502, 'push_failed', "La notification de test n'a pas pu être envoyée.")
