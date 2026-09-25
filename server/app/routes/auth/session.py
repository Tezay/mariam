from datetime import UTC, timedelta

from flask import jsonify, request
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_jwt,
    get_jwt_identity,
    jwt_required,
)

from ...extensions import db
from ...models import AuditLog, User
from ...schemas import (
    LoginResponseSchema,
    UserSchema,
)
from ...security import blacklist_token, get_client_ip, is_token_blacklisted, limiter
from .blueprint import auth_bp


@auth_bp.route('/refresh', methods=['POST'])
@limiter.limit("10 per minute")
@jwt_required(refresh=True)
@auth_bp.response(200, LoginResponseSchema)
def refresh():
    """Renew access_token using a valid refresh_token."""
    current_user_id = get_jwt_identity()
    new_access_token = create_access_token(identity=current_user_id)

    return jsonify({'access_token': new_access_token}), 200


@auth_bp.route('/logout', methods=['POST'])
@limiter.limit("20 per minute")
@jwt_required(refresh=True)
def logout():
    """
    Invalidate both the refresh token and the access token server-side.
    - Refresh token: sent as Authorization: Bearer {refresh_token}
    - Access token:  sent in the request body as { "access_token": "..." }
    """
    from datetime import datetime

    now_ts = datetime.now(UTC).timestamp()

    # Blacklist the refresh token (from Authorization header)
    jwt_data = get_jwt()
    jti = jwt_data.get('jti')
    exp = jwt_data.get('exp')
    if jti and exp:
        blacklist_token(jti, max(1, int(exp - now_ts)))

    # Blacklist the access token if provided
    data = request.get_json(silent=True) or {}
    access_token = data.get('access_token')
    if access_token:
        try:
            decoded_access = decode_token(access_token)
            access_jti = decoded_access.get('jti')
            access_exp = decoded_access.get('exp')
            if access_jti and access_exp:
                blacklist_token(access_jti, max(1, int(access_exp - now_ts)))
        except Exception:
            pass  # Invalid token — ignore, client-side cleanup still happens

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
def get_current_user():
    """Get the currently authenticated user's profile."""
    current_user_id = int(get_jwt_identity())
    user = db.session.get(User, current_user_id)

    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404

    return jsonify({'user': user.to_dict(include_tenant=True)}), 200


@auth_bp.route('/session-transfer/generate', methods=['POST'])
@limiter.limit("10 per minute")
@jwt_required()
def session_transfer_generate():
    """
    Generate a short-lived session transfer token (5 min) for the authenticated user.
    Used to transfer the session to another device via QR code during PWA onboarding.
    The receiving device exchanges this token for a full JWT pair.

    Returns: { transfer_token, expires_in }
    """
    user_id = int(get_jwt_identity())
    user = db.session.get(User, user_id)
    if not user or not user.is_active:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404

    transfer_token = create_access_token(
        identity=str(user_id),
        additional_claims={'session_transfer': True},
        expires_delta=timedelta(minutes=5),
    )
    return jsonify({'transfer_token': transfer_token, 'expires_in': 300}), 200


@auth_bp.route('/session-transfer/validate', methods=['POST'])
@limiter.limit("10 per minute")
def session_transfer_validate():
    """
    Validate a session transfer token and issue a full JWT pair.
    Called on the receiving device (e.g. phone) after scanning a QR code.

    Body: { transfer_token }
    Returns: { access_token, refresh_token, user }
    """
    data = request.get_json(silent=True)
    if not data or not data.get('transfer_token'):
        return jsonify({'error': 'transfer_token requis'}), 400

    try:
        decoded = decode_token(data['transfer_token'])
    except Exception:
        return jsonify({'error': 'Token invalide ou expiré'}), 401

    if not decoded.get('session_transfer'):
        return jsonify({'error': 'Token invalide'}), 401

    jti = decoded.get('jti')
    if jti and is_token_blacklisted(jti):
        return jsonify({'error': 'Ce lien a déjà été utilisé'}), 401

    user_id = int(decoded['sub'])
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404
    if not user.is_active:
        return jsonify({'error': 'Ce compte est désactivé'}), 403

    # Mark transfer token as used (single-use, TTL 5 min)
    if jti:
        blacklist_token(jti, 300)

    AuditLog.log(
        action=AuditLog.ACTION_LOGIN,
        user_id=user.id,
        details={'method': 'session_transfer'},
        ip_address=get_client_ip(),
    )
    db.session.commit()

    access_token = create_access_token(identity=str(user.id))
    refresh_token = create_refresh_token(identity=str(user.id))

    return jsonify({
        'access_token': access_token,
        'refresh_token': refresh_token,
        'user': user.to_dict(include_tenant=True),
    }), 200
