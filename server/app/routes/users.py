"""
User and invitation management routes for MARIAM.

All endpoints require the admin role.

Endpoints:
- GET  /v1/users                    List users
- GET  /v1/users/<id>               User details
- PUT  /v1/users/<id>               Update a user
- DELETE /v1/users/<id>             Delete a user
- POST /v1/users/<id>/reset-mfa     Reset a user's MFA
- POST /v1/users/invite             Create an invitation link
- GET  /v1/users/invitations        List pending invitations
"""
from functools import wraps
from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from flask_smorest import Blueprint
from ..extensions import db
from ..models import User, ActivationLink, AuditLog
from ..security import get_client_ip
from ..schemas.users import UserAdminSchema, UserUpdateSchema, InviteSchema, InvitationSchema
from ..schemas.common import ErrorSchema, MessageSchema


users_bp = Blueprint(
    'users', __name__,
    description='Users — Account and invitation management (admin)'
)


# ============================================================
# HELPERS
# ============================================================

def admin_required(f):
    """Décorateur : accès réservé aux administrateurs."""
    @wraps(f)
    @jwt_required()
    def decorated_function(*args, **kwargs):
        current_user_id = int(get_jwt_identity())
        user = User.query.get(current_user_id)
        if not user or not user.is_admin():
            return jsonify({'error': 'Accès réservé aux administrateurs'}), 403
        return f(*args, **kwargs)
    return decorated_function


# ============================================================
# ROUTES STATIQUES — avant /<int:user_id>
# ============================================================

@users_bp.route('/invite', methods=['POST'])
@users_bp.arguments(InviteSchema)
@users_bp.response(201, InvitationSchema)
@users_bp.alt_response(400, schema=ErrorSchema, description="Invalid email or role")
@users_bp.alt_response(409, schema=ErrorSchema, description="Email already in use")
@admin_required
def create_invitation(data):
    """Create an invitation link for a new user.

    Returns a token to send to the invitee so they can set up
    their account and MFA via `/activate/<token>`.
    """
    current_user_id = int(get_jwt_identity())

    email = data.get('email')
    role = data.get('role', 'editor')

    if not email:
        return jsonify({'error': 'Email requis'}), 400

    if role not in User.VALID_ROLES:
        return jsonify({'error': f'Rôle invalide. Valeurs possibles: {User.VALID_ROLES}'}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'Cet email est déjà utilisé'}), 409

    link = ActivationLink.create_invite_link(
        email=email,
        role=role,
        created_by_id=current_user_id
    )
    db.session.add(link)

    AuditLog.log(
        action=AuditLog.ACTION_ACTIVATION_LINK_CREATE,
        user_id=current_user_id,
        details={'email': email, 'role': role},
        ip_address=get_client_ip()
    )

    db.session.commit()

    return jsonify({
        'message': 'Invitation créée',
        'invitation': {
            'token': link.token,
            'email': email,
            'role': role,
            'expires_at': link.expires_at.isoformat(),
        },
    }), 201


@users_bp.route('/invitations', methods=['GET'])
@users_bp.response(200, InvitationSchema(many=True))
@admin_required
def list_invitations():
    """List pending invitations (50 most recent)."""
    links = ActivationLink.query.filter_by(link_type='invite').order_by(
        ActivationLink.created_at.desc()
    ).limit(50).all()

    return jsonify({'invitations': [link.to_dict(include_token=True) for link in links]}), 200


# ============================================================
# ROUTES PARAMÉTRÉES — après les routes statiques
# ============================================================

@users_bp.route('', methods=['GET'])
@users_bp.response(200, UserAdminSchema(many=True))
@admin_required
def list_users():
    """List all users (admin only)."""
    users = User.query.order_by(User.created_at.desc()).all()
    return jsonify({'users': [user.to_dict(include_sensitive=True) for user in users]}), 200


