from flask import jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from flask_smorest import Blueprint

from ..extensions import db
from ..models import User
from ..schemas.common import ErrorSchema
from ..schemas.users import UiPreferencesSchema

users_bp = Blueprint('users', __name__, description="The signed-in account's interface state")


@users_bp.route('/me/ui-preferences', methods=['GET'])
@jwt_required()
@users_bp.response(200, UiPreferencesSchema)
@users_bp.alt_response(401, schema=ErrorSchema, description='Not authenticated')
def get_ui_preferences():
    """Return the interface state of the current user."""
    user = db.session.get(User, int(get_jwt_identity()))
    return jsonify(user.get_ui_preferences()), 200


@users_bp.route('/me/ui-preferences', methods=['PUT'])
@jwt_required()
@users_bp.response(200, UiPreferencesSchema)
@users_bp.alt_response(401, schema=ErrorSchema, description='Not authenticated')
def update_ui_preferences():
    """Update the interface state of the current user."""
    user = db.session.get(User, int(get_jwt_identity()))

    data = request.get_json(silent=True) or {}
    allowed = {'tour_done', 'tour_catalog_done', 'tour_stats_done'}
    current = user.get_ui_preferences()
    for key in allowed & data.keys():
        current[key] = bool(data[key])

    user.ui_preferences = current
    db.session.commit()
    return jsonify(current), 200
