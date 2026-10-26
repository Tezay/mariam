from flask_jwt_extended import jwt_required

from ...extensions import db
from ...models import AuditLog
from ...problems import Problem
from ...schemas.user import AccountSchema, TotpEnrolmentSchema, TotpInputSchema
from ...security import get_client_ip, limiter
from ...services import totp
from ...services.account import SecurityEvent, notify_security_event
from ..auth._common import code_refusal
from ..helpers import account_view, get_current_user, step_up_once_enrolled, step_up_required
from .blueprint import user_bp


@user_bp.route('/totp/enrolment', methods=['POST'])
@limiter.limit('5 per minute')
@jwt_required()
@step_up_once_enrolled
@user_bp.response(200, TotpEnrolmentSchema)
@user_bp.problem(403, 'step_up_required')
def enrol_totp():
    """A new secret to scan, for enabling TOTP or moving it to another device.

    From a confirmed session once the account has a second factor. Nothing is
    stored: the secret travels in `enrolment_token` until `PUT /v1/user/totp`
    checks a first code, and the TOTP in use keeps working until then.
    """
    user = get_current_user()
    secret = totp.new_secret()
    return {
        'qr_code': totp.provisioning_qr(secret, user.email),
        'secret': secret,
        'enrolment_token': totp.issue_enrolment(user.id, secret),
    }


@user_bp.route('/totp', methods=['PUT'])
@limiter.limit('10 per minute')
@jwt_required()
@step_up_once_enrolled
@user_bp.arguments(TotpInputSchema)
@user_bp.response(200, AccountSchema)
@user_bp.problem(403, 'step_up_required', 'code_invalid', 'code_used')
@user_bp.problem(410, 'enrolment_expired')
@user_bp.problem(429, 'too_many_attempts')
def put_totp(body):
    """Store the secret of an enrolment once its first code is checked.

    Guarded like the enrolment. Enables TOTP, or replaces the secret in use; a
    wrong code can be tried again with the same `enrolment_token`.
    """
    user = get_current_user()
    secret = totp.read_enrolment(body['enrolment_token'], user.id)
    if not secret:
        raise Problem(410, 'enrolment_expired', 'Configuration expirée. Recommencez.')
    if refusal := code_refusal(user.id, secret, body['code'], 403):
        raise refusal
    replaced = bool(user.mfa_enabled)
    user.set_mfa_secret(secret)
    AuditLog.log(
        action=AuditLog.ACTION_MFA_SETUP,
        user_id=user.id,
        details={'replaced': replaced},
        ip_address=get_client_ip(),
    )
    db.session.commit()
    notify_security_event(
        user, SecurityEvent.TOTP_REPLACED if replaced else SecurityEvent.TOTP_ENABLED
    )
    return account_view(user)


@user_bp.route('/totp', methods=['DELETE'])
@limiter.limit('5 per minute')
@jwt_required()
@step_up_required
@user_bp.response(204)
@user_bp.problem(403, 'step_up_required')
@user_bp.problem(409, 'totp_not_enabled', 'last_second_factor')
def delete_totp():
    """Turn TOTP off, from a confirmed session; never while it is the only factor."""
    user = get_current_user()
    if not user.mfa_enabled:
        raise Problem(409, 'totp_not_enabled', "L'authentification par code n'est pas activée.")
    if user.passkeys.count() == 0:
        raise Problem(
            409, 'last_second_factor',
            "Enregistrez d'abord une passkey : l'authentification par code est votre seul "
            'second facteur.',
        )
    user.disable_mfa()
    AuditLog.log(action=AuditLog.ACTION_MFA_DISABLED, user_id=user.id, ip_address=get_client_ip())
    db.session.commit()
    notify_security_event(user, SecurityEvent.TOTP_DISABLED)