@users_bp.route('/<int:user_id>', methods=['GET'])
@users_bp.response(200, UserAdminSchema)
@users_bp.alt_response(404, schema=ErrorSchema, description="User not found")
@admin_required
def get_user(user_id):
    """Get user details."""
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404
    return jsonify({'user': user.to_dict(include_sensitive=True)}), 200


@users_bp.route('/<int:user_id>', methods=['PUT'])
@users_bp.arguments(UserUpdateSchema)
@users_bp.response(200, UserAdminSchema)
@users_bp.alt_response(400, schema=ErrorSchema, description="Invalid update")
@users_bp.alt_response(403, schema=ErrorSchema, description="Rescue account cannot be modified")
@users_bp.alt_response(404, schema=ErrorSchema, description="User not found")
@admin_required
def update_user(data, user_id):
    """Update a user (role, active status, restaurant, username)."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404

    if user.is_rescue_account:
        return jsonify({'error': 'Le compte de secours ne peut pas être modifié'}), 403

    if 'username' in data:
        user.username = data['username']

    if 'role' in data and data['role'] in User.VALID_ROLES:
        if user.id == current_user_id and data['role'] != 'admin':
            return jsonify({'error': 'Vous ne pouvez pas retirer vos propres droits admin'}), 400
        user.role = data['role']

    if 'is_active' in data:
        if user.id == current_user_id and not data['is_active']:
            return jsonify({'error': 'Vous ne pouvez pas désactiver votre propre compte'}), 400
        user.is_active = data['is_active']

    if 'restaurant_id' in data:
        user.restaurant_id = data['restaurant_id']

    AuditLog.log(
        action=AuditLog.ACTION_USER_UPDATE,
        user_id=current_user_id,
        target_type='user',
        target_id=user.id,
        details={'changes': data},
        ip_address=get_client_ip()
    )

    db.session.commit()

    return jsonify({'message': 'Utilisateur mis à jour', 'user': user.to_dict(include_sensitive=True)}), 200


@users_bp.route('/<int:user_id>', methods=['DELETE'])
@users_bp.response(200, MessageSchema)
@users_bp.alt_response(400, schema=ErrorSchema, description="Cannot delete your own account")
@users_bp.alt_response(403, schema=ErrorSchema, description="Rescue account cannot be deleted")
@users_bp.alt_response(404, schema=ErrorSchema, description="User not found")
@admin_required
def delete_user(user_id):
    """Delete a user."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404

    if user.id == current_user_id:
        return jsonify({'error': 'Vous ne pouvez pas supprimer votre propre compte'}), 400

    if user.is_rescue_account:
        return jsonify({'error': 'Le compte de secours ne peut pas être supprimé'}), 403

    AuditLog.log(
        action=AuditLog.ACTION_USER_DELETE,
        user_id=current_user_id,
        target_type='user',
        target_id=user.id,
        details={'email': user.email},
        ip_address=get_client_ip()
    )

    db.session.delete(user)
    db.session.commit()

    return jsonify({'message': 'Utilisateur supprimé'}), 200


@users_bp.route('/<int:user_id>/reset-mfa', methods=['POST'])
@users_bp.response(200, MessageSchema)
@users_bp.alt_response(404, schema=ErrorSchema, description="User not found")
@admin_required
def reset_user_mfa(user_id):
    """Reset a user's MFA.

    Disables current MFA, deactivates the account, and generates a new
    activation link (valid 72 h) to send to the user.
    """
    current_user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404

    user.disable_mfa()
    user.is_active = False

    link = ActivationLink.create_invite_link(
        email=user.email,
        role=user.role,
        created_by_id=current_user_id,
        expires_hours=72
    )
    db.session.add(link)

    AuditLog.log(
        action=AuditLog.ACTION_USER_UPDATE,
        user_id=current_user_id,
        target_type='user',
        target_id=user.id,
        details={'action': 'reset_mfa'},
        ip_address=get_client_ip()
    )

    db.session.commit()

    return jsonify({
        'message': 'MFA réinitialisé',
        'activation_link': {
            'token': link.token,
            'expires_at': link.expires_at.isoformat(),
        },
    }), 200
