"""Changes to an account that the dashboard and the CLI must make the same way."""
from ..models import User


def reset_second_factor(user: User, *, totp: bool = True, passkeys: bool = True) -> int:
    """Returns the number of passkeys removed."""
    removed = user.passkeys.delete() if passkeys else 0
    if totp:
        user.disable_mfa()
    # A session opened with the factor being removed must not survive it.
    user.revoke_tokens()
    return removed
