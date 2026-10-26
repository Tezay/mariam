from datetime import UTC, datetime, timedelta

from flask_jwt_extended import create_access_token, decode_token
from werkzeug.security import check_password_hash, generate_password_hash

from ...extensions import db
from ...models import AuditLog, Passkey, User
from ...problems import Problem
from ...schemas.auth import (
    LoginResponseSchema,
    LoginSchema,
    MFAVerifySchema,
    PasskeyAssertionSchema,
    SessionSchema,
    WebAuthnOptionsSchema,
)
from ...security import claim_token, get_client_ip, is_token_blacklisted, limiter
from ...services import passkeys
from ...services.passkeys import Ceremony
from ._common import (
    account_disabled,
    account_not_found,
    challenge_refused,
    code_refusal,
    complete_login,
    credential_unreadable,
    passkey_refused,
)
from .blueprint import auth_bp

MFA_TOKEN_TTL = timedelta(minutes=10)

# Hashed once, so that an unknown email costs a hash check too and cannot be told
# from a wrong password by its timing.
_DUMMY_PASSWORD_HASH = generate_password_hash('mariam-timing-equalizer')


def _mfa_token_refused() -> Problem:
    return Problem(401, 'mfa_token_invalid', 'Étape de connexion expirée. Recommencez.')


@auth_bp.route('/login', methods=['POST'])
@auth_bp.doc(security=[])
@limiter.limit('5 per minute')
@auth_bp.arguments(LoginSchema)
@auth_bp.response(200, LoginResponseSchema)
@auth_bp.problem(401, 'credentials_invalid')
@auth_bp.problem(403, 'account_disabled', 'passkey_only')
def login(body):
    """Sign in with email and password.

    Opens the session when the account has no second factor. With TOTP enabled,
    returns an `mfa_token` instead, to finish with `/mfa/verify`. An account
    protected by a passkey only signs in with `/passkey/login/*`.
    """
    user = User.query.filter_by(email=body['email']).first()

    if user is None:
        check_password_hash(_DUMMY_PASSWORD_HASH, body['password'])
    if not user or not user.check_password(body['password']):
        AuditLog.log(
            action=AuditLog.ACTION_LOGIN_FAILED,
            details={'email': body['email']},
            ip_address=get_client_ip(),
        )
        db.session.commit()
        raise Problem(401, 'credentials_invalid', 'Adresse ou mot de passe incorrect.')

    if not user.is_active:
        raise account_disabled()

    if user.mfa_enabled:
        return {
            'mfa_required': True,
            'mfa_token': create_access_token(
                identity=str(user.id),
                additional_claims={'mfa_pending': True},
                expires_delta=MFA_TOKEN_TTL,
            ),
        }

    if user.passkeys.count() > 0:
        raise Problem(
            403, 'passkey_only',
            'Ce compte se connecte avec sa passkey : utilisez votre appareil.',
        )

    return complete_login(user)


@auth_bp.route('/mfa/verify', methods=['POST'])
@auth_bp.doc(security=[])
@limiter.limit('5 per minute')
@auth_bp.arguments(MFAVerifySchema)
@auth_bp.response(200, SessionSchema)
@auth_bp.problem(401, 'mfa_token_invalid', 'code_invalid', 'code_used')
@auth_bp.problem(403, 'account_disabled')
@auth_bp.problem(404, 'account_not_found')
@auth_bp.problem(429, 'too_many_attempts')
def verify_mfa(body):
    """Finish a sign-in with the authenticator-app code.

    The `mfa_token` from `/login` works once, within ten minutes.
    """
    try:
        claims = decode_token(body['mfa_token'])
        user_id = int(claims['sub'])
    except Exception:
        raise _mfa_token_refused() from None
    if not claims.get('mfa_pending'):
        raise _mfa_token_refused()

    # Single use: a spent token is refused here, and a matching code spends it below.
    jti = claims.get('jti')
    if jti and is_token_blacklisted(jti):
        raise _mfa_token_refused()

    user = db.session.get(User, user_id)
    if not user:
        raise account_not_found()

    # Decoded by hand, so the token loader never saw it: a password step taken
    # before the account's sessions were ended does not finish the sign-in.
    if user.has_revoked(claims['iat'], None):
        raise _mfa_token_refused()

    if refusal := code_refusal(user.id, user.mfa_secret, body['code'], 401):
        AuditLog.log(
            action=AuditLog.ACTION_LOGIN_FAILED,
            user_id=user.id,
            details={'reason': refusal.code},
            ip_address=get_client_ip(),
        )
        db.session.commit()
        raise refusal

    if jti:
        exp = claims.get('exp')
        remaining = exp - datetime.now(UTC).timestamp() if exp else MFA_TOKEN_TTL.total_seconds()
        # Decided here rather than by the lookup above: of two requests racing
        # on the token with a right code, one only opens a session.
        if not claim_token(jti, max(1, int(remaining))):
            raise _mfa_token_refused()

    return complete_login(user)


@auth_bp.route('/passkey/login/begin', methods=['POST'])
@auth_bp.doc(security=[])
@limiter.limit('10 per minute')
@auth_bp.response(200, WebAuthnOptionsSchema)
def passkey_login_begin():
    """Start a passwordless sign-in.

    The options allow any passkey registered for this site: the one the user picks
    identifies the account.
    """
    # No account yet: the assertion names it through its passkey.
    return passkeys.begin_authentication(0, [], Ceremony.LOGIN)


@auth_bp.route('/passkey/login/complete', methods=['POST'])
@auth_bp.doc(security=[])
@limiter.limit('10 per minute')
@auth_bp.arguments(PasskeyAssertionSchema)
@auth_bp.response(200, SessionSchema)
@auth_bp.problem(401, 'challenge_invalid', 'passkey_unknown', 'passkey_refused')
@auth_bp.problem(403, 'account_disabled')
def passkey_login_complete(body):
    """Finish a passwordless sign-in."""
    try:
        _, challenge = passkeys.read_challenge(body['challenge_token'], Ceremony.LOGIN)
        raw_id = passkeys.credential_id(body['credential'])
    except passkeys.InvalidChallenge:
        raise challenge_refused(401) from None
    except passkeys.InvalidCredential:
        raise credential_unreadable() from None

    passkey = Passkey.query.filter_by(credential_id=raw_id).first()
    if passkey is None:
        raise Problem(401, 'passkey_unknown', "Cette passkey n'est enregistrée sur aucun compte.")
    user = passkey.user

    try:
        passkeys.verify_assertion(passkey, body['credential'], challenge)
    except passkeys.VerificationFailed as exc:
        AuditLog.log(
            action=AuditLog.ACTION_LOGIN_FAILED,
            user_id=user.id,
            details={'reason': 'passkey_login_failed', 'error': str(exc)},
            ip_address=get_client_ip(),
        )
        db.session.commit()
        raise passkey_refused(401) from None

    return complete_login(user)
