from datetime import timedelta

from flask_jwt_extended import (
    create_access_token,
    decode_token,
    get_jwt,
    get_jwt_identity,
    jwt_required,
)

from ...extensions import db
from ...models import AuditLog, User
from ...problems import Problem
from ...schemas.auth import (
    SessionSchema,
    SessionTransferSchema,
    SessionTransferValidateSchema,
    TokenRefreshSchema,
)
from ...security import (
    SESSION_CLAIM,
    claim_token,
    get_client_ip,
    is_token_blacklisted,
    limiter,
)
from ..helpers import account_view, get_current_user, step_up_once_enrolled
from ._common import (
    account_disabled,
    account_not_found,
    renewed_access_token,
    revoke_until_expiry,
    token_pair,
)
from .blueprint import auth_bp

TRANSFER_TTL = timedelta(minutes=5)
_CONFIRMED_UNTIL = 'session_transfer_confirmed_until'


def _transfer_refused() -> Problem:
    return Problem(401, 'transfer_invalid', 'Code de transfert expiré ou invalide.')


@auth_bp.route('/refresh', methods=['POST'])
@limiter.limit('10 per minute')
@jwt_required(refresh=True)
@auth_bp.response(200, TokenRefreshSchema)
def refresh():
    """Get a new access token.

    Authenticated by the refresh token. The new access token is never confirmed:
    only presenting a second factor confirms a session.
    """
    return {'access_token': renewed_access_token()}


@auth_bp.route('/logout', methods=['POST'])
@limiter.limit('20 per minute')
@jwt_required(refresh=True)
@auth_bp.response(204)
def logout():
    """Sign out.

    Authenticated by the refresh token, which is revoked with every access token issued
    from it.
    """
    revoke_until_expiry(get_jwt())

    AuditLog.log(
        action=AuditLog.ACTION_LOGOUT,
        user_id=int(get_jwt_identity()),
        ip_address=get_client_ip(),
    )
    db.session.commit()


@auth_bp.route('/session-transfer/generate', methods=['POST'])
@limiter.limit('10 per minute')
@jwt_required()
@step_up_once_enrolled
@auth_bp.response(200, SessionTransferSchema)
@auth_bp.problem(403, 'step_up_required')
def session_transfer_generate():
    """Hand the session over to another device.

    Asks an account that has a second factor for a confirmed session. Returns a
    single-use token, valid five minutes, that `/session-transfer/validate` exchanges
    for a session on the other device, confirmed until the same time as this one.
    Signing out of this session ends the token with it.
    """
    user = get_current_user()

    presented = get_jwt()
    transfer_token = create_access_token(
        identity=str(user.id),
        additional_claims={
            'session_transfer': True,
            _CONFIRMED_UNTIL: presented['fresh'],
            SESSION_CLAIM: presented.get(SESSION_CLAIM),
        },
        expires_delta=TRANSFER_TTL,
    )
    return {'transfer_token': transfer_token, 'expires_in': int(TRANSFER_TTL.total_seconds())}


@auth_bp.route('/session-transfer/validate', methods=['POST'])
@auth_bp.doc(security=[])
@limiter.limit('10 per minute')
@auth_bp.arguments(SessionTransferValidateSchema)
@auth_bp.response(200, SessionSchema)
@auth_bp.problem(401, 'transfer_invalid', 'transfer_used')
@auth_bp.problem(403, 'account_disabled')
@auth_bp.problem(404, 'account_not_found')
def session_transfer_validate(body):
    """Open a session from a transfer token.

    The session inherits what is left of the confirmation of the one that handed it
    over: the receiving device has no second factor of its own to confirm with yet.
    """
    try:
        claims = decode_token(body['transfer_token'])
    except Exception:
        raise _transfer_refused() from None
    if not claims.get('session_transfer'):
        raise _transfer_refused()

    user = db.session.get(User, int(claims['sub']))
    if not user:
        raise account_not_found()
    if not user.is_active:
        raise account_disabled()
    # Decoded by hand, so the token loader never saw it: ending the account's
    # sessions, or signing out of the one that handed over, ends the hand-overs
    # in flight too.
    origin = claims.get(SESSION_CLAIM)
    if user.has_revoked(claims['iat'], None) or (origin and is_token_blacklisted(origin)):
        raise _transfer_refused()

    if not claim_token(claims['jti'], int(TRANSFER_TTL.total_seconds())):
        raise Problem(401, 'transfer_used', 'Ce code a déjà servi. Générez-en un autre.')

    AuditLog.log(
        action=AuditLog.ACTION_LOGIN,
        user_id=user.id,
        details={'method': 'session_transfer'},
        ip_address=get_client_ip(),
    )
    db.session.commit()

    return {
        'user': account_view(user),
        **token_pair(user, confirmed=claims.get(_CONFIRMED_UNTIL)),
    }
