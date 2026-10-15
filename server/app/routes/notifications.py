from datetime import time

from flask import jsonify
from flask_smorest import Blueprint

from ..extensions import db
from ..models.push_subscription import PushSubscription
from ..models.restaurant import Restaurant
from ..schemas.common import ErrorSchema, MessageSchema
from ..schemas.notifications import (
    BrowserSubscriptionSchema,
    PreferencesUpdateSchema,
    SubscribeSchema,
    SubscriptionEndpointSchema,
)
from ..security import limiter
from ..services.notification_service import get_vapid_public_key, send_push_notification
from .helpers import get_default_restaurant

notifications_bp = Blueprint(
    'notifications', __name__,
    description='Push notifications — Web Push subscriptions (VAPID)'
)


def _parse_time(time_str: str) -> time:
    try:
        parts = time_str.strip().split(':')
        return time(int(parts[0]), int(parts[1]))
    except (ValueError, IndexError, AttributeError):
        return time(11, 0)


def _restaurant_to_follow(restaurant_id: int | None) -> Restaurant | None:
    if restaurant_id is None:
        return get_default_restaurant()
    return Restaurant.query.filter_by(id=restaurant_id, is_active=True).first()


@notifications_bp.route('/vapid-public-key', methods=['GET'])
@limiter.limit("30 per minute")
@notifications_bp.response(200, MessageSchema)
@notifications_bp.alt_response(503, schema=ErrorSchema, description="VAPID not configured")
def vapid_public_key():
    """Return the VAPID public key for initializing Web Push in the browser."""
    key = get_vapid_public_key()
    if not key:
        return jsonify({'error': 'Notifications push non configurées'}), 503
    return jsonify({'public_key': key}), 200


@notifications_bp.route('/subscribe', methods=['POST'])
@limiter.limit("10 per minute")
@notifications_bp.arguments(SubscribeSchema)
@notifications_bp.response(201, MessageSchema)
@notifications_bp.alt_response(200, schema=MessageSchema, description="Subscription updated")
@notifications_bp.alt_response(404, schema=ErrorSchema, description="Unknown or inactive restaurant")
def subscribe(data):
    """Register or update a push subscription.

    Expected body:
    ```json
    {
      "endpoint": "https://fcm.googleapis.com/...",
      "keys": { "p256dh": "...", "auth": "..." },
      "preferences": {
        "notify_today_menu": true,
        "notify_today_menu_time": "11:00",
        "notify_tomorrow_menu": false,
        "notify_tomorrow_menu_time": "19:00",
        "notify_events": true
      },
      "platform": "android",
      "restaurant_id": 1
    }
    ```
    """
    restaurant = _restaurant_to_follow(data.get('restaurant_id'))
    if restaurant is None:
        return jsonify({'error': 'Restaurant introuvable'}), 404

    endpoint = data['endpoint']
    p256dh = data['keys']['p256dh']
    auth = data['keys']['auth']
    prefs = data.get('preferences', {})
    platform = data.get('platform')

    sub = PushSubscription.query.filter_by(endpoint=endpoint).first()
    is_new = sub is None

    if is_new:
        sub = PushSubscription(restaurant_id=restaurant.id, endpoint=endpoint, p256dh=p256dh, auth=auth)
        db.session.add(sub)
    else:
        sub.p256dh = p256dh
        sub.auth = auth
        sub.restaurant_id = restaurant.id

    sub.notify_today_menu = prefs.get('notify_today_menu', True)
    sub.notify_today_menu_time = _parse_time(prefs.get('notify_today_menu_time', '11:00'))
    sub.notify_tomorrow_menu = prefs.get('notify_tomorrow_menu', False)
    sub.notify_tomorrow_menu_time = _parse_time(prefs.get('notify_tomorrow_menu_time', '19:00'))
    sub.notify_events = prefs.get('notify_events', True)

    if platform:
        sub.platform = platform

    db.session.commit()

    return jsonify({
        'message': 'Souscription enregistrée' if is_new else 'Souscription mise à jour',
        'subscription': sub.to_dict(),
    }), 201 if is_new else 200


@notifications_bp.route('/preferences', methods=['GET'])
@limiter.limit("30 per minute")
@notifications_bp.arguments(SubscriptionEndpointSchema, location='query')
@notifications_bp.response(200, MessageSchema)
@notifications_bp.alt_response(404, schema=ErrorSchema, description="Subscription not found")
def get_preferences(query):
    """Get the notification preferences for a subscription by endpoint."""
    sub = PushSubscription.query.filter_by(endpoint=query['endpoint']).first()
    if not sub:
        return jsonify({'error': 'Souscription introuvable'}), 404

    return jsonify({'subscription': sub.to_dict()}), 200


@notifications_bp.route('/preferences', methods=['PUT'])
@limiter.limit("20 per minute")
@notifications_bp.arguments(PreferencesUpdateSchema)
@notifications_bp.response(200, MessageSchema)
@notifications_bp.alt_response(404, schema=ErrorSchema, description="Subscription not found")
def update_preferences(data):
    """Update the notification preferences for an existing subscription."""
    sub = PushSubscription.query.filter_by(endpoint=data['endpoint']).first()
    if not sub:
        return jsonify({'error': 'Souscription introuvable'}), 404

    prefs = data['preferences']

    if 'notify_today_menu' in prefs:
        sub.notify_today_menu = prefs['notify_today_menu']
    if 'notify_today_menu_time' in prefs:
        sub.notify_today_menu_time = _parse_time(prefs['notify_today_menu_time'])
    if 'notify_tomorrow_menu' in prefs:
        sub.notify_tomorrow_menu = prefs['notify_tomorrow_menu']
    if 'notify_tomorrow_menu_time' in prefs:
        sub.notify_tomorrow_menu_time = _parse_time(prefs['notify_tomorrow_menu_time'])
    if 'notify_events' in prefs:
        sub.notify_events = prefs['notify_events']

    db.session.commit()

    return jsonify({'message': 'Préférences mises à jour', 'subscription': sub.to_dict()}), 200


@notifications_bp.route('/unsubscribe', methods=['DELETE'])
@limiter.limit("10 per minute")
@notifications_bp.arguments(SubscriptionEndpointSchema)
@notifications_bp.response(200, MessageSchema)
@notifications_bp.alt_response(404, schema=ErrorSchema, description="Subscription not found")
def unsubscribe(data):
    """Remove a push subscription."""
    sub = PushSubscription.query.filter_by(endpoint=data['endpoint']).first()
    if not sub:
        return jsonify({'error': 'Souscription introuvable'}), 404

    db.session.delete(sub)
    db.session.commit()

    return jsonify({'message': 'Désabonnement effectué'}), 200


@notifications_bp.route('/test', methods=['POST'])
@limiter.limit("5 per minute")
@notifications_bp.arguments(BrowserSubscriptionSchema)
@notifications_bp.response(200, MessageSchema)
@notifications_bp.alt_response(500, schema=ErrorSchema, description="VAPID send failure")
def send_test(subscription):
    """Send a test push notification to the subscriber."""
    payload = {
        'title': 'Mariam — Test',
        'body': '✅ Les notifications fonctionnent !',
        'icon': '/web-app-manifest-192x192.png',
        'badge': '/favicon-96x96.png',
        'url': '/menu',
        'tag': 'test',
    }

    if send_push_notification(subscription, payload):
        return jsonify({'message': 'Notification de test envoyée'}), 200
    return jsonify({'error': "Échec de l'envoi. Vérifiez la configuration VAPID."}), 500
