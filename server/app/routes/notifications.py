"""
Push notification routes for MARIAM.

No authentication required (Web Push from the browser).

Endpoints:
- GET    /v1/notifications/vapid-public-key  VAPID public key
- POST   /v1/notifications/subscribe         Subscribe or update subscription
- GET    /v1/notifications/preferences       Get notification preferences
- PUT    /v1/notifications/preferences       Update notification preferences
- DELETE /v1/notifications/unsubscribe       Unsubscribe
- POST   /v1/notifications/test              Send a test notification
"""
from datetime import time
from flask import request, jsonify
from flask_smorest import Blueprint
from ..extensions import db
from ..models.push_subscription import PushSubscription
from ..models.restaurant import Restaurant
from ..services.notification_service import get_vapid_public_key, send_push_notification
from ..security import limiter
from ..schemas.notifications import SubscribeSchema, PreferencesUpdateSchema
from ..schemas.common import ErrorSchema, MessageSchema


notifications_bp = Blueprint(
    'notifications', __name__,
    description='Push notifications — Web Push subscriptions (VAPID)'
)


# ========================================
# Helpers
# ========================================
def _parse_time(time_str: str) -> time:
    """Parse une heure au format HH:MM en objet time."""
    try:
        parts = time_str.strip().split(':')
        return time(int(parts[0]), int(parts[1]))
    except (ValueError, IndexError, AttributeError):
        return time(11, 0)


def _get_default_restaurant_id() -> int | None:
    """Retourne l'ID du restaurant par défaut."""
    restaurant = Restaurant.query.filter_by(is_active=True).first()
    return restaurant.id if restaurant else None


# ============================================================
# ENDPOINTS
# ============================================================

@notifications_bp.route('/vapid-public-key', methods=['GET'])
@limiter.limit("30 per minute")
@notifications_bp.response(200, MessageSchema)
@notifications_bp.alt_response(503, schema=ErrorSchema, description="VAPID non configuré")
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
@notifications_bp.alt_response(400, schema=ErrorSchema, description="Incomplete data")
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
    endpoint = data.get('endpoint')
    keys = data.get('keys', {})
    p256dh = keys.get('p256dh')
    auth = keys.get('auth')

    if not endpoint or not p256dh or not auth:
        return jsonify({'error': 'Données de souscription incomplètes (endpoint, keys.p256dh, keys.auth requis)'}), 400

    restaurant_id = data.get('restaurant_id') or _get_default_restaurant_id()
    if not restaurant_id:
        return jsonify({'error': 'Aucun restaurant configuré'}), 400

    prefs = data.get('preferences', {})
    platform = data.get('platform')

    sub = PushSubscription.query.filter_by(endpoint=endpoint).first()
    is_new = sub is None

    if is_new:
        sub = PushSubscription(restaurant_id=restaurant_id, endpoint=endpoint, p256dh=p256dh, auth=auth)
        db.session.add(sub)
    else:
        sub.p256dh = p256dh
        sub.auth = auth
        sub.restaurant_id = restaurant_id

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
@notifications_bp.response(200, MessageSchema)
@notifications_bp.alt_response(400, schema=ErrorSchema, description="Missing endpoint parameter")
@notifications_bp.alt_response(404, schema=ErrorSchema, description="Subscription not found")
def get_preferences():
    """Get the notification preferences for a subscription by endpoint.

    Query param: `endpoint` (full push subscription URL)
    """
    endpoint = request.args.get('endpoint')
    if not endpoint:
        return jsonify({'error': 'Paramètre endpoint manquant'}), 400

    sub = PushSubscription.query.filter_by(endpoint=endpoint).first()
    if not sub:
        return jsonify({'error': 'Souscription introuvable'}), 404

    return jsonify({'subscription': sub.to_dict()}), 200


@notifications_bp.route('/preferences', methods=['PUT'])
@limiter.limit("20 per minute")
@notifications_bp.arguments(PreferencesUpdateSchema)
@notifications_bp.response(200, MessageSchema)
@notifications_bp.alt_response(400, schema=ErrorSchema, description="Missing endpoint")
@notifications_bp.alt_response(404, schema=ErrorSchema, description="Subscription not found")
def update_preferences(data):
    """Update the notification preferences for an existing subscription."""
    endpoint = data.get('endpoint')
    if not endpoint:
        return jsonify({'error': 'Endpoint manquant'}), 400

    sub = PushSubscription.query.filter_by(endpoint=endpoint).first()
    if not sub:
        return jsonify({'error': 'Souscription introuvable'}), 404

    prefs = data.get('preferences', {})

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
@notifications_bp.response(200, MessageSchema)
@notifications_bp.alt_response(400, schema=ErrorSchema, description="Missing endpoint")
@notifications_bp.alt_response(404, schema=ErrorSchema, description="Subscription not found")
def unsubscribe():
    """Remove a push subscription.

    JSON body: `{ "endpoint": "https://..." }`
    """
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Corps de requête manquant'}), 400

    endpoint = data.get('endpoint')
    if not endpoint:
        return jsonify({'error': 'Endpoint manquant'}), 400

    sub = PushSubscription.query.filter_by(endpoint=endpoint).first()
    if not sub:
        return jsonify({'error': 'Souscription introuvable'}), 404

    db.session.delete(sub)
    db.session.commit()

    return jsonify({'message': 'Désabonnement effectué'}), 200


@notifications_bp.route('/test', methods=['POST'])
@limiter.limit("5 per minute")
@notifications_bp.response(200, MessageSchema)
@notifications_bp.alt_response(400, schema=ErrorSchema, description="Incomplete data")
@notifications_bp.alt_response(500, schema=ErrorSchema, description="VAPID send failure")
def send_test():
    """Send a test push notification to the subscriber.

    JSON body:
    ```json
    {
      "endpoint": "https://fcm.googleapis.com/...",
      "keys": { "p256dh": "...", "auth": "..." }
    }
    ```
    """
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Corps de requête manquant'}), 400

    endpoint = data.get('endpoint')
    keys = data.get('keys', {})

    if not endpoint or not keys.get('p256dh') or not keys.get('auth'):
        return jsonify({'error': 'Données de souscription incomplètes'}), 400

    subscription_info = {'endpoint': endpoint, 'keys': keys}
    payload = {
        'title': 'Mariam — Test',
        'body': '✅ Les notifications fonctionnent !',
        'icon': '/web-app-manifest-192x192.png',
        'badge': '/favicon-96x96.png',
        'url': '/menu',
        'tag': 'test',
    }

    success = send_push_notification(subscription_info, payload)

    if success:
        return jsonify({'message': 'Notification de test envoyée'}), 200
    else:
        return jsonify({'error': "Échec de l'envoi. Vérifiez la configuration VAPID."}), 500
