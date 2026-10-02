from flask import jsonify

from ...extensions import db
from ...models import ActivationLink, AuditLog, Passkey, User
from ...schemas.auth import (
    AuthErrorSchema,
    InvalidLinkSchema,
    PasskeyPasswordResetSchema,
    ResetLinkSchema,
    ResetPasswordSchema,
    ResetTokenSchema,
    WebAuthnOptionsSchema,
)
from ...schemas.common import ErrorSchema, MessageSchema
from ...security import get_client_ip, limiter
from ...services import passkeys, totp
from ...services.passkeys import Ceremony
from ._common import user_not_found, weak_password
from .blueprint import auth_bp


def _reset_link(token: str):
    link = ActivationLink.query.filter_by(token=token, link_type='password_reset').first()
    if not link:
        return None, (jsonify({'error': 'Lien de réinitialisation invalide'}), 404)
    if not link.is_valid():
        return None, (
            jsonify({'error': 'Lien de réinitialisation expiré ou déjà utilisé'}), 400
        )
    return link, None


def _audit(user: User, details: dict) -> None:
    AuditLog.log(
        action=AuditLog.ACTION_PASSWORD_RESET,
        user_id=user.id,
        restaurant_id=user.restaurant_id,
        details=details,
        ip_address=get_client_ip(),
    )


@auth_bp.route('/check-reset/<token>', methods=['GET'])
@auth_bp.response(200, ResetLinkSchema)
@auth_bp.alt_response(400, schema=InvalidLinkSchema, description='Link expired or already used.')
@auth_bp.alt_response(404, schema=InvalidLinkSchema, description='Unknown link.')
def check_reset_link(token):
    """Check a password-reset link

    Tells which second factor the reset will ask for.
    """
    link = ActivationLink.query.filter_by(token=token, link_type='password_reset').first()

    if not link:
        return jsonify({'valid': False, 'error': 'Lien invalide'}), 404

    if not link.is_valid():
        return jsonify({'valid': False, 'error': 'Lien expiré ou déjà utilisé'}), 400

    user = User.query.filter_by(email=link.email).first()
    return jsonify({
        'valid': True,
        'link_type': link.link_type,
        'email': link.email,
        'mfa_enabled': bool(user and user.mfa_enabled),
        'has_passkeys': bool(user and user.passkeys.count() > 0),
    }), 200


@auth_bp.route('/reset-password', methods=['POST'])
@limiter.limit('3 per hour')
@auth_bp.arguments(ResetPasswordSchema)
@auth_bp.response(200, MessageSchema)
@auth_bp.alt_response(
    400,
    schema=AuthErrorSchema,
    description='Link expired or used, password too weak, or no TOTP on the account: '
                '`passkey_required` is then set when it has passkeys.',
)
@auth_bp.alt_response(401, schema=ErrorSchema, description='Wrong code.')
@auth_bp.alt_response(403, schema=ErrorSchema, description='Account disabled.')
@auth_bp.alt_response(404, schema=ErrorSchema, description='Unknown link or account.')
def reset_password(data):
    """Reset a password with a reset link and a TOTP code

    Consumes the link and ends every session.
    """
    link, error = _reset_link(data['token'])
    if error:
        return error

    user = User.query.filter_by(email=link.email).first()
    if not user:
        return user_not_found()
    if not user.is_active:
        return jsonify({'error': 'Ce compte est désactivé'}), 403

    if not user.mfa_enabled or not user.mfa_secret:
        if user.passkeys.count() > 0:
            return jsonify({
                'error': 'Ce compte utilise une passkey : '
                         'réinitialisez le mot de passe avec votre appareil.',
                'passkey_required': True,
            }), 400
        return jsonify({'error': 'Aucun second facteur configuré pour ce compte'}), 400

    if not totp.code_matches(user.mfa_secret, data['mfa_code']):
        _audit(user, {'success': False, 'reason': 'invalid_mfa'})
        db.session.commit()
        return jsonify({'error': 'Code MFA invalide'}), 401

    if not User.validate_password_strength(data['new_password']):
        return weak_password()

    user.set_password(data['new_password'])
    user.revoke_tokens()
    link.mark_as_used()
    _audit(user, {'success': True, 'method': 'reset_link'})
    db.session.commit()

    return jsonify({'message': 'Mot de passe réinitialisé avec succès'}), 200


