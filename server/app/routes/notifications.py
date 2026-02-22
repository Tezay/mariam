"""
Routes de notifications push MARIAM — Endpoints publics.

Ces routes permettent aux utilisateurs de :
- Récupérer la clé VAPID publique
- S'abonner aux notifications push
- Mettre à jour leurs préférences
- Se désabonner
- Récupérer leurs préférences existantes (identifié par endpoint)
- Envoyer une notification de test

Endpoints :
- GET  /api/public/notifications/vapid-public-key
- POST /api/public/notifications/subscribe
- PUT  /api/public/notifications/preferences
- GET  /api/public/notifications/preferences?endpoint=...
- DELETE /api/public/notifications/unsubscribe
- POST /api/public/notifications/test
"""
from datetime import time
from flask import Blueprint, request, jsonify
from ..extensions import db
from ..models.push_subscription import PushSubscription
from ..models.restaurant import Restaurant
from ..services.notification_service import get_vapid_public_key, send_push_notification
from ..security import limiter


notifications_bp = Blueprint('notifications', __name__)


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


# ========================================
# Routes
# ========================================

@notifications_bp.route('/vapid-public-key', methods=['GET'])
@limiter.limit("30 per minute")
def vapid_public_key():
    """Retourne la clé publique VAPID pour le client Web Push."""
    key = get_vapid_public_key()
    if not key:
        return jsonify({'error': 'Notifications push non configurées'}), 503
    return jsonify({'public_key': key}), 200


@notifications_bp.route('/subscribe', methods=['POST'])
@limiter.limit("10 per minute")
def subscribe():
    """
    Enregistre ou met à jour une souscription push.

    Body JSON attendu :
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
    """
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Corps de requête manquant'}), 400

    endpoint = data.get('endpoint')
    keys = data.get('keys', {})
    p256dh = keys.get('p256dh')
    auth = keys.get('auth')

    if not endpoint or not p256dh or not auth:
        return jsonify({'error': 'Données de souscription incomplètes (endpoint, keys.p256dh, keys.auth requis)'}), 400

    # Restaurant ID (défaut si non fourni)
    restaurant_id = data.get('restaurant_id') or _get_default_restaurant_id()
    if not restaurant_id:
        return jsonify({'error': 'Aucun restaurant configuré'}), 400

    # Préférences
    prefs = data.get('preferences', {})
    platform = data.get('platform')

    # Upsert : chercher par endpoint, créer ou mettre à jour
    sub = PushSubscription.query.filter_by(endpoint=endpoint).first()
    is_new = sub is None

    if is_new:
        sub = PushSubscription(
            restaurant_id=restaurant_id,
            endpoint=endpoint,
            p256dh=p256dh,
            auth=auth,
        )
        db.session.add(sub)
    else:
        # Mettre à jour les clés (elles peuvent changer lors d'un re-subscribe)
        sub.p256dh = p256dh
        sub.auth = auth
        sub.restaurant_id = restaurant_id

    # Appliquer les préférences
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
        'subscription': sub.to_dict()
    }), 201 if is_new else 200


@notifications_bp.route('/preferences', methods=['PUT'])
@limiter.limit("20 per minute")
def update_preferences():
    """
    Met à jour les préférences de notification d'une souscription existante.

    Body JSON attendu :
    {
        "endpoint": "https://fcm.googleapis.com/...",
        "preferences": {
            "notify_today_menu": true,
            "notify_today_menu_time": "11:30",
            "notify_tomorrow_menu": true,
            "notify_tomorrow_menu_time": "18:00",
            "notify_events": false
        }
    }
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

    return jsonify({
        'message': 'Préférences mises à jour',
        'subscription': sub.to_dict()
    }), 200


@notifications_bp.route('/preferences', methods=['GET'])
@limiter.limit("30 per minute")
def get_preferences():
    """Récupère les préférences d'une souscription existante via son endpoint."""
    endpoint = request.args.get('endpoint')
    if not endpoint:
        return jsonify({'error': 'Paramètre endpoint manquant'}), 400

    sub = PushSubscription.query.filter_by(endpoint=endpoint).first()
    if not sub:
        return jsonify({'error': 'Souscription introuvable'}), 404

    return jsonify({'subscription': sub.to_dict()}), 200


@notifications_bp.route('/unsubscribe', methods=['DELETE'])
@limiter.limit("10 per minute")
def unsubscribe():
    """Supprime une souscription push."""
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
def send_test():
    """
    Envoie une notification de test à l'abonné.

    Body JSON attendu :
    {
        "endpoint": "https://fcm.googleapis.com/...",
        "keys": { "p256dh": "...", "auth": "..." }
    }
    """
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Corps de requête manquant'}), 400

    endpoint = data.get('endpoint')
    keys = data.get('keys', {})

    if not endpoint or not keys.get('p256dh') or not keys.get('auth'):
        return jsonify({'error': 'Données de souscription incomplètes'}), 400

    subscription_info = {
        'endpoint': endpoint,
        'keys': keys,
    }

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
        return jsonify({'error': 'Échec de l\'envoi. Vérifiez la configuration VAPID.'}), 500
