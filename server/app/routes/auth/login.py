import json
from datetime import UTC, datetime, timedelta

import pyotp
from flask import jsonify, request
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
)
from werkzeug.security import check_password_hash, generate_password_hash

from ...extensions import db
from ...models import AuditLog, Passkey, User
from ...schemas import (
    ErrorSchema,
    LoginResponseSchema,
    LoginSchema,
    MFAVerifySchema,
)
from ...security import blacklist_token, get_client_ip, is_token_blacklisted, limiter
from ._webauthn import _decode_challenge_token, _get_webauthn_config, _make_challenge_token
from .blueprint import auth_bp

# Precomputed hash used to equalize password-check timing for unknown emails,
# so an attacker cannot distinguish "no such user" from "wrong password".
_DUMMY_PASSWORD_HASH = generate_password_hash('mariam-timing-equalizer')


@auth_bp.route('/login', methods=['POST'])
@limiter.limit("5 per minute")
@auth_bp.arguments(LoginSchema)
@auth_bp.response(200, LoginResponseSchema)
@auth_bp.alt_response(401, schema=ErrorSchema, description="Invalid credentials")
def login(data):
    """
    Step 1 of login: email/password verification.

    If MFA is enabled, returns a temporary token for step 2.
    """
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({'error': 'Email et mot de passe requis'}), 400

    user = User.query.filter_by(email=email).first()

    if user is None:
        # Burn a hash comparison so an unknown email takes as long as a wrong
        # password (defeats timing-based user enumeration).
        check_password_hash(_DUMMY_PASSWORD_HASH, password)
    if not user or not user.check_password(password):
        AuditLog.log(
            action=AuditLog.ACTION_LOGIN_FAILED,
            details={'email': email},
            ip_address=get_client_ip()
        )
        db.session.commit()
        return jsonify({'error': 'Email ou mot de passe incorrect'}), 401

    if not user.is_active:
        return jsonify({'error': 'Ce compte est désactivé'}), 403

    if user.mfa_enabled:
        mfa_token = create_access_token(
            identity=str(user.id),
            additional_claims={'mfa_pending': True},
            expires_delta=timedelta(minutes=10)
        )
        return jsonify({
            'mfa_required': True,
            'mfa_token': mfa_token,
            'message': 'Veuillez entrer votre code MFA'
        }), 200

    # Utilisateur avec passkey uniquement (sans TOTP) — connexion via passkey requise
    if user.passkeys.count() > 0:
        return jsonify({
            'error': 'Ce compte utilise la connexion par passkey. '
                     'Veuillez vous connecter avec votre appareil.',
            'passkey_only': True,
        }), 403

    return complete_login(user)


@auth_bp.route('/mfa/verify', methods=['POST'])
@limiter.limit("5 per minute")
@auth_bp.arguments(MFAVerifySchema)
@auth_bp.response(200, LoginResponseSchema)
@auth_bp.alt_response(401, schema=ErrorSchema, description="Invalid MFA code")
def verify_mfa(data):
    """Step 2 of login: TOTP code verification."""
    mfa_token = data.get('mfa_token')
    code = data.get('code')

    if not mfa_token or not code:
        return jsonify({'error': 'Token MFA et code requis'}), 400

    try:
        from flask_jwt_extended import decode_token
        decoded = decode_token(mfa_token)

        if not decoded.get('mfa_pending'):
            return jsonify({'error': 'Token invalide'}), 401

        user_id = int(decoded.get('sub'))
    except Exception:
        return jsonify({'error': 'Token MFA invalide ou expiré'}), 401

    # Single-use: a consumed (or already revoked) MFA token cannot be replayed.
    jti = decoded.get('jti')
    if jti and is_token_blacklisted(jti):
        return jsonify({'error': 'Token MFA invalide ou expiré'}), 401

    user = db.session.get(User, user_id)
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404

    totp = pyotp.TOTP(user.mfa_secret)
    if not totp.verify(code, valid_window=1):
        AuditLog.log(
            action=AuditLog.ACTION_LOGIN_FAILED,
            user_id=user.id,
            details={'reason': 'invalid_mfa_code'},
            ip_address=get_client_ip()
        )
        db.session.commit()
        return jsonify({'error': 'Code MFA invalide'}), 401

    # Consume the MFA token so it cannot be reused within its 10-minute window.
    if jti:
        exp = decoded.get('exp')
        ttl = int(exp - datetime.now(UTC).timestamp()) if exp else 600
        blacklist_token(jti, max(1, ttl))

    return complete_login(user)


