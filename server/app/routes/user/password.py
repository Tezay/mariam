from flask_jwt_extended import jwt_required

from ...extensions import db
from ...models import AuditLog, Passkey, User
from ...problems import Problem
from ...schemas.auth import WebAuthnOptionsSchema
from ...schemas.user import PasswordChangeSchema, PasswordOptionsSchema
from ...security import get_client_ip, limiter
from ...services import passkeys
from ...services.account import SecurityEvent, notify_security_event
from ...services.passkeys import Ceremony
from ..auth._common import (
    challenge_refused,
    code_refusal,
    credential_unreadable,
    passkey_refused,
)
from ..helpers import get_current_user
from .blueprint import user_bp


def _audit(user: User, details: dict) -> None:
    AuditLog.log(
        action=AuditLog.ACTION_PASSWORD_CHANGE,
        user_id=user.id,
        restaurant_id=user.restaurant_id,
        details=details,
        ip_address=get_client_ip(),
    )


def _refuse(user: User, reason: str, problem: Problem) -> Problem:
    _audit(user, {'success': False, 'reason': reason})
    db.session.commit()
    return problem


def _check_current(user: User, password: str) -> None:
    if not user.check_password(password):
        raise _refuse(user, 'wrong_current_password', Problem(
            403, 'password_invalid', 'Mot de passe actuel incorrect.'
        ))


def _by_code(user: User, body: dict) -> str:
    # The password alone never stands for the second factor an account has.
    has_totp = bool(user.mfa_enabled and user.mfa_secret)
    if not has_totp and user.passkeys.count() > 0:
        raise Problem(
            403, 'passkey_required', 'Ce compte confirme son identité avec sa passkey.'
        )
    _check_current(user, body['current_password'])
    code = body.get('code', '')
    if has_totp and (refusal := code_refusal(user.id, user.mfa_secret, code, 403)):
        raise _refuse(user, 'invalid_mfa', refusal)
    return 'password'


def _by_passkey(user: User, body: dict) -> str:
    try:
        owner_id, challenge = passkeys.read_challenge(
            body['challenge_token'], Ceremony.CHANGE_PASSWORD
        )
        raw_id = passkeys.credential_id(body['credential'])
    except passkeys.InvalidChallenge:
        raise challenge_refused(403) from None
    except passkeys.InvalidCredential:
        raise credential_unreadable() from None
    if owner_id != user.id:
        raise challenge_refused(403)
    passkey = Passkey.query.filter_by(user_id=user.id, credential_id=raw_id).first()
    if passkey is None:
        raise passkey_refused(403)
    try:
        passkeys.verify_assertion(passkey, body['credential'], challenge)
    except passkeys.VerificationFailed as exc:
        _audit(user, {'success': False, 'reason': 'passkey_verification_failed', 'error': str(exc)})
        db.session.commit()
        raise passkey_refused(403) from None
    return 'passkey'


@user_bp.route('/password/options', methods=['POST'])
@limiter.limit('5 per minute')
@jwt_required()
@user_bp.arguments(PasswordOptionsSchema)
@user_bp.response(200, WebAuthnOptionsSchema)
@user_bp.problem(403, 'password_invalid')
@user_bp.problem(409, 'no_passkey')
def password_options(body):
    """Check the current password, then challenge the account's passkeys.

    For an account that changes its password with a passkey rather than a code.
    """
    user = get_current_user()
    _check_current(user, body['current_password'])
    registered = list(user.passkeys)
    if not registered:
        raise Problem(409, 'no_passkey', "Ce compte n'a aucune passkey.")
    return passkeys.begin_authentication(user.id, registered, Ceremony.CHANGE_PASSWORD)


@user_bp.route('/password', methods=['PUT'])
@limiter.limit('3 per minute')
@jwt_required()
@user_bp.arguments(PasswordChangeSchema)
@user_bp.response(204)
@user_bp.problem(
    403, 'passkey_required', 'password_invalid', 'code_invalid', 'code_used',
    'challenge_invalid', 'passkey_refused',
)
@user_bp.problem(429, 'too_many_attempts')
def put_password(body):
    """Change the password, and end every session, this one included.

    With the current password and a TOTP code, or, for an account protected by a
    passkey only, with the passkey challenged by `POST /v1/user/password/options`.
    """
    user = get_current_user()
    method = _by_passkey(user, body) if 'challenge_token' in body else _by_code(user, body)
    user.set_password(body['new_password'])
    user.revoke_tokens()
    _audit(user, {'success': True, 'method': method})
    db.session.commit()
    notify_security_event(user, SecurityEvent.PASSWORD_CHANGED)
