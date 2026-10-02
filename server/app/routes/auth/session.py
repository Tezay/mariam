from datetime import timedelta

from flask import jsonify, request
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
    LogoutSchema,
    SessionSchema,
    SessionTransferSchema,
    SessionTransferValidateSchema,
    TokenRefreshSchema,
    UserSchema,
)
from ...schemas.common import ErrorSchema, MessageSchema
from ...security import get_client_ip, is_token_blacklisted, limiter
from ..helpers import get_current_user
from ._common import (
    NO_SESSION,
    account_disabled,
    revoke_until_expiry,
    token_pair,
    user_not_found,
)
from .blueprint import auth_bp

TRANSFER_TTL = timedelta(minutes=5)
REFRESH_REFUSED = 'Refresh token missing, expired or revoked.'


@auth_bp.route('/refresh', methods=['POST'])
@limiter.limit('10 per minute')
@jwt_required(refresh=True)
@auth_bp.response(200, TokenRefreshSchema)
@auth_bp.alt_response(401, schema=ErrorSchema, description=REFRESH_REFUSED)
def refresh():
    """Get a new access token

    Authenticated by the refresh token.
    """
    return jsonify({'access_token': create_access_token(identity=get_jwt_identity())}), 200


@auth_bp.route('/logout', methods=['POST'])
@limiter.limit('20 per minute')
@jwt_required(refresh=True)
@auth_bp.doc(requestBody={'content': {'application/json': {'schema': LogoutSchema}}})
@auth_bp.response(200, MessageSchema)
@auth_bp.alt_response(401, schema=ErrorSchema, description=REFRESH_REFUSED)
def logout():
    """Sign out

    Authenticated by the refresh token, which is revoked along with the access token
    passed in the body.
    """
    revoke_until_expiry(get_jwt())

    # Read leniently rather than through a schema: a malformed body must not keep the
    # refresh token alive, and the client has dropped its tokens already.
    body = request.get_json(silent=True)
    access_token = body.get('access_token') if isinstance(body, dict) else None
    if access_token:
        try:
            revoke_until_expiry(decode_token(access_token))
        except Exception:
            pass

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
@auth_bp.response(200, SessionTransferSchema)
@auth_bp.alt_response(401, schema=ErrorSchema, description=NO_SESSION)
@auth_bp.alt_response(404, schema=ErrorSchema, description='Account deleted or disabled.')
def session_transfer_generate():
    """Hand the session over to another device

    Returns a single-use token, valid five minutes, that `/session-transfer/validate`
    exchanges for a session on the other device.
    """
    user = get_current_user()
    if not user or not user.is_active:
        return user_not_found()

    transfer_token = create_access_token(
        identity=str(user.id),
        additional_claims={'session_transfer': True},
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
    """Open a session from a transfer token"""
    try:
        claims = decode_token(data['transfer_token'])
    except Exception:
        return jsonify({'error': 'Token invalide ou expiré'}), 401
    if not claims.get('session_transfer'):
        return jsonify({'error': 'Token invalide'}), 401

    jti = claims.get('jti')
    if jti and is_token_blacklisted(jti):
        return jsonify({'error': 'Ce lien a déjà été utilisé'}), 401

    user = db.session.get(User, int(claims['sub']))
    if not user:
        return user_not_found()
    if not user.is_active:
        return account_disabled()

    revoke_until_expiry(claims)

    AuditLog.log(
        action=AuditLog.ACTION_LOGIN,
        user_id=user.id,
        details={'method': 'session_transfer'},
        ip_address=get_client_ip(),
    )
    db.session.commit()

    return jsonify({'user': user.to_dict(include_tenant=True), **token_pair(user)}), 200