def complete_login(user):
    """Finalize login and return JWT tokens."""
    # Re-check the account is still active
    if not user.is_active:
        return jsonify({'error': 'Ce compte est désactivé'}), 403

    user.update_last_login()
    AuditLog.log(
        action=AuditLog.ACTION_LOGIN,
        user_id=user.id,
        ip_address=get_client_ip()
    )
    db.session.commit()

    access_token = create_access_token(identity=str(user.id))
    refresh_token = create_refresh_token(identity=str(user.id))

    return jsonify({
        'message': 'Connexion réussie',
        'user': user.to_dict(include_tenant=True),
        'access_token': access_token,
        'refresh_token': refresh_token
    }), 200


@auth_bp.route('/passkey/login/begin', methods=['POST'])
@limiter.limit("10 per minute")
def passkey_login_begin():
    """
    Start a standalone passkey login (no email/password required).

    Generates a discoverable challenge (empty allowCredentials):
    the browser presents all passkeys available for this domain.
    """
    from webauthn import generate_authentication_options, options_to_json
    from webauthn.helpers.structs import UserVerificationRequirement

    rp_id, _, _ = _get_webauthn_config()

    options = generate_authentication_options(
        rp_id=rp_id,
        allow_credentials=[],  # discoverable — le navigateur propose toutes les passkeys du domaine
        user_verification=UserVerificationRequirement.REQUIRED,
    )

    # user_id=0 : on ne connaît pas encore l'utilisateur
    challenge_token = _make_challenge_token(0, options.challenge)
    options_dict = json.loads(options_to_json(options))

    return jsonify({
        'options': options_dict,
        'challenge_token': challenge_token,
    }), 200


@auth_bp.route('/passkey/login/complete', methods=['POST'])
@limiter.limit("10 per minute")
def passkey_login_complete():
    """
    Finalize a standalone passkey login.

    Identifies the user by looking up the credential_id in the database.
    Body: { challenge_token, credential }
    """
    from webauthn import verify_authentication_response
    from webauthn.helpers import base64url_to_bytes
    from webauthn.helpers.structs import (
        AuthenticationCredential,
        AuthenticatorAssertionResponse,
    )

    data = request.get_json()
    if not data:
        return jsonify({'error': 'Données manquantes'}), 400

    challenge_token = data.get('challenge_token')
    credential_data = data.get('credential')

    if not challenge_token or not credential_data:
        return jsonify({'error': 'challenge_token et credential requis'}), 400

    try:
        _, challenge_bytes = _decode_challenge_token(challenge_token)
    except Exception:
        return jsonify({'error': 'challenge_token invalide ou expiré'}), 401

    # Identifier la passkey par credential_id
    try:
        raw_id_bytes = base64url_to_bytes(credential_data.get('rawId', credential_data.get('id', '')))
    except Exception:
        return jsonify({'error': 'credential_id invalide'}), 400

    passkey = Passkey.query.filter_by(credential_id=raw_id_bytes).first()
    if not passkey:
        return jsonify({'error': 'Passkey inconnue'}), 404

    user = db.session.get(User, passkey.user_id)
    if not user or not user.is_active:
        return jsonify({'error': 'Utilisateur non trouvé ou désactivé'}), 404

    rp_id, _, origin = _get_webauthn_config()

    try:
        resp = credential_data.get('response', {})
        user_handle = base64url_to_bytes(resp['userHandle']) if resp.get('userHandle') else None
        credential = AuthenticationCredential(
            id=credential_data['id'],
            raw_id=raw_id_bytes,
            response=AuthenticatorAssertionResponse(
                client_data_json=base64url_to_bytes(resp['clientDataJSON']),
                authenticator_data=base64url_to_bytes(resp['authenticatorData']),
                signature=base64url_to_bytes(resp['signature']),
                user_handle=user_handle,
            ),
        )
        verification = verify_authentication_response(
            credential=credential,
            expected_challenge=challenge_bytes,
            expected_rp_id=rp_id,
            expected_origin=origin,
            credential_public_key=passkey.public_key,
            credential_current_sign_count=passkey.sign_count,
            require_user_verification=True,
        )
    except Exception as e:
        AuditLog.log(
            action=AuditLog.ACTION_LOGIN_FAILED,
            user_id=user.id,
            details={'reason': 'passkey_login_failed', 'error': str(e)},
            ip_address=get_client_ip(),
        )
        db.session.commit()
        return jsonify({'error': 'Vérification de la passkey échouée'}), 401

    passkey.sign_count = verification.new_sign_count
    passkey.last_used_at = db.func.now()

    return complete_login(user)
