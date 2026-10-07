import time
from datetime import timedelta

from flask import jsonify
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    get_jti,
    get_jwt,
    get_jwt_identity,
)

from ...extensions import db
from ...models import AuditLog, User
from ...security import SESSION_CLAIM, blacklist_token, get_client_ip

NO_SESSION = 'No valid session.'
NOT_CONFIRMED = 'Session not confirmed: `step_up_required` is set.'
# Counted from the moment a second factor is presented. Nothing extends it:
# neither using the session, nor refreshing it, nor handing it over.
CONFIRMATION_WINDOW = timedelta(minutes=10)


def token_pair(
    user: User, *, confirmed: timedelta | float | None = None, claims: dict | None = None
) -> dict[str, str]:
    """`confirmed` is `CONFIRMATION_WINDOW` for a caller that has just presented a
    second factor, or the Unix time an earlier confirmation runs until.
    """
    identity = str(user.id)
    refresh_token = create_refresh_token(identity=identity, additional_claims=claims)
    return {
        'access_token': create_access_token(
            identity=identity,
            fresh=confirmed or False,
            additional_claims={**(claims or {}), SESSION_CLAIM: get_jti(refresh_token)},
        ),
        'refresh_token': refresh_token,
    }


def renewed_access_token(*, confirmed: timedelta | None = None) -> str:
    """A new access token for the session of the token that authenticates the request.

    `confirmed` as for `token_pair`.
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
    return create_access_token(
        identity=get_jwt_identity(),
        fresh=confirmed or False,
        additional_claims={name: value for name, value in carried.items() if value},
    )


def reissued_token_pair(user: User) -> dict[str, str]:
    """Ends every session of the account and opens one for the caller.

    The new session is not confirmed: what follows a change of sign-in address
    asks for the second factor again.
    """
    user.revoke_tokens()
    return token_pair(user, claims={User.REVOCATION_MARKER: user.revocation_marker()})


def revoke_until_expiry(claims: dict) -> None:
    if claims.get('jti') and claims.get('exp'):
        blacklist_token(claims['jti'], max(1, int(claims['exp'] - time.time())))


def complete_login(user: User):
    """Opens the session once every factor has been checked."""
    # Checked here too: an account can be disabled between two sign-in steps.
    if not user.is_active:
        return account_disabled()

    user.update_last_login()
    AuditLog.log(action=AuditLog.ACTION_LOGIN, user_id=user.id, ip_address=get_client_ip())
    db.session.commit()

    return jsonify({
        'message': 'Connexion réussie',
        'user': user.to_dict(include_tenant=True),
        # A password alone, on an account still without a second factor,
        # confirms nothing.
        **token_pair(user, confirmed=CONFIRMATION_WINDOW if user.has_second_factor() else None),
    }), 200


def account_disabled():
    return jsonify({'error': 'Ce compte est désactivé'}), 403


def user_not_found():
    return jsonify({'error': 'Utilisateur non trouvé'}), 404


def weak_password():
    return jsonify({
        'error': 'Mot de passe trop faible',
        'message': 'Le mot de passe doit contenir au moins 12 caractères, '
                   'une majuscule, une minuscule, un chiffre et un caractère spécial.',
    }), 400
