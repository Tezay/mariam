"""In-app alerts and the preferences that filter them.

Alerts are computed on demand by `services.alerts`: nothing is stored. The Web
Push sent to visitors is another matter, under /v1/notifications.

Endpoints:
- GET /v1/inbox/live-alerts               Alerts on the sites the caller may read
- GET /v1/inbox/notification-preferences  The caller's alert and email preferences
- PUT /v1/inbox/notification-preferences  Change them
"""

from flask import jsonify
from flask_jwt_extended import jwt_required
from flask_smorest import Blueprint

from ..extensions import db
from ..schemas.common import ErrorSchema
from ..schemas.inbox import InboxPreferencesSchema, LiveAlertListSchema
from ..services.alerts import live_alerts
from .helpers import accessible_restaurant_ids, get_current_user

inbox_bp = Blueprint(
    'inbox', __name__,
    description='In-app alerts, computed on demand, and their per-account preferences'
)


@inbox_bp.route('/live-alerts', methods=['GET'])
@jwt_required()
@inbox_bp.response(200, LiveAlertListSchema)
@inbox_bp.alt_response(401, schema=ErrorSchema)
def get_live_alerts():
    """Get the caller's active alerts

    On the sites the caller may read: its own for a site account, every site of
    its organization for a supervisor. Each rule reaches the accounts it is for.
    """
    user = get_current_user()
    return jsonify({'alerts': live_alerts(user, sorted(accessible_restaurant_ids(user)))}), 200


@inbox_bp.route('/notification-preferences', methods=['GET'])
@jwt_required()
@inbox_bp.response(200, InboxPreferencesSchema)
@inbox_bp.alt_response(401, schema=ErrorSchema)
def get_notification_preferences():
    """Get the caller's alert and email preferences"""
    return jsonify(get_current_user().get_notification_preferences()), 200


@inbox_bp.route('/notification-preferences', methods=['PUT'])
@jwt_required()
@inbox_bp.arguments(InboxPreferencesSchema)
@inbox_bp.response(200, InboxPreferencesSchema)
@inbox_bp.alt_response(401, schema=ErrorSchema)
def update_notification_preferences(changes):
    """Change the caller's alert and email preferences

    Takes the keys to change; the others keep their value.
    """
    user = get_current_user()
    preferences = {**user.get_notification_preferences(), **changes}
    user.notification_preferences = preferences
    db.session.commit()
    return jsonify(preferences), 200
