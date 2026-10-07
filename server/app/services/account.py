"""Changes to an account that the dashboard and the CLI must make the same way."""
from ..models import ActivationLink, User
from . import email_service


def reset_second_factor(user: User, *, totp: bool = True, passkeys: bool = True) -> int:
    """Returns the number of passkeys removed."""
    removed = user.passkeys.delete() if passkeys else 0
    if totp:
        user.disable_mfa()
    # A session opened with the factor being removed must not survive it.
    user.revoke_tokens()
    return removed


def change_email(user: User, new_email: str) -> str:
    """Returns the previous address, for the alert that follows the commit."""
    previous = user.email
    # A reset link names its account by address: left pending, it would follow
    # the old one to whoever registers it next.
    pending = ActivationLink.query.filter_by(
        email=previous, link_type='password_reset', used_at=None
    )
    for link in pending:
        link.mark_as_used()
    user.email = new_email
    return previous


def notify_email_changed(previous: str, current: str) -> bool:
    """Sent to the old address: after a hostile change, the new one is the attacker's."""
    local, _, domain = current.partition('@')
    # Masked: whoever reads the old mailbox need not learn the new address.
    alert = email_service.render_email('email_changed', new_address=f'{local[:1]}•••@{domain}')
    return email_service.send_email(previous, alert['subject'], alert['text'], alert['html'])
