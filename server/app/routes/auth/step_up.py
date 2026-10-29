from flask_jwt_extended import jwt_required

from ...extensions import db
from ...models import Passkey
from ...problems import Problem
from ...schemas.auth import (
    ConfirmationSchema,
    PasskeyAssertionSchema,
    StepUpPasswordSchema,
    WebAuthnOptionsSchema,
)
from ...security import limiter
from ...services import passkeys
from ...services.passkeys import Ceremony
from ..helpers import get_current_user
from ._common import (
    CONFIRMATION_WINDOW,
    challenge_refused,
    code_refusal,
    credential_unreadable,
    passkey_refused,
    renew_session,
)
from .blueprint import auth_bp


@auth_bp.route('/step-up/password', methods=['POST'])
@limiter.limit('5 per minute')
@jwt_required()
@auth_bp.arguments(StepUpPasswordSchema)
@auth_bp.response(200, ConfirmationSchema)
@auth_bp.problem(
    403, 'passkey_required', 'second_factor_required', 'password_invalid', 'code_invalid',
    'code_used',
)
@auth_bp.problem(429, 'too_many_attempts')
def step_up_password(body):
    """Confirm identity with the password and the TOTP code.

    Replaces the access cookie with one that opens the routes asking for a
    confirmed session, for ten minutes. A confirmation always attests a second
    factor: an account without TOTP confirms through `/step-up/passkey/*`.
    """
    user = get_current_user()
    if not (user.mfa_enabled and user.mfa_secret):
        if user.passkeys.count() > 0:
            raise Problem(
                403, 'passkey_required', 'Ce compte confirme son identité avec sa passkey.'
            )
        raise Problem(
            403, 'second_factor_required', "Configurez d'abord la double authentification."
        )
    if not user.check_password(body['password']):
        raise Problem(403, 'password_invalid', 'Mot de passe incorrect.')
    if refusal := code_refusal(user.id, user.mfa_secret, body['code'], 403):
        raise refusal
    return renew_session(confirmed=CONFIRMATION_WINDOW)


@auth_bp.route('/step-up/passkey/begin', methods=['POST'])
@limiter.limit('5 per minute')
@jwt_required()
@auth_bp.response(200, WebAuthnOptionsSchema)
@auth_bp.problem(409, 'no_passkey')
def step_up_passkey_begin():
    """Start confirming identity with a passkey."""
    user = get_current_user()
    registered = list(user.passkeys)
    if not registered:
        raise Problem(409, 'no_passkey', "Ce compte n'a aucune passkey.")
    return passkeys.begin_authentication(user.id, registered, Ceremony.STEP_UP)


@auth_bp.route('/step-up/passkey/complete', methods=['POST'])
@limiter.limit('5 per minute')
@jwt_required()
@auth_bp.arguments(PasskeyAssertionSchema)
@auth_bp.response(200, ConfirmationSchema)
@auth_bp.problem(403, 'challenge_invalid', 'passkey_refused')
def step_up_passkey_complete(body):
    """Finish confirming identity with a passkey; the same session as `/step-up/password`."""
    user = get_current_user()
    try:
        owner_id, challenge = passkeys.read_challenge(body['challenge_token'], Ceremony.STEP_UP)
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
    except passkeys.VerificationFailed:
        raise passkey_refused(403) from None

    db.session.commit()
    return renew_session(confirmed=CONFIRMATION_WINDOW)
