"""
Closures routes for MARIAM — Exceptional restaurant closures.

Public endpoints (no authentication required):
- GET /v1/closures     Active upcoming/current closures

Editor endpoints (JWT required):
- GET    /v1/closures           List all closures
- POST   /v1/closures           Create a closure
- PUT    /v1/closures/<id>      Update a closure
- DELETE /v1/closures/<id>      Delete a closure
"""
from datetime import datetime
from functools import wraps
from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, verify_jwt_in_request
from flask_smorest import Blueprint
from ..extensions import db
from ..models import User, Restaurant, ExceptionalClosure, AuditLog
from ..security import get_client_ip
from ..utils.time import paris_today
from ..schemas.closures import (
    ClosureSchema, ClosureCreateSchema, ClosureUpdateSchema,
    PublicClosuresResponseSchema,
)
from ..schemas.common import ErrorSchema, MessageSchema


closures_bp = Blueprint(
    'closures', __name__,
    description='Exceptional closures — Public display and editor management'
)


# ============================================================
# HELPERS
# ============================================================

def editor_required(f):
    """Décorateur : accès réservé aux éditeurs (role editor ou admin)."""
    @wraps(f)
    @jwt_required()
    def decorated_function(*args, **kwargs):
        current_user_id = int(get_jwt_identity())
        user = User.query.get(current_user_id)
        if not user or not user.is_editor():
            return jsonify({'error': 'Accès réservé aux éditeurs'}), 403
        return f(*args, **kwargs)
    return decorated_function


def get_default_restaurant():
    return Restaurant.query.filter_by(is_active=True).first()


def parse_date(date_str, field_name='date'):
    try:
        return datetime.strptime(date_str, '%Y-%m-%d').date()
    except (ValueError, TypeError):
        return None


# ============================================================
# LISTE DES FERMETURES — route unifiée public/éditeur
# ============================================================

@closures_bp.route('', methods=['GET'])
@closures_bp.response(200, PublicClosuresResponseSchema)
def list_closures():
    """List exceptional closures.

    - **Without authentication**: returns active closures from today onward,
      split into current_closure (active today) and upcoming_closures.
    - **With editor authentication**: returns all closures with filters.

    Public query params: `restaurant_id`
    Editor query params: `upcoming` (bool), `include_inactive` (bool)
    """
    restaurant_id = request.args.get('restaurant_id', type=int)

    is_editor = False
    try:
        verify_jwt_in_request(optional=True)
        identity = get_jwt_identity()
        if identity:
            user = User.query.get(int(identity))
            is_editor = user is not None and user.is_editor()
    except Exception:
        pass

    if not restaurant_id:
        restaurant = get_default_restaurant()
        if restaurant:
            restaurant_id = restaurant.id
        else:
            return jsonify({
                'current_closure': None,
                'upcoming_closures': [],
                'closures': [],
            }), 200

    today = paris_today()

    if is_editor:
        upcoming_only = request.args.get('upcoming', 'false').lower() == 'true'
        include_inactive = request.args.get('include_inactive', 'false').lower() == 'true'

        query = ExceptionalClosure.query.filter_by(restaurant_id=restaurant_id)

        if upcoming_only:
            query = query.filter(ExceptionalClosure.end_date >= today)

        if not include_inactive:
            query = query.filter_by(is_active=True)

        closures = query.order_by(ExceptionalClosure.start_date.asc()).limit(200).all()

        return jsonify({'closures': [c.to_dict(today) for c in closures]}), 200

    else:
        # Vue publique : actives, end_date >= today
        query = ExceptionalClosure.query.filter(
            ExceptionalClosure.restaurant_id == restaurant_id,
            ExceptionalClosure.is_active == True,
            ExceptionalClosure.end_date >= today,
        ).order_by(ExceptionalClosure.start_date.asc())

        closures = query.all()

        current_closure = None
        upcoming_closures = []

        for c in closures:
            d = c.to_dict(today)
            if c.start_date <= today <= c.end_date:
                current_closure = d
            else:
                upcoming_closures.append(d)

        return jsonify({
            'current_closure': current_closure,
            'upcoming_closures': upcoming_closures,
            'closures': [c.to_dict(today) for c in closures],
        }), 200


