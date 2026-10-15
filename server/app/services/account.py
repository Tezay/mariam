"""Changes to an account that the dashboard and the CLI must make the same way."""
from enum import StrEnum

from flask import has_request_context, request

from ..extensions import db
from ..models import ActivationLink, Organization, Restaurant, User
from ..security import get_client_ip
from ..utils.time import format_date_fr, paris_now
from ..utils.urls import frontend_base_url
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


def _one_line(text: str | None) -> str | None:
    return ' '.join(text.split()) if text else None


def notify_invitation(link: ActivationLink, inviter: User) -> bool:
    place = (
        db.session.get(Restaurant, link.restaurant_id) if link.restaurant_id
        else db.session.get(Organization, link.organization_id) if link.organization_id
        else None
    )
    # The two names are typed by accounts and leave for an address outside the
    # product: a line break would let them reshape the message, or its subject.
    mail = email_service.render_email(
        'invitation',
        url=f'{frontend_base_url()}/activate/{link.token}',
        inviter=_one_line(inviter.username),
        place=_one_line(place.name) if place else None,
        role=link.role,
    )
    return email_service.send_email(
        link.email, mail['subject'], mail['text'], mail['html'], kind=Kind.INVITATION
    )


def notify_password_reset(user: User, url: str) -> bool:
    mail = email_service.render_email('password_reset', url=url)
    return email_service.send_email(
        user.email, mail['subject'], mail['text'], mail['html'], kind=Kind.RESET
    )


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
        ip_address=get_client_ip() if own_act else None,
    )
    return email_service.send_email(
        user.email, alert['subject'], alert['text'], alert['html'], kind=Kind.SECURITY
    )
