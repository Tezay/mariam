"""
Centre de notifications in-app (inbox) pour MARIAM.

Distinct des notifications Web Push (/v1/notifications).
Gère les alertes métier et actions multi-utilisateurs affichées
dans le popover de la cloche dans l'interface admin.

Endpoints :
- GET    /v1/inbox                        Liste les notifications (non-lues en premier, limit 50)
- GET    /v1/inbox/unread-count           Nombre de notifications non-lues (polling léger)
- GET    /v1/inbox/live-alerts            Alertes actives calculées en temps réel
- PUT    /v1/inbox/<id>/read              Marque une notification comme lue
- PUT    /v1/inbox/read-all              Marque toutes les notifications comme lues
- DELETE /v1/inbox/<id>                  Supprime une notification
- GET    /v1/inbox/notification-preferences  Préférences de notification de l'utilisateur
- PUT    /v1/inbox/notification-preferences  Met à jour les préférences
"""

from flask import jsonify
from flask_jwt_extended import get_jwt_identity, jwt_required
from flask_smorest import Blueprint

from ..extensions import db
from ..models import User
from ..models.notification import Notification
from ..schemas.common import ErrorSchema, MessageSchema
from ..schemas.inbox import (
    InboxPreferencesSchema,
    LiveAlertListSchema,
    NotificationListSchema,
    UnreadCountSchema,
)
from ..services.alerts import live_alerts
from .helpers import accessible_restaurant_ids, get_user_and_restaurant

inbox_bp = Blueprint(
    'inbox', __name__,
    description='Centre de notifications in-app — alertes métier et actions utilisateurs'
)


# ============================================================
# HELPERS
# ============================================================

def _get_user_and_restaurant_id():
    """Retourne (user, restaurant_id) — adaptateur du helper partagé."""
    user, restaurant = get_user_and_restaurant()
    return user, restaurant.id if restaurant else None


def _notifs_for_user(user: User, restaurant_id: int):
    """Requête de base : notifs du restaurant visibles par cet utilisateur."""
    return Notification.query.filter(
        Notification.restaurant_id == restaurant_id,
        db.or_(
            Notification.user_id.is_(None),  # broadcast
            Notification.user_id == user.id,
        )
    )


# ============================================================
# ENDPOINTS
# ============================================================

@inbox_bp.route('', methods=['GET'])
@jwt_required()
@inbox_bp.response(200, NotificationListSchema)
@inbox_bp.alt_response(401, schema=ErrorSchema)
def list_notifications():
    """Liste les 50 dernières notifications (non-lues en premier)."""
    user, restaurant_id = _get_user_and_restaurant_id()
    if not user or not restaurant_id:
        return jsonify({'error': 'Non authentifié ou aucun restaurant'}), 401

    notifs = (
        _notifs_for_user(user, restaurant_id)
        .order_by(Notification.is_read.asc(), Notification.created_at.desc())
        .limit(50)
        .all()
    )
    return jsonify({'notifications': [n.to_dict() for n in notifs]}), 200


@inbox_bp.route('/unread-count', methods=['GET'])
@jwt_required()
@inbox_bp.response(200, UnreadCountSchema)
@inbox_bp.alt_response(401, schema=ErrorSchema)
def unread_count():
    """Retourne le nombre de notifications non lues. Conçu pour le polling (~15s)."""
    user, restaurant_id = _get_user_and_restaurant_id()
    if not user or not restaurant_id:
        return jsonify({'error': 'Non authentifié ou aucun restaurant'}), 401

    count = (
        _notifs_for_user(user, restaurant_id)
        .filter(Notification.is_read == False)  # noqa: E712
        .count()
    )
    return jsonify({'count': count}), 200


@inbox_bp.route('/<int:notif_id>/read', methods=['PUT'])
@jwt_required()
@inbox_bp.response(200, MessageSchema)
@inbox_bp.alt_response(404, schema=ErrorSchema)
def mark_read(notif_id: int):
    """Marque une notification comme lue."""
    user, restaurant_id = _get_user_and_restaurant_id()
    if not user or not restaurant_id:
        return jsonify({'error': 'Non authentifié'}), 401

    notif = _notifs_for_user(user, restaurant_id).filter(Notification.id == notif_id).first()
    if not notif:
        return jsonify({'error': 'Notification introuvable'}), 404

    notif.is_read = True
    db.session.commit()
    return jsonify({'message': 'Notification marquée comme lue'}), 200