@closures_bp.route('', methods=['POST'])
@closures_bp.arguments(ClosureCreateSchema)
@closures_bp.response(201, ClosureSchema)
@closures_bp.alt_response(400, schema=ErrorSchema, description="Invalid data")
@editor_required
def create_closure(data):
    """Create a new exceptional closure."""
    current_user_id = int(get_jwt_identity())
    today = paris_today()

    start_date = parse_date(data.get('start_date'), 'start_date')
    end_date = parse_date(data.get('end_date'), 'end_date')

    if not start_date or not end_date:
        return jsonify({'error': 'start_date et end_date sont requis (format YYYY-MM-DD)'}), 400

    if end_date < start_date:
        return jsonify({'error': 'end_date doit être >= start_date'}), 400

    restaurant_id = data.get('restaurant_id')
    if not restaurant_id:
        restaurant = get_default_restaurant()
        if restaurant:
            restaurant_id = restaurant.id
        else:
            return jsonify({'error': 'Aucun restaurant configuré'}), 400

    closure = ExceptionalClosure(
        restaurant_id=restaurant_id,
        start_date=start_date,
        end_date=end_date,
        reason=data.get('reason'),
        description=data.get('description'),
        created_by_id=current_user_id,
    )
    db.session.add(closure)

    AuditLog.log(
        action=AuditLog.ACTION_CLOSURE_CREATE,
        user_id=current_user_id,
        target_type='closure',
        details={'start_date': str(start_date), 'end_date': str(end_date), 'reason': closure.reason},
        ip_address=get_client_ip(),
    )

    db.session.commit()

    return jsonify({'message': 'Fermeture créée', 'closure': closure.to_dict(today)}), 201


# ============================================================
# ROUTES PARAMÉTRÉES
# ============================================================

@closures_bp.route('/<int:closure_id>', methods=['PUT'])
@closures_bp.arguments(ClosureUpdateSchema)
@closures_bp.response(200, ClosureSchema)
@closures_bp.alt_response(400, schema=ErrorSchema, description="Invalid data")
@closures_bp.alt_response(404, schema=ErrorSchema, description="Closure not found")
@editor_required
def update_closure(data, closure_id):
    """Update an existing exceptional closure."""
    current_user_id = int(get_jwt_identity())
    today = paris_today()
    closure = ExceptionalClosure.query.get(closure_id)
    if not closure:
        return jsonify({'error': 'Fermeture non trouvée'}), 404

    date_changed = False

    if 'start_date' in data:
        new_start = parse_date(data['start_date'], 'start_date')
        if not new_start:
            return jsonify({'error': 'start_date invalide (format YYYY-MM-DD)'}), 400
        if new_start != closure.start_date:
            closure.start_date = new_start
            date_changed = True

    if 'end_date' in data:
        new_end = parse_date(data['end_date'], 'end_date')
        if not new_end:
            return jsonify({'error': 'end_date invalide (format YYYY-MM-DD)'}), 400
        closure.end_date = new_end

    if closure.end_date < closure.start_date:
        return jsonify({'error': 'end_date doit être >= start_date'}), 400

    if date_changed:
        closure.notified_7d = False
        closure.notified_1d = False

    if 'reason' in data:
        closure.reason = data['reason']

    if 'description' in data:
        closure.description = data['description']

    if 'is_active' in data:
        closure.is_active = data['is_active']

    AuditLog.log(
        action=AuditLog.ACTION_CLOSURE_UPDATE,
        user_id=current_user_id,
        target_type='closure',
        target_id=closure.id,
        details={'changes': {k: str(v) for k, v in data.items()}},
        ip_address=get_client_ip(),
    )

    db.session.commit()

    return jsonify({'message': 'Fermeture mise à jour', 'closure': closure.to_dict(today)}), 200


@closures_bp.route('/<int:closure_id>', methods=['DELETE'])
@closures_bp.response(200, MessageSchema)
@closures_bp.alt_response(404, schema=ErrorSchema, description="Closure not found")
@editor_required
def delete_closure(closure_id):
    """Delete an exceptional closure."""
    current_user_id = int(get_jwt_identity())
    closure = ExceptionalClosure.query.get(closure_id)
    if not closure:
        return jsonify({'error': 'Fermeture non trouvée'}), 404

    AuditLog.log(
        action=AuditLog.ACTION_CLOSURE_DELETE,
        user_id=current_user_id,
        target_type='closure',
        target_id=closure.id,
        details={'start_date': str(closure.start_date), 'reason': closure.reason},
        ip_address=get_client_ip(),
    )

    db.session.delete(closure)
    db.session.commit()

    return jsonify({'message': 'Fermeture supprimée'}), 200