@auth_bp.route('/passkey/reset-password/begin', methods=['POST'])
@limiter.limit('5 per minute')
@auth_bp.arguments(ResetTokenSchema)
@auth_bp.response(200, WebAuthnOptionsSchema)
@auth_bp.alt_response(
    400, schema=ErrorSchema, description='Link expired or used, or no passkey on the account.'
)
@auth_bp.alt_response(403, schema=ErrorSchema, description='Account disabled.')
@auth_bp.alt_response(404, schema=ErrorSchema, description='Unknown link or account.')
def passkey_reset_password_begin(data):
    """Start a password reset confirmed by passkey"""
    link, error = _reset_link(data['reset_token'])
    if error:
        return error

    user = User.query.filter_by(email=link.email).first()
    if not user:
        return user_not_found()
    if not user.is_active:
        return jsonify({'error': 'Ce compte est désactivé'}), 403

    registered = list(user.passkeys)
    if not registered:
        return jsonify({'error': 'Aucune passkey enregistrée pour ce compte'}), 400

    return jsonify(
        passkeys.begin_authentication(user.id, registered, Ceremony.RESET_PASSWORD)
    ), 200


@auth_bp.route('/passkey/reset-password/complete', methods=['POST'])
@limiter.limit('5 per minute')
@auth_bp.arguments(PasskeyPasswordResetSchema)
@auth_bp.response(200, MessageSchema)
@auth_bp.alt_response(
    400,
    schema=ErrorSchema,
    description='Link expired or used, malformed credential id, or a password too weak.',
)
@auth_bp.alt_response(
    401,
    schema=ErrorSchema,
    description='Challenge invalid or expired, a link for another account, or a signature that '
                'fails.',
)
@auth_bp.alt_response(403, schema=ErrorSchema, description='Account disabled.')
@auth_bp.alt_response(404, schema=ErrorSchema, description='Unknown link, account or passkey.')
def passkey_reset_password_complete(data):
    """Finish a password reset confirmed by passkey

    Consumes the link and ends every session.
    """
    try:
        token_user_id, challenge = passkeys.read_challenge(
            data['challenge_token'], Ceremony.RESET_PASSWORD
        )
    except passkeys.InvalidChallenge:
        return jsonify({'error': 'challenge_token invalide ou expiré'}), 401

    link, error = _reset_link(data['reset_token'])
    if error:
        return error

    user = db.session.get(User, token_user_id)
    if not user:
        return user_not_found()
    if not user.is_active:
        return jsonify({'error': 'Ce compte est désactivé'}), 403

    if link.email != user.email:
        return jsonify({'error': 'Incohérence entre les tokens'}), 401

    try:
        raw_id = passkeys.credential_id(data['credential'])
    except passkeys.InvalidCredential:
        return jsonify({'error': 'credential_id invalide'}), 400

    passkey = Passkey.query.filter_by(user_id=user.id, credential_id=raw_id).first()
    if not passkey:
        return jsonify({'error': 'Passkey inconnue'}), 404

    try:
        passkeys.verify_assertion(passkey, data['credential'], challenge)
    except passkeys.VerificationFailed as exc:
        _audit(user, {
            'success': False, 'reason': 'passkey_verification_failed', 'error': str(exc),
        })
        db.session.commit()
        return jsonify({'error': 'Vérification de la passkey échouée'}), 401

    if not User.validate_password_strength(data['new_password']):
        return weak_password()

    user.set_password(data['new_password'])
    user.revoke_tokens()
    link.mark_as_used()
    _audit(user, {'success': True, 'method': 'passkey'})
    db.session.commit()

    return jsonify({'message': 'Mot de passe réinitialisé avec succès'}), 200