@inbox_bp.route('/read-all', methods=['PUT'])
@jwt_required()
@inbox_bp.response(200, MessageSchema)
def mark_all_read():
    """Marque toutes les notifications comme lues."""
    user, restaurant_id = _get_user_and_restaurant_id()
    if not user or not restaurant_id:
        return jsonify({'error': 'Non authentifié'}), 401

    _notifs_for_user(user, restaurant_id).filter(
        Notification.is_read == False  # noqa: E712
    ).update({'is_read': True}, synchronize_session=False)
    db.session.commit()
    return jsonify({'message': 'Toutes les notifications marquées comme lues'}), 200


@inbox_bp.route('/<int:notif_id>', methods=['DELETE'])
@jwt_required()
@inbox_bp.response(204)
@inbox_bp.alt_response(404, schema=ErrorSchema)
def delete_notification(notif_id: int):
    """Supprime une notification."""
    user, restaurant_id = _get_user_and_restaurant_id()
    if not user or not restaurant_id:
        return jsonify({'error': 'Non authentifié'}), 401

    notif = _notifs_for_user(user, restaurant_id).filter(Notification.id == notif_id).first()
    if not notif:
        return jsonify({'error': 'Notification introuvable'}), 404

    db.session.delete(notif)
    db.session.commit()
    return '', 204


@inbox_bp.route('/notification-preferences', methods=['GET'])
@jwt_required()
@inbox_bp.response(200, InboxPreferencesSchema)
@inbox_bp.alt_response(401, schema=ErrorSchema)
def get_notification_preferences():
    """Retourne les préférences de notification de l'utilisateur courant."""
    user = User.query.get(int(get_jwt_identity()))
    if not user:
        return jsonify({'error': 'Non authentifié'}), 401
    return jsonify(user.get_notification_preferences()), 200


@inbox_bp.route('/notification-preferences', methods=['PUT'])
@jwt_required()
@inbox_bp.response(200, InboxPreferencesSchema)
@inbox_bp.alt_response(401, schema=ErrorSchema)
def update_notification_preferences():
    """Met à jour les préférences de notification de l'utilisateur courant."""
    from flask import request
    user = User.query.get(int(get_jwt_identity()))
    if not user:
        return jsonify({'error': 'Non authentifié'}), 401

    data = request.get_json(silent=True) or {}
    allowed = {
        'notify_menu_unpublished', 'notify_menu_during_service', 'notify_menu_tomorrow',
        'notify_traffic_drop', 'notify_low_satisfaction', 'notify_vote_anomaly',
        'notify_site_inactive', 'notify_holiday_approaching', 'holiday_alert_days_before',
        'weekly_digest', 'digest_day', 'digest_hour',
    }
    current = user.get_notification_preferences()
    for key in allowed:
        if key in data:
            current[key] = data[key]
    current['digest_day'] = min(6, max(0, int(current.get('digest_day', 0))))
    current['digest_hour'] = min(21, max(6, int(current.get('digest_hour', 8))))

    user.notification_preferences = current
    db.session.commit()
    return jsonify(current), 200


# ============================================================
# LIVE ALERTS — calculées en temps réel, aucune persistance DB
# ============================================================

@inbox_bp.route('/live-alerts', methods=['GET'])
@jwt_required()
@inbox_bp.response(200, LiveAlertListSchema)
@inbox_bp.alt_response(401, schema=ErrorSchema)
def get_live_alerts():
    """Alertes actives de l'utilisateur, calculées en temps réel.

    Le périmètre suit le rôle : son site pour un admin, tous ceux de son
    organisation pour un directeur. Aucune persistance.
    """
    user = User.query.get(int(get_jwt_identity()))
    if not user:
        return jsonify({'alerts': []}), 200
    return jsonify({'alerts': live_alerts(user, sorted(accessible_restaurant_ids(user)))}), 200
