import hashlib
import time
from datetime import timedelta

from flask import after_this_request, current_app
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    get_jti,
    get_jwt,
    get_jwt_identity,
    set_access_cookies,
    set_refresh_cookies,
    unset_jwt_cookies,
)
from limits import parse

from ...extensions import db
from ...models import AuditLog, User
from ...problems import Problem
from ...security import (
    SESSION_CLAIM,
    blacklist_token,
    claim_token,
    get_client_ip,
    seconds_until_reset,
    spend,
)
from ...services import totp
from ..helpers import account_view

# Counted from the moment a second factor is presented. Nothing extends it:
# neither using the session, nor refreshing it, nor handing it over.
CONFIRMATION_WINDOW = timedelta(minutes=10)

# Counted by account, whatever the addresses the codes come from.
WRONG_CODES = parse('10 per hour')


def _lifetime(setting: str) -> int | None:
    expires = current_app.config[setting]
    return int(expires.total_seconds()) if expires else None


def _hand_over(access_token: str, refresh_token: str | None = None) -> None:
    @after_this_request
    def set_cookies(response):
        # Runs on an error response too, which must not open a session.
        if response.status_code >= 400:
            return response
        # As long as the token lives, rather than the library's year or the
        # browsing session: an app installed from the browser inherits them.
        set_access_cookies(
            response, access_token, max_age=_lifetime('JWT_ACCESS_TOKEN_EXPIRES')
        )
        if refresh_token:
            set_refresh_cookies(
                response, refresh_token, max_age=_lifetime('JWT_REFRESH_TOKEN_EXPIRES')
            )
        return response


def _confirmed_for(confirmed: timedelta | float | None) -> int:
    if isinstance(confirmed, timedelta):
        return int(confirmed.total_seconds())
    return max(0, int(confirmed - time.time())) if confirmed else 0


def open_session(
    user: User, *, confirmed: timedelta | float | None = None, claims: dict | None = None
) -> dict[str, int]:
    """Hands the browser a new session, in its cookies.

    `confirmed` is `CONFIRMATION_WINDOW` for a caller that has just presented a
    second factor, or the Unix time an earlier confirmation runs until.
    """
    identity = str(user.id)
    refresh_token = create_refresh_token(identity=identity, additional_claims=claims)
    _hand_over(
        create_access_token(
            identity=identity,
            fresh=confirmed or False,
            additional_claims={**(claims or {}), SESSION_CLAIM: get_jti(refresh_token)},
        ),
        refresh_token,
    )
    return {'confirmed_for': _confirmed_for(confirmed)}


def renew_session(*, confirmed: timedelta | None = None) -> dict[str, int]:
    """A new access token for the session of the token that authenticates the request.

    `confirmed` as for `open_session`.
    """
    presented = get_jwt()
    carried = {
        # Carried over: an access token issued within the second of the
        # revocation that kept this session would fall under it.
        User.REVOCATION_MARKER: presented.get(User.REVOCATION_MARKER),
        SESSION_CLAIM: (
            presented['jti'] if presented['type'] == 'refresh' else presented.get(SESSION_CLAIM)
        ),
    }
    _hand_over(create_access_token(
        identity=get_jwt_identity(),
        fresh=confirmed or False,
        additional_claims={name: value for name, value in carried.items() if value},
    ))
    return {'confirmed_for': _confirmed_for(confirmed)}


def reopen_session(user: User) -> None:
    """Ends every session of the account and opens one for the caller.

    The new session is not confirmed: what follows a change of sign-in address
    asks for the second factor again.
    """
    user.revoke_tokens()
    open_session(user, claims={User.REVOCATION_MARKER: user.revocation_marker()})


def forget_session() -> None:
    @after_this_request
    def unset_cookies(response):
        unset_jwt_cookies(response)
        return response


def revoke_until_expiry(claims: dict) -> None:
    if claims.get('jti') and claims.get('exp'):
        blacklist_token(claims['jti'], max(1, int(claims['exp'] - time.time())))


def code_refusal(user_id: int, secret: str | None, code: str, status: int) -> Problem | None:
    """Why a TOTP code is refused, or None once it is accepted and spent.

    `status` is 401 before a session exists, 403 within one.
    """
    wait = seconds_until_reset(WRONG_CODES, 'wrong-code', str(user_id))
    if wait is not None:
        return Problem(
            429, 'too_many_attempts', 'Trop de codes erronés. Réessayez plus tard.',
            headers={'Retry-After': str(wait)},
        )
    # TOTP turned off between the two steps of a sign-in leaves the second without a secret.
    if not secret or (step := totp.accepted_step(secret, code)) is None:
        spend(WRONG_CODES, 'wrong-code', str(user_id))
        return Problem(status, 'code_invalid', 'Code invalide.')
    # Keyed by secret too: a new app's first code may share its step with the old app's last.
    fingerprint = hashlib.sha256(secret.encode()).hexdigest()[:16]
    if not claim_token(f'totp:{user_id}:{fingerprint}:{step}', totp.CODE_LIFETIME):
        return Problem(status, 'code_used', 'Ce code a déjà servi. Attendez le suivant.')
    return None


def complete_login(user: User) -> dict:
    """Opens the session once every factor has been checked."""
    # Checked here too: an account can be disabled between two sign-in steps.
    if not user.is_active:
        raise account_disabled()

    user.update_last_login()
    AuditLog.log(action=AuditLog.ACTION_LOGIN, user_id=user.id, ip_address=get_client_ip())
    db.session.commit()

    return {
        'user': account_view(user),
        # A password alone, on an account still without a second factor,
        # confirms nothing.
        **open_session(user, confirmed=CONFIRMATION_WINDOW if user.has_second_factor() else None),
    }


def account_disabled() -> Problem:
    return Problem(403, 'account_disabled', 'Ce compte est désactivé.')


def account_not_found() -> Problem:
    return Problem(404, 'account_not_found', 'Compte introuvable.')


def challenge_refused(status: int) -> Problem:
    return Problem(status, 'challenge_invalid', 'Défi expiré ou invalide. Recommencez.')


def passkey_refused(status: int) -> Problem:
    """Never the library's reason, which would tell a caller which check failed."""
    return Problem(status, 'passkey_refused', "La passkey n'a pas pu être vérifiée.")


def credential_unreadable() -> Problem:
    return Problem(
        422, 'validation_failed', 'Certaines valeurs envoyées sont invalides.',
        errors=[{'pointer': '/credential', 'detail': 'Identifiant de passkey illisible.'}],
    )
