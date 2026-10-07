from flask import jsonify
from flask_jwt_extended import jwt_required

from ...extensions import db
from ...models import AuditLog, Passkey, User
from ...schemas.auth import (
    AuthErrorSchema,
    ChangePasswordSchema,
    PasskeyPasswordChangeSchema,
    PasswordCheckSchema,
    WebAuthnOptionsSchema,
)
from ...schemas.common import ErrorSchema, MessageSchema
from ...security import get_client_ip, limiter
from ...services import passkeys, totp
from ...services.passkeys import Ceremony
from ..helpers import get_current_user
from ._common import NO_SESSION, user_not_found, weak_password
from .blueprint import auth_bp


def _audit(user: User, details: dict) -> None:
    AuditLog.log(
        action=AuditLog.ACTION_PASSWORD_CHANGE,
        user_id=user.id,
        restaurant_id=user.restaurant_id,
        details=details,
        ip_address=get_client_ip(),
    )


@auth_bp.route('/change-password', methods=['POST'])
@limiter.limit('3 per minute')
@jwt_required()
@auth_bp.arguments(ChangePasswordSchema)
@auth_bp.response(200, MessageSchema)
@auth_bp.alt_response(400, schema=ErrorSchema, description='Password too weak.')
@auth_bp.alt_response(401, schema=ErrorSchema, description=NO_SESSION)
@auth_bp.alt_response(
    403,
    schema=AuthErrorSchema,
    description='Wrong current password or code. Or a passkey and no TOTP on the account: '
                '`passkey_required` is set.',
)
@auth_bp.alt_response(404, schema=ErrorSchema, description='Account deleted.')
def change_password(data):
    """Change the password, confirmed by the current one and TOTP

    The code is checked when the account has TOTP enabled. An account protected by a
    passkey only goes through `/passkey/change-password/*` instead. Ends every session,
    this one included.
    """
    user = get_current_user()
    if not user:
        return user_not_found()

    has_totp = user.mfa_enabled and user.mfa_secret
    # The password alone never stands for the second factor an account has.
    if not has_totp and user.passkeys.count() > 0:
        return jsonify({
            'error': 'Ce compte confirme son identité avec sa passkey',
            'passkey_required': True,
        }), 403

    if not user.check_password(data['current_password']):
        _audit(user, {'success': False, 'reason': 'wrong_current_password'})
        db.session.commit()
        return jsonify({'error': 'Mot de passe actuel incorrect'}), 403

    if has_totp and not totp.code_matches(user.mfa_secret, data['mfa_code']):
        _audit(user, {'success': False, 'reason': 'invalid_mfa'})
        db.session.commit()
        return jsonify({'error': 'Code MFA invalide'}), 403

    if not User.validate_password_strength(data['new_password']):
        return weak_password()

    user.set_password(data['new_password'])
    user.revoke_tokens()
    _audit(user, {'success': True})
    db.session.commit()

    return jsonify({'message': 'Mot de passe modifié avec succès'}), 200


@auth_bp.route('/passkey/change-password/begin', methods=['POST'])
@limiter.limit('5 per minute')
@jwt_required()
@auth_bp.arguments(PasswordCheckSchema)
@auth_bp.response(200, WebAuthnOptionsSchema)
@auth_bp.alt_response(401, schema=ErrorSchema, description=NO_SESSION)
@auth_bp.alt_response(403, schema=ErrorSchema, description='Wrong current password.')
@auth_bp.alt_response(404, schema=ErrorSchema, description='Account deleted, or without passkey.')
def passkey_change_password_begin(data):
    """Start a password change confirmed by passkey

    Checks the current password, then challenges the account's passkeys.
    """
    user = get_current_user()
    if not user:
        return user_not_found()

    if not user.check_password(data['current_password']):
        _audit(user, {'success': False, 'reason': 'wrong_current_password'})
        db.session.commit()
        return jsonify({'error': 'Mot de passe actuel incorrect'}), 403

    registered = list(user.passkeys)
    if not registered:
        return jsonify({'error': 'Aucune passkey enregistrée'}), 404

    return jsonify(
        passkeys.begin_authentication(user.id, registered, Ceremony.CHANGE_PASSWORD)
    ), 200


@auth_bp.route('/passkey/change-password/complete', methods=['POST'])
@limiter.limit('5 per minute')
@jwt_required()
@auth_bp.arguments(PasskeyPasswordChangeSchema)
@auth_bp.response(200, MessageSchema)
@auth_bp.alt_response(
    400, schema=ErrorSchema, description='Malformed credential id, or a password too weak.'
)
@auth_bp.alt_response(401, schema=ErrorSchema, description=NO_SESSION)
@auth_bp.alt_response(
    403,
    schema=ErrorSchema,
    description='Challenge invalid, expired or issued to another account, '
                'or a signature that fails.',
)
@auth_bp.alt_response(404, schema=ErrorSchema, description='Unknown passkey, or account deleted.')
def passkey_change_password_complete(data):
    """Finish a password change confirmed by passkey

    Ends every session, this one included.
    """
    user = get_current_user()
    if not user:
        return user_not_found()

    try:
        token_user_id, challenge = passkeys.read_challenge(
            data['challenge_token'], Ceremony.CHANGE_PASSWORD
        )
        raw_id = passkeys.credential_id(data['credential'])
    except passkeys.InvalidChallenge:
        return jsonify({'error': 'challenge_token invalide ou expiré'}), 403
    except passkeys.InvalidCredential:
        return jsonify({'error': 'credential_id invalide'}), 400

    if token_user_id != user.id:
        return jsonify({'error': 'Token invalide'}), 403

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
        return jsonify({'error': 'Vérification de la passkey échouée'}), 403

    if not User.validate_password_strength(data['new_password']):
        return weak_password()

    user.set_password(data['new_password'])
    user.revoke_tokens()
    _audit(user, {'success': True, 'method': 'passkey'})
    db.session.commit()

    return jsonify({'message': 'Mot de passe modifié avec succès'}), 200
