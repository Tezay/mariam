from datetime import timedelta

from flask import jsonify
from flask_jwt_extended import (
    create_access_token,
    decode_token,
    get_jwt,
    get_jwt_identity,
    jwt_required,
)

from ...extensions import db
from ...models import AuditLog, User
from ...schemas.auth import (
    AuthErrorSchema,
    SessionSchema,
    SessionTransferSchema,
    SessionTransferValidateSchema,
    TokenRefreshSchema,
    UserSchema,
)
from ...schemas.common import ErrorSchema, MessageSchema
from ...security import (
    SESSION_CLAIM,
    claim_token,
    get_client_ip,
    is_token_blacklisted,
    limiter,
)
from ..helpers import get_current_user, step_up_once_enrolled
from ._common import (
    NO_SESSION,
    NOT_CONFIRMED,
    account_disabled,
    renewed_access_token,
    revoke_until_expiry,
    token_pair,
    user_not_found,
)
from .blueprint import auth_bp

TRANSFER_TTL = timedelta(minutes=5)
_CONFIRMED_UNTIL = 'session_transfer_confirmed_until'
REFRESH_REFUSED = 'Refresh token missing, expired or revoked.'


@auth_bp.route('/refresh', methods=['POST'])
@limiter.limit('10 per minute')
@jwt_required(refresh=True)
@auth_bp.response(200, TokenRefreshSchema)
@auth_bp.alt_response(401, schema=ErrorSchema, description=REFRESH_REFUSED)
def refresh():
    """Get a new access token

    Authenticated by the refresh token. The new access token is never confirmed:
    only presenting a second factor confirms a session.
    """
    return jsonify({'access_token': renewed_access_token()}), 200


@auth_bp.route('/logout', methods=['POST'])
@limiter.limit('20 per minute')
@jwt_required(refresh=True)
@auth_bp.response(200, MessageSchema)
@auth_bp.alt_response(401, schema=ErrorSchema, description=REFRESH_REFUSED)
def logout():
    """Sign out

    Authenticated by the refresh token, which is revoked with every access token issued
    from it.
    """
    revoke_until_expiry(get_jwt())

    AuditLog.log(
        action=AuditLog.ACTION_LOGOUT,
        user_id=int(get_jwt_identity()),
        ip_address=get_client_ip(),
    )
    db.session.commit()

    return jsonify({'message': 'Déconnecté'}), 200


@auth_bp.route('/me', methods=['GET'])
@jwt_required()
@auth_bp.response(200, UserSchema)
@auth_bp.alt_response(401, schema=ErrorSchema, description=NO_SESSION)
@auth_bp.alt_response(404, schema=ErrorSchema, description='Account deleted.')
def me():
    """Get the signed-in account"""
    user = get_current_user()
    if not user:
        return user_not_found()
    return jsonify({'user': user.to_dict(include_tenant=True)}), 200


@auth_bp.route('/session-transfer/generate', methods=['POST'])
@limiter.limit('10 per minute')
@jwt_required()
@step_up_once_enrolled
@auth_bp.response(200, SessionTransferSchema)
@auth_bp.alt_response(401, schema=ErrorSchema, description=NO_SESSION)
@auth_bp.alt_response(403, schema=AuthErrorSchema, description=NOT_CONFIRMED)
@auth_bp.alt_response(404, schema=ErrorSchema, description='Account deleted.')
def session_transfer_generate():
    """Hand the session over to another device

    Asks an account that has a second factor for a confirmed session. Returns a
    single-use token, valid five minutes, that `/session-transfer/validate` exchanges
    for a session on the other device, confirmed until the same time as this one.
    Signing out of this session ends the token with it.
    """
    user = get_current_user()
    if not user:
        return user_not_found()

    presented = get_jwt()
    transfer_token = create_access_token(
        identity=str(user.id),
        additional_claims={
            'session_transfer': True,
            _CONFIRMED_UNTIL: presented['fresh'],
            SESSION_CLAIM: presented.get(SESSION_CLAIM),
        },
        expires_delta=TRANSFER_TTL,
    )
    return jsonify({
        'transfer_token': transfer_token,
        'expires_in': int(TRANSFER_TTL.total_seconds()),
    }), 200


@auth_bp.route('/session-transfer/validate', methods=['POST'])
@limiter.limit('10 per minute')
@auth_bp.arguments(SessionTransferValidateSchema)
@auth_bp.response(200, SessionSchema)
@auth_bp.alt_response(
    401, schema=ErrorSchema, description='Token invalid, expired or already used.'
)
@auth_bp.alt_response(403, schema=ErrorSchema, description='Account disabled.')
@auth_bp.alt_response(404, schema=ErrorSchema, description='Account deleted.')
def session_transfer_validate(data):
    """Open a session from a transfer token

    The session inherits what is left of the confirmation of the one that handed it
    over: the receiving device has no second factor of its own to confirm with yet.
    """
    try:
        claims = decode_token(data['transfer_token'])
    except Exception:
        return jsonify({'error': 'Token invalide ou expiré'}), 401
    if not claims.get('session_transfer'):
        return jsonify({'error': 'Token invalide'}), 401

    user = db.session.get(User, int(claims['sub']))
    if not user:
        return user_not_found()
    if not user.is_active:
        return account_disabled()
    # Decoded by hand, so the token loader never saw it: ending the account's
    # sessions, or signing out of the one that handed over, ends the hand-overs
    # in flight too.
    origin = claims.get(SESSION_CLAIM)
    if user.has_revoked(claims['iat'], None) or (origin and is_token_blacklisted(origin)):
        return jsonify({'error': 'Token invalide ou expiré'}), 401

    if not claim_token(claims['jti'], int(TRANSFER_TTL.total_seconds())):
        return jsonify({'error': 'Ce lien a déjà été utilisé'}), 401

    AuditLog.log(
        action=AuditLog.ACTION_LOGIN,
        user_id=user.id,
        details={'method': 'session_transfer'},
        ip_address=get_client_ip(),
    )
    db.session.commit()

    return jsonify({
        'user': user.to_dict(include_tenant=True),
        **token_pair(user, confirmed=claims.get(_CONFIRMED_UNTIL)),
    }), 200
