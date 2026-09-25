import json

import pyotp
from flask import jsonify, request

from ...extensions import db
from ...models import ActivationLink, AuditLog, Passkey, User
from ...schemas import (
    ErrorSchema,
    LoginResponseSchema,
    MessageSchema,
    ResetPasswordSchema,
)
from ...security import get_client_ip, limiter
from ._webauthn import _decode_challenge_token, _get_webauthn_config, _make_challenge_token
from .blueprint import auth_bp


@auth_bp.route('/check-reset/<token>', methods=['GET'])
@auth_bp.response(200, LoginResponseSchema)
@auth_bp.alt_response(404, schema=ErrorSchema, description="Invalid or expired link")
def check_reset_link(token):
    """Verify if a password reset link is valid."""
    link = ActivationLink.query.filter_by(token=token, link_type='password_reset').first()

    if not link:
        return jsonify({'valid': False, 'error': 'Lien invalide'}), 404

    if not link.is_valid():
        return jsonify({'valid': False, 'error': 'Lien expiré ou déjà utilisé'}), 400

    user = User.query.filter_by(email=link.email).first()
    has_passkeys = user.passkeys.count() > 0 if user else False
    mfa_enabled = user.mfa_enabled if user else False

    return jsonify({
        'valid': True,
        'link_type': link.link_type,
        'email': link.email,
        'mfa_enabled': mfa_enabled,
        'has_passkeys': has_passkeys,
    }), 200


@auth_bp.route('/reset-password', methods=['POST'])
@limiter.limit("3 per hour")
@auth_bp.arguments(ResetPasswordSchema)
@auth_bp.response(200, MessageSchema)
@auth_bp.alt_response(401, schema=ErrorSchema, description="Invalid MFA code")
def reset_password(data):
    """
    Reset password via a dedicated reset link.

    Requires: reset token + new password + current TOTP code.
    """
    token = data.get('token')
    new_password = data.get('new_password')
    mfa_code = data.get('mfa_code')

    if not token or not new_password or not mfa_code:
        return jsonify({'error': 'Token, nouveau mot de passe et code MFA requis'}), 400

    link = ActivationLink.query.filter_by(token=token, link_type='password_reset').first()

    if not link:
        return jsonify({'error': 'Lien de réinitialisation invalide'}), 404

    if not link.is_valid():
        return jsonify({'error': 'Lien de réinitialisation expiré ou déjà utilisé'}), 400

    user = User.query.filter_by(email=link.email).first()

    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404

    if not user.is_active:
        return jsonify({'error': 'Ce compte est désactivé'}), 403

    if not user.mfa_enabled or not user.mfa_secret:
        if user.passkeys.count() > 0:
            return jsonify({
                'error': 'This account uses passkey authentication. Use the passkey reset endpoint.',
                'passkey_required': True,
            }), 400
        return jsonify({'error': 'MFA not configured for this user'}), 400

    totp = pyotp.TOTP(user.mfa_secret)
    if not totp.verify(mfa_code, valid_window=1):
        AuditLog.log(
            action=AuditLog.ACTION_PASSWORD_RESET,
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
    link.mark_as_used()

    AuditLog.log(
        action=AuditLog.ACTION_PASSWORD_RESET,
        user_id=user.id,
        restaurant_id=user.restaurant_id,
        details={'success': True, 'method': 'reset_link'},
        ip_address=get_client_ip()
    )

    db.session.commit()

    return jsonify({'message': 'Mot de passe réinitialisé avec succès'}), 200


@auth_bp.route('/passkey/reset-password/begin', methods=['POST'])
@limiter.limit("5 per minute")
def passkey_reset_password_begin():
    """
    Step 1 of passkey-based password reset.

    Validates the reset token and generates a WebAuthn authentication challenge
    targeting the user's registered passkeys.
    Body: { reset_token }
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

    reset_token = data.get('reset_token')
    if not reset_token:
        return jsonify({'error': 'reset_token requis'}), 400

    link = ActivationLink.query.filter_by(token=reset_token, link_type='password_reset').first()
    if not link:
        return jsonify({'error': 'Lien de réinitialisation invalide'}), 404
    if not link.is_valid():
        return jsonify({'error': 'Lien de réinitialisation expiré ou déjà utilisé'}), 400

    user = User.query.filter_by(email=link.email).first()
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404
    if not user.is_active:
        return jsonify({'error': 'Ce compte est désactivé'}), 403

    passkeys = list(user.passkeys)
    if not passkeys:
        return jsonify({'error': 'Aucune passkey enregistrée pour ce compte'}), 400

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

    challenge_token = _make_challenge_token(user.id, options.challenge, 'reset_password')
    options_dict = json.loads(options_to_json(options))

    return jsonify({
        'options': options_dict,
        'challenge_token': challenge_token,
    }), 200


@auth_bp.route('/passkey/reset-password/complete', methods=['POST'])
@limiter.limit("5 per minute")
def passkey_reset_password_complete():
    """
    Step 2 of passkey-based password reset.

    Verifies the WebAuthn assertion, applies the new password, and consumes the reset link.
    Body: { new_password, challenge_token, credential, reset_token }
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
    reset_token = data.get('reset_token')

    if not new_password or not challenge_token or not credential_data or not reset_token:
        return jsonify({'error': 'new_password, challenge_token, credential et reset_token requis'}), 400

    try:
        token_user_id, challenge_bytes = _decode_challenge_token(challenge_token, 'reset_password')
    except Exception:
        return jsonify({'error': 'challenge_token invalide ou expiré'}), 401

    link = ActivationLink.query.filter_by(token=reset_token, link_type='password_reset').first()
    if not link:
        return jsonify({'error': 'Lien de réinitialisation invalide'}), 404
    if not link.is_valid():
        return jsonify({'error': 'Lien de réinitialisation expiré ou déjà utilisé'}), 400

    user = db.session.get(User, token_user_id)
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404
    if not user.is_active:
        return jsonify({'error': 'Ce compte est désactivé'}), 403

    if link.email != user.email:
        return jsonify({'error': 'Incohérence entre les tokens'}), 401

    try:
        raw_id_bytes = base64url_to_bytes(credential_data.get('rawId', credential_data.get('id', '')))
    except Exception:
        return jsonify({'error': 'credential_id invalide'}), 400

    passkey = Passkey.query.filter_by(user_id=user.id, credential_id=raw_id_bytes).first()
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
            action=AuditLog.ACTION_PASSWORD_RESET,
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
    link.mark_as_used()

    AuditLog.log(
        action=AuditLog.ACTION_PASSWORD_RESET,
        user_id=user.id,
        details={'success': True, 'method': 'passkey'},
        ip_address=get_client_ip(),
    )
    db.session.commit()

    return jsonify({'message': 'Mot de passe réinitialisé avec succès'}), 200
