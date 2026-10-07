from flask import jsonify
from flask_jwt_extended import jwt_required
from limits import parse
from psycopg2.errors import UniqueViolation
from sqlalchemy.exc import IntegrityError

from ...extensions import db
from ...models import AuditLog, User
from ...schemas.auth import AuthErrorSchema, ProfileUpdatedSchema, ProfileUpdateSchema
from ...schemas.common import ErrorSchema
from ...security import get_client_ip, limiter, spend
from ...services.account import change_email, notify_email_changed
from ..helpers import get_current_user, step_up_required
from ._common import NO_SESSION, reissued_token_pair, user_not_found
from .blueprint import auth_bp

EMAIL_CHANGES = parse('2 per day')


def _audit(user: User, action: str, details: dict) -> None:
    AuditLog.log(
        action=action,
        user_id=user.id,
        restaurant_id=user.restaurant_id,
        target_type='user',
        target_id=user.id,
        details=details,
        ip_address=get_client_ip(),
    )


def _address_taken(user: User):
    _audit(user, AuditLog.ACTION_EMAIL_CHANGE, {'success': False, 'reason': 'address_in_use'})
    db.session.commit()
    return jsonify({'error': 'Cette adresse est déjà utilisée par un autre compte.'}), 409


@auth_bp.route('/me', methods=['PATCH'])
@limiter.limit('10 per hour')
@jwt_required()
@step_up_required
@auth_bp.arguments(ProfileUpdateSchema)
@auth_bp.response(200, ProfileUpdatedSchema)
@auth_bp.alt_response(401, schema=ErrorSchema, description=NO_SESSION)
@auth_bp.alt_response(
    403,
    schema=AuthErrorSchema,
    description='Session not confirmed, with `step_up_required` set; or the rescue '
                'account changing its address.',
)
@auth_bp.alt_response(404, schema=ErrorSchema, description='Account deleted.')
@auth_bp.alt_response(409, schema=ErrorSchema, description='Address already in use.')
@auth_bp.alt_response(
    429, schema=ErrorSchema, description='Address already changed twice within a day.'
)
def update_profile(data):
    """Change the display name or the sign-in address, from a confirmed session

    A new address ends every other session and returns the tokens of the one that
    replaces the caller's, which is not confirmed; the previous address is told by
    email. An account changes address twice a day at most.
    """
    user = get_current_user()
    if not user:
        return user_not_found()

    name, email = data.get('username'), data.get('email')
    renames = name is not None and name != user.username
    moves = email is not None and email != user.email

    if moves:
        if user.is_rescue_account:
            return jsonify({'error': 'L’adresse de ce compte est gérée par le support'}), 403
        if User.query.filter_by(email=email).first():
            return _address_taken(user)
        if not spend(EMAIL_CHANGES, 'email-change', str(user.id)):
            return jsonify({
                'error': 'Vous avez déjà changé d’adresse deux fois aujourd’hui. '
                         'Réessayez demain.',
            }), 429

    if renames:
        _audit(user, AuditLog.ACTION_USER_UPDATE, {
            'field': 'username', 'old': user.username, 'new': name,
        })
        user.username = name

    previous_email, tokens = None, {}
    if moves:
        previous_email = change_email(user, email)
        tokens = reissued_token_pair(user)
        _audit(user, AuditLog.ACTION_EMAIL_CHANGE, {
            'success': True, 'old': previous_email, 'new': email,
        })

    try:
        db.session.commit()
    except IntegrityError as exc:
        db.session.rollback()
        # Two accounts can pass the lookup above with the same address; the
        # unique index decides between them.
        if isinstance(exc.orig, UniqueViolation):
            return _address_taken(user)
        raise

    if previous_email:
        notify_email_changed(previous_email, email)

    return jsonify({
        'message': 'Profil mis à jour',
        'user': user.to_dict(include_tenant=True),
        **tokens,
    }), 200
