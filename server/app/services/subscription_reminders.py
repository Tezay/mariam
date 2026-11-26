"""Emails to a site's admins as the end of its subscription period comes near.

Only a period whose renewal is still to decide, or whose end is announced, has
anything to remind: a covered end never sends one. Each threshold goes out once
for a given last day, which `subscription_reminders` keeps.
"""
from dataclasses import dataclass
from datetime import date

from ..extensions import db
from ..models import Restaurant, SiteMembership, SubscriptionReminder, User
from ..utils.time import format_date_fr, paris_today
from ..utils.urls import frontend_base_url
from .access import ADMIN
from .email_service import Kind, is_configured, render_email, send_email
from .redis_client import acquire_job_lock
from .subscriptions import ENDING, Standing, due_reminder, periods_by_site, standing

LOCK_TTL = 24 * 3600


@dataclass(frozen=True)
class Notice:
    site: Restaurant
    ends_on: date
    days: int
    reason: str


def notice_of(site: Restaurant, position: Standing, days: int) -> Notice:
    if position.end == ENDING:
        reason = 'ending'
    else:
        reason = 'trial' if position.current.kind == 'trial' else 'renewal'
    return Notice(site, position.current.ends_on, days, reason)


def due_notices(today: date) -> list[Notice]:
    """The reminders whose threshold an active site has crossed and no email has carried."""
    sites = Restaurant.query.filter(Restaurant.is_active.is_(True)).all()
    periods = periods_by_site([site.id for site in sites])
    sent = {
        (row.restaurant_id, row.ends_on, row.days)
        for row in SubscriptionReminder.query.filter(SubscriptionReminder.ends_on >= today)
    }
    notices = []
    for site in sites:
        position = standing(periods[site.id], today)
        days = due_reminder(position)
        if days is not None and (site.id, position.current.ends_on, days) not in sent:
            notices.append(notice_of(site, position, days))
    return notices


def site_admins(site_ids: list[int]) -> dict[int, list[User]]:
    rows = (
        db.session.query(SiteMembership.restaurant_id, User)
        .join(User, User.id == SiteMembership.user_id)
        .filter(
            SiteMembership.restaurant_id.in_(site_ids),
            SiteMembership.role == ADMIN,
            User.is_active.is_(True),
            User.email.isnot(None),
        )
        .order_by(User.id)
    )
    admins: dict[int, list[User]] = {site_id: [] for site_id in site_ids}
    for site_id, user in rows:
        admins[site_id].append(user)
    return admins


def reminder_mail(notices: list[Notice]) -> dict:
    return render_email('subscription_reminder', sites=[
        {
            'name': notice.site.name,
            'date': format_date_fr(notice.ends_on),
            'reason': notice.reason,
            'url': (
                f'{frontend_base_url()}/admin/{notice.site.organization.slug}/'
                f'{notice.site.slug}/subscription'
            ),
        }
        for notice in notices
    ])


def send_notices(notices: list[Notice]) -> set[int]:
    """One email per admin, naming each of its sites due; the ids of the sites it reached."""
    admins = site_admins([notice.site.id for notice in notices])
    recipients: dict[int, tuple[User, list[Notice]]] = {}
    for notice in notices:
        for user in admins[notice.site.id]:
            recipients.setdefault(user.id, (user, []))[1].append(notice)
    reached = set()
    for user, own in recipients.values():
        mail = reminder_mail(own)
        if send_email(user.email, mail['subject'], mail['text'], mail['html'],
                      kind=Kind.SUBSCRIPTION):
            reached.update(notice.site.id for notice in own)
    return reached


def send_subscription_reminders(app) -> int:
    """The day's reminders, sent once; a threshold missed by every admin is tried again."""
    with app.app_context():
        if not is_configured():
            app.logger.info('SMTP not configured, subscription reminders skipped')
            return 0
        today = paris_today()
        if not acquire_job_lock(f'subscription_reminders:{today}', LOCK_TTL):
            return 0
        notices = due_notices(today)
        reached = send_notices(notices)
        for notice in notices:
            if notice.site.id in reached:
                db.session.add(SubscriptionReminder(
                    restaurant_id=notice.site.id, ends_on=notice.ends_on, days=notice.days
                ))
        db.session.commit()
        app.logger.info('Subscription reminders sent for %s sites', len(reached))
        return len(reached)
