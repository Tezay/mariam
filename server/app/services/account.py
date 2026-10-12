"""Changes to an account that the dashboard and the CLI must make the same way."""
import ipaddress
from enum import StrEnum

from flask import has_request_context, request

from ..models import ActivationLink, User
from ..security import get_client_ip
from ..utils.time import format_date_fr, paris_now
from . import email_service
from .email_service import Kind
from .passkeys import describe_device


class SecurityEvent(StrEnum):
    PASSWORD_CHANGED = 'password_changed'
    PASSKEY_ADDED = 'passkey_added'
    PASSKEY_REMOVED = 'passkey_removed'
    TOTP_ENABLED = 'totp_enabled'
    TOTP_REPLACED = 'totp_replaced'
    TOTP_DISABLED = 'totp_disabled'
    SECOND_FACTORS_RESET = 'second_factors_reset'


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
    return email_service.send_email(
        previous, alert['subject'], alert['text'], alert['html'], kind=Kind.SECURITY
    )


def notify_password_reset(user: User, url: str) -> bool:
    mail = email_service.render_email('password_reset', url=url)
    return email_service.send_email(
        user.email, mail['subject'], mail['text'], mail['html'], kind=Kind.RESET
    )


def _client_address() -> str | None:
    # Read from headers a client can forge once it bypasses the proxy: only
    # what parses as an address may reach the message.
    try:
        return str(ipaddress.ip_address(get_client_ip()))
    except ValueError:
        return None


def notify_security_event(user: User, event: SecurityEvent) -> bool:
    """To call after the commit: an alert for a change that then rolled back would be false.

    Nothing typed by whoever made the change reaches the message, a passkey's
    name included: the alert exists to denounce that person.
    """
    if not user.is_active:
        return False
    now = paris_now()
    # A reset is an administrator's act: the holder is not told where it came from.
    own_act = event is not SecurityEvent.SECOND_FACTORS_RESET and has_request_context()
    alert = email_service.render_email(
        'security_alert',
        event=event,
        when=f'{format_date_fr(now.date())} à {now.hour} h {now.minute:02d}',
        device=describe_device(request.user_agent.string) if own_act else None,
        ip_address=_client_address() if own_act else None,
    )
    return email_service.send_email(
        user.email, alert['subject'], alert['text'], alert['html'], kind=Kind.SECURITY
    )
