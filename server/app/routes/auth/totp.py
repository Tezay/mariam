from flask import jsonify
from flask_jwt_extended import jwt_required

from ...extensions import db
from ...models import AuditLog
from ...schemas.auth import (
    AccountUpdateSchema,
    AuthErrorSchema,
    TotpEnrolmentConfirmSchema,
    TotpSetupSchema,
)
from ...schemas.common import ErrorSchema
from ...security import get_client_ip, limiter
from ...services import totp
from ..helpers import get_current_user, step_up_once_enrolled, step_up_required
from ._common import NO_SESSION, NOT_CONFIRMED, user_not_found
from .blueprint import auth_bp


@auth_bp.route('/mfa/setup', methods=['POST'])
@limiter.limit('5 per minute')
@jwt_required()
@step_up_once_enrolled
@auth_bp.response(200, TotpSetupSchema)
@auth_bp.alt_response(401, schema=ErrorSchema, description=NO_SESSION)
@auth_bp.alt_response(403, schema=AuthErrorSchema, description=NOT_CONFIRMED)
@auth_bp.alt_response(404, schema=ErrorSchema, description='Account deleted.')
def mfa_setup():
    """Start enabling TOTP, or moving it to another device

    Asks an account that already has a second factor for a confirmed session. Nothing
    is stored yet: the secret travels in `enrolment_token` until `/mfa/setup/confirm`
    checks a first code, and the TOTP in use keeps working until then.
    """
    user = get_current_user()
    if not user:
        return user_not_found()

    secret = totp.new_secret()
    return jsonify({
        'qr_code': totp.provisioning_qr(secret, user.email),
        'secret': secret,
        'enrolment_token': totp.issue_enrolment(user.id, secret),
    }), 200


@auth_bp.route('/mfa/setup/confirm', methods=['POST'])
@limiter.limit('10 per minute')
@jwt_required()
@step_up_once_enrolled
@auth_bp.arguments(TotpEnrolmentConfirmSchema)
@auth_bp.response(200, AccountUpdateSchema)
@auth_bp.alt_response(
    400, schema=ErrorSchema, description='Enrolment token invalid, expired or another account’s.'
)
@auth_bp.alt_response(401, schema=ErrorSchema, description=NO_SESSION)
@auth_bp.alt_response(
    403, schema=AuthErrorSchema, description=f'Wrong code. Or: {NOT_CONFIRMED}'
)
@auth_bp.alt_response(404, schema=ErrorSchema, description='Account deleted.')
def mfa_setup_confirm(data):
    """Store the secret of an enrolment once its first code is checked

    Guarded like `/mfa/setup`. Enables TOTP, or replaces the secret of an account that
    already had it. A wrong code can be tried again with the same `enrolment_token`.
    """
    user = get_current_user()
    if not user:
        return user_not_found()

    secret = totp.read_enrolment(data['enrolment_token'], user.id)
    if not secret:
        return jsonify({'error': 'Configuration expirée. Recommencez.'}), 400

    if not totp.code_matches(secret, data['code']):
        return jsonify({'error': 'Code invalide'}), 403

    replaced = bool(user.mfa_enabled)
    user.set_mfa_secret(secret)
    AuditLog.log(
        action=AuditLog.ACTION_MFA_SETUP,
        user_id=user.id,
        details={'replaced': replaced},
        ip_address=get_client_ip(),
    )
    db.session.commit()

    return jsonify({
        'message': 'Authentification par code activée',
        'user': user.to_dict(include_tenant=True),
    }), 200


@auth_bp.route('/mfa', methods=['DELETE'])
@limiter.limit('5 per minute')
@jwt_required()
@step_up_required
@auth_bp.response(200, AccountUpdateSchema)
@auth_bp.alt_response(400, schema=ErrorSchema, description='TOTP not enabled.')
@auth_bp.alt_response(401, schema=ErrorSchema, description=NO_SESSION)
@auth_bp.alt_response(403, schema=AuthErrorSchema, description=NOT_CONFIRMED)
@auth_bp.alt_response(404, schema=ErrorSchema, description='Account deleted.')
@auth_bp.alt_response(409, schema=ErrorSchema, description='No passkey would remain.')
def disable_mfa():
    """Disable TOTP, from a confirmed session

    Refused unless the account keeps a passkey as its second factor.
    """
    user = get_current_user()
    if not user:
        return user_not_found()

    if not user.mfa_enabled:
        return jsonify({'error': "L'authentification par code n'est pas activée"}), 400

    if user.passkeys.count() == 0:
        return jsonify({
            'error': "Impossible de désactiver l'authentification par code "
                     "sans passkey configurée. "
                     "Enregistrez d'abord un appareil, puis désactivez le code.",
        }), 409

    user.mfa_enabled = False
    user.mfa_secret = None
    AuditLog.log(action=AuditLog.ACTION_MFA_DISABLED, user_id=user.id, ip_address=get_client_ip())
    db.session.commit()

    return jsonify({
        'message': 'Authentification par code désactivée',
        'user': user.to_dict(include_tenant=True),
    }), 200
