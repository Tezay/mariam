"""Short-lived proof that the caller just re-authenticated.

Guards actions an access token alone should not authorise (deleting an account).
The proof is a separate single-use JWT rather than a claim on the session token,
so it cannot be replayed for the rest of the 30-minute session.
"""
from datetime import timedelta

from flask_jwt_extended import create_access_token, decode_token

from ..security import blacklist_token, is_token_blacklisted

STEP_UP_TTL = timedelta(minutes=5)
_CLAIM = 'step_up'


def issue_step_up_token(user_id: int) -> str:
    return create_access_token(
        identity=str(user_id),
        expires_delta=STEP_UP_TTL,
        additional_claims={_CLAIM: True},
    )


def consume_step_up_token(token: str, user_id: int) -> bool:
    """Validate the proof and burn it, so one confirmation covers one action."""
    if not token:
        return False
    try:
        payload = decode_token(token)
    except Exception:
        return False

    if not payload.get(_CLAIM) or payload.get('sub') != str(user_id):
        return False

    jti = payload.get('jti')
    if not jti or is_token_blacklisted(jti):
        return False

    blacklist_token(jti, int(STEP_UP_TTL.total_seconds()))
    return True
