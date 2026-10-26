from ...extensions import db
from ...models import ActivationLink, AuditLog, Passkey, User
from ...problems import Problem
from ...schemas.auth import (
    PasskeyPasswordResetSchema,
    ResetLinkSchema,
    ResetPasswordSchema,
    ResetTokenSchema,
    WebAuthnOptionsSchema,
)
from ...security import get_client_ip, limiter
from ...services import passkeys
from ...services.account import SecurityEvent, notify_security_event
from ...services.passkeys import Ceremony
from ._common import (
    account_disabled,
    account_not_found,
    challenge_refused,
    code_refusal,
    credential_unreadable,
    passkey_refused,
)
from .blueprint import auth_bp


def _reset_link(token: str):
    link = ActivationLink.query.filter_by(token=token, link_type='password_reset').first()
    if not link:
        raise Problem(404, 'link_unknown', "Ce lien de réinitialisation n'existe pas.")
    if not link.is_valid():
        raise Problem(410, 'link_expired', 'Ce lien de réinitialisation a expiré ou a déjà servi.')
    return link


def _active_account(email: str):
    user = User.query.filter_by(email=email).first()
    if not user:
        raise account_not_found()
    if not user.is_active:
        raise account_disabled()
    return user


def _audit(user: User, details: dict) -> None:
    AuditLog.log(
        action=AuditLog.ACTION_PASSWORD_RESET,
        user_id=user.id,
        restaurant_id=user.restaurant_id,
        details=details,
        ip_address=get_client_ip(),
    )


def _reset(user: User, link, password: str, method: str) -> None:
    user.set_password(password)
    user.revoke_tokens()
    link.mark_as_used()
    _audit(user, {'success': True, 'method': method})
    db.session.commit()
    notify_security_event(user, SecurityEvent.PASSWORD_CHANGED)


@auth_bp.route('/check-reset/<token>', methods=['GET'])
@auth_bp.doc(security=[])
@limiter.limit('10 per minute')
@auth_bp.response(200, ResetLinkSchema)
@auth_bp.problem(404, 'link_unknown')
@auth_bp.problem(410, 'link_expired')
def check_reset_link(token):
    """Check a password-reset link, and tell which second factor the reset asks for."""
    link = _reset_link(token)
    user = User.query.filter_by(email=link.email).first()
    return {
        'email': link.email,
        'mfa_enabled': bool(user and user.mfa_enabled),
        'has_passkeys': bool(user and user.passkeys.count() > 0),
    }


@auth_bp.route('/reset-password', methods=['POST'])
@auth_bp.doc(security=[])
@limiter.limit('3 per hour')
@auth_bp.arguments(ResetPasswordSchema)
@auth_bp.response(204)
@auth_bp.problem(401, 'code_invalid', 'code_used')
@auth_bp.problem(403, 'account_disabled')
@auth_bp.problem(404, 'link_unknown', 'account_not_found')
@auth_bp.problem(409, 'passkey_required', 'second_factor_required')
@auth_bp.problem(410, 'link_expired')
@auth_bp.problem(429, 'too_many_attempts')
def reset_password(body):
    """Reset a password with a reset link and a TOTP code.

    Consumes the link and ends every session. An account without TOTP resets with
    its passkey, through `/passkey/reset-password/*`.
    """
    link = _reset_link(body['token'])
    user = _active_account(link.email)

    if not user.mfa_enabled or not user.mfa_secret:
        if user.passkeys.count() > 0:
            raise Problem(
                409, 'passkey_required',
                'Ce compte utilise une passkey : réinitialisez le mot de passe avec votre '
                'appareil.',
            )
        raise Problem(
            409, 'second_factor_required', 'Aucun second facteur configuré pour ce compte.'
        )

    if refusal := code_refusal(user.id, user.mfa_secret, body['code'], 401):
        _audit(user, {'success': False, 'reason': refusal.code})
        db.session.commit()
        raise refusal

    _reset(user, link, body['new_password'], 'reset_link')


@auth_bp.route('/passkey/reset-password/begin', methods=['POST'])
@auth_bp.doc(security=[])
@limiter.limit('5 per minute')
@auth_bp.arguments(ResetTokenSchema)
@auth_bp.response(200, WebAuthnOptionsSchema)
@auth_bp.problem(403, 'account_disabled')
@auth_bp.problem(404, 'link_unknown', 'account_not_found')
@auth_bp.problem(409, 'no_passkey')
@auth_bp.problem(410, 'link_expired')
def passkey_reset_password_begin(body):
    """Start a password reset confirmed by passkey."""
    user = _active_account(_reset_link(body['reset_token']).email)
    registered = list(user.passkeys)
    if not registered:
        raise Problem(409, 'no_passkey', "Ce compte n'a aucune passkey.")
    return passkeys.begin_authentication(user.id, registered, Ceremony.RESET_PASSWORD)


@auth_bp.route('/passkey/reset-password/complete', methods=['POST'])
@auth_bp.doc(security=[])
@limiter.limit('5 per minute')
@auth_bp.arguments(PasskeyPasswordResetSchema)
@auth_bp.response(204)
@auth_bp.problem(401, 'challenge_invalid', 'passkey_refused')
@auth_bp.problem(403, 'account_disabled')
@auth_bp.problem(404, 'link_unknown', 'account_not_found')
@auth_bp.problem(410, 'link_expired')
def passkey_reset_password_complete(body):
    """Finish a password reset confirmed by passkey; consumes the link and ends every session."""
    try:
        owner_id, challenge = passkeys.read_challenge(
            body['challenge_token'], Ceremony.RESET_PASSWORD
        )
        raw_id = passkeys.credential_id(body['credential'])
    except passkeys.InvalidChallenge:
        raise challenge_refused(401) from None
    except passkeys.InvalidCredential:
        raise credential_unreadable() from None

    link = _reset_link(body['reset_token'])
    user = _active_account(link.email)
    if user.id != owner_id:
        raise challenge_refused(401)

    passkey = Passkey.query.filter_by(user_id=user.id, credential_id=raw_id).first()
    if passkey is None:
        raise passkey_refused(401)
    try:
        passkeys.verify_assertion(passkey, body['credential'], challenge)
    except passkeys.VerificationFailed as exc:
        _audit(user, {'success': False, 'reason': 'passkey_verification_failed', 'error': str(exc)})
        db.session.commit()
        raise passkey_refused(401) from None

    _reset(user, link, body['new_password'], 'passkey')
