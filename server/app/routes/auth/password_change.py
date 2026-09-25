import json

import pyotp
from flask import jsonify, request
from flask_jwt_extended import (
    get_jwt_identity,
    jwt_required,
)

from ...extensions import db
from ...models import AuditLog, Passkey, User
from ...schemas import (
    ChangePasswordSchema,
    ErrorSchema,
    MessageSchema,
)
from ...security import get_client_ip, limiter
from ._webauthn import _decode_challenge_token, _get_webauthn_config, _make_challenge_token
from .blueprint import auth_bp


@auth_bp.route('/change-password', methods=['POST'])
@limiter.limit("3 per minute")
@jwt_required()
@auth_bp.arguments(ChangePasswordSchema)
@auth_bp.response(200, MessageSchema)
@auth_bp.alt_response(401, schema=ErrorSchema, description="Invalid current password or MFA code")
def change_password(data):
    """
    Change the password of the currently authenticated user.

    Requires: current password + new password + current TOTP code.
    """
    current_password = data.get('current_password')
    new_password = data.get('new_password')
    mfa_code = data.get('mfa_code')

    if not current_password or not new_password or not mfa_code:
        return jsonify({'error': 'Mot de passe actuel, nouveau mot de passe et code MFA requis'}), 400

    current_user_id = int(get_jwt_identity())
    user = db.session.get(User, current_user_id)

    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404

    if not user.check_password(current_password):
        AuditLog.log(
            action=AuditLog.ACTION_PASSWORD_CHANGE,
            user_id=user.id,
            details={'success': False, 'reason': 'wrong_current_password'},
            ip_address=get_client_ip()
        )
        db.session.commit()
        return jsonify({'error': 'Mot de passe actuel incorrect'}), 401

    if user.mfa_enabled and user.mfa_secret:
        totp = pyotp.TOTP(user.mfa_secret)
        if not totp.verify(mfa_code, valid_window=1):
            AuditLog.log(
                action=AuditLog.ACTION_PASSWORD_CHANGE,
                user_id=user.id,
                details={'success': False, 'reason': 'invalid_mfa'},
                ip_address=get_client_ip()
            )
            db.session.commit()
            return jsonify({'error': 'Code MFA invalide'}), 401

    if not User.validate_password_strength(new_password):
        return jsonify({
            'error': 'Mot de passe trop faible',
            'message': 'Le mot de passe doit contenir au moins 12 caractères, '
                       'une majuscule, une minuscule, un chiffre et un caractère spécial.'
        }), 400

    user.set_password(new_password)
    user.revoke_tokens()

    AuditLog.log(
        action=AuditLog.ACTION_PASSWORD_CHANGE,
        user_id=user.id,
        restaurant_id=user.restaurant_id,
        details={'success': True},
        ip_address=get_client_ip()
    )

    db.session.commit()

    return jsonify({'message': 'Mot de passe modifié avec succès'}), 200


@auth_bp.route('/passkey/change-password/begin', methods=['POST'])
@limiter.limit("5 per minute")
@jwt_required()
def passkey_change_password_begin():
    """
    Step 1 of passkey-based password change.

    Validates the current password and generates a WebAuthn challenge targeting
    the authenticated user's registered passkeys.
    Body: { current_password }
    """
    from webauthn import generate_authentication_options, options_to_json
    from webauthn.helpers.structs import (
        AuthenticatorTransport,
        PublicKeyCredentialDescriptor,
        UserVerificationRequirement,
    )

    data = request.get_json()
    if not data:
        return jsonify({'error': 'Données manquantes'}), 400

    current_password = data.get('current_password')
    if not current_password:
        return jsonify({'error': 'current_password requis'}), 400

    current_user_id = int(get_jwt_identity())
    user = db.session.get(User, current_user_id)
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404

    if not user.check_password(current_password):
        AuditLog.log(
            action=AuditLog.ACTION_PASSWORD_CHANGE,
            user_id=user.id,
            details={'success': False, 'reason': 'wrong_current_password'},
            ip_address=get_client_ip(),
        )
        db.session.commit()
        return jsonify({'error': 'Mot de passe actuel incorrect'}), 401

    passkeys = list(user.passkeys)
    if not passkeys:
        return jsonify({'error': 'Aucune passkey enregistrée'}), 404

    rp_id, _, _ = _get_webauthn_config()

    allow_credentials = [
        PublicKeyCredentialDescriptor(
            id=p.credential_id,
            transports=[AuthenticatorTransport(t) for t in (p.transports or [])
                        if t in {e.value for e in AuthenticatorTransport}],
        )
        for p in passkeys
    ]

    options = generate_authentication_options(
        rp_id=rp_id,
        allow_credentials=allow_credentials,
        user_verification=UserVerificationRequirement.REQUIRED,
    )

    challenge_token = _make_challenge_token(user.id, options.challenge, 'change_password')
    options_dict = json.loads(options_to_json(options))

    return jsonify({
        'options': options_dict,
        'challenge_token': challenge_token,
    }), 200


@auth_bp.route('/passkey/change-password/complete', methods=['POST'])
@limiter.limit("5 per minute")
@jwt_required()
def passkey_change_password_complete():
    """
    Step 2 of passkey-based password change.

    Verifies the WebAuthn credential and applies the new password.
    Body: { new_password, challenge_token, credential }
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

    new_password = data.get('new_password')
    challenge_token = data.get('challenge_token')
    credential_data = data.get('credential')

    if not new_password or not challenge_token or not credential_data:
        return jsonify({'error': 'new_password, challenge_token et credential requis'}), 400

    current_user_id = int(get_jwt_identity())

    try:
        token_user_id, challenge_bytes = _decode_challenge_token(challenge_token, 'change_password')
    except Exception:
        return jsonify({'error': 'challenge_token invalide ou expiré'}), 401

    if token_user_id != current_user_id:
        return jsonify({'error': 'Token invalide'}), 401

    user = db.session.get(User, current_user_id)
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404

    try:
        raw_id_bytes = base64url_to_bytes(credential_data.get('rawId', credential_data.get('id', '')))
    except Exception:
        return jsonify({'error': 'credential_id invalide'}), 400

    passkey = Passkey.query.filter_by(user_id=current_user_id, credential_id=raw_id_bytes).first()
    if not passkey:
        return jsonify({'error': 'Passkey inconnue'}), 404

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
            action=AuditLog.ACTION_PASSWORD_CHANGE,
            user_id=user.id,
            details={'success': False, 'reason': 'passkey_verification_failed', 'error': str(e)},
            ip_address=get_client_ip(),
        )
        db.session.commit()
        return jsonify({'error': 'Vérification de la passkey échouée'}), 401

    if not User.validate_password_strength(new_password):
        return jsonify({
            'error': 'Mot de passe trop faible',
            'message': 'Le mot de passe doit contenir au moins 12 caractères, '
                       'une majuscule, une minuscule, un chiffre et un caractère spécial.',
        }), 400

    passkey.sign_count = verification.new_sign_count
    passkey.last_used_at = db.func.now()
    user.set_password(new_password)
    user.revoke_tokens()

    AuditLog.log(
        action=AuditLog.ACTION_PASSWORD_CHANGE,
        user_id=user.id,
        details={'success': True, 'method': 'passkey'},
        ip_address=get_client_ip(),
    )
    db.session.commit()

    return jsonify({'message': 'Mot de passe modifié avec succès'}), 200
