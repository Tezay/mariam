"""
flask subscription — the periods of a site's subscription, as its contract sets them.

A period only describes the subscription: none of these commands acts on the site,
which `flask site disable` turns off. A site with no period shows no subscription.

Every write records an AuditLog entry with no author and no address, carrying
`via: cli` in its details. Failures raise ClickException.

Usage:
    docker compose exec backend flask subscription add nord --org example \\
        --kind paid --start 2027-01-01 --end 2027-12-31
"""
import click
from flask.cli import AppGroup

from ..extensions import db
from ..models import AuditLog, Organization, Restaurant, SubscriptionPeriod, SubscriptionReminder
from ..models.subscription import KINDS, RENEWALS
from ..services.email_service import Kind, is_configured, send_email
from ..services.subscription_reminders import reminder_mail, site_admins
from ..services.subscriptions import (
    ACTIVE,
    EXPIRED,
    PERIOD_FIELDS,
    Period,
    end_ahead,
    overlapping,
    periods_by_site,
    site_standing,
    standing,
)
from ..utils.time import paris_today
from ..utils.urls import public_page_path
from .lookup import find_organization, find_site

subscription_cli = AppGroup('subscription', help="The periods of a site's subscription.")

ISO_DATE = click.DateTime(formats=['%Y-%m-%d'])
TEXT_FIELDS = {
    'quote': ('quote_ref', 60),
    'order': ('order_ref', 60),
    'payer_name': ('payer_name', 150),
    'payer_siret': ('payer_siret', 14),
    'payer_service_code': ('payer_service_code', 100),
}
DATE_FIELDS = {
    'start': 'starts_on', 'end': 'ends_on', 'tacit_until': 'tacit_until', 'notice_by': 'notice_by',
}
CLEARABLE = {
    'tacit-until': 'tacit_until', 'notice-by': 'notice_by',
    **{name.replace('_', '-'): column for name, (column, _) in TEXT_FIELDS.items()},
}
CARRIED_OVER = ('renewal', 'tacit_until', 'payer_name', 'payer_siret', 'payer_service_code')


def register_commands(app):
    app.cli.add_command(subscription_cli)


def _period_options(required: bool):
    def apply(command):
        options = [
            click.option('--kind', type=click.Choice(KINDS), required=required,
                         help='trial | paid | complimentary'),
            click.option('--start', type=ISO_DATE, required=required, help='First day, YYYY-MM-DD'),
            click.option('--end', type=ISO_DATE, required=required,
                         help='Last day, included, YYYY-MM-DD'),
            click.option('--renewal', type=click.Choice(RENEWALS), default=None,
                         help='undecided (default) | tacit | ending'),
            click.option('--tacit-until', type=ISO_DATE, default=None,
                         help='Last day the tacit renewals may reach; needs --renewal tacit'),
            click.option('--notice-by', type=ISO_DATE, default=None,
                         help='Last day the buyer may decline the renewal'),
            click.option('--quote', default=None, help='Quote reference'),
            click.option('--order', default=None,
                         help='Purchase order, or legal commitment number'),
            click.option('--payer-name', default=None, help='Who pays'),
            click.option('--payer-siret', default=None, help="The payer's SIRET, 14 digits"),
            click.option('--payer-service-code', default=None,
                         help="The payer's e-invoicing service or routing code"),
        ]
        for option in reversed(options):
            command = option(command)
        return command
    return apply


def _given(options: dict) -> dict:
    """The columns the options set, as the model stores them."""
    values = {}
    if options.get('kind'):
        values['kind'] = options['kind']
    if options.get('renewal'):
        values['renewal'] = options['renewal']
    for name, column in DATE_FIELDS.items():
        if options.get(name):
            values[column] = options[name].date()
    for name, (column, longest) in TEXT_FIELDS.items():
        value = options.get(name)
        if value is None:
            continue
        if name == 'payer_siret':
            value = ''.join(value.split())
            if not (value.isdigit() and len(value) == 14):
                raise click.ClickException('--payer-siret: 14 digits.')
        else:
            value = value.strip()
            if not value or len(value) > longest:
                raise click.ClickException(
                    f'--{name.replace("_", "-")}: 1 to {longest} characters.'
                )
        values[column] = value
    return values


def _settle(period: SubscriptionPeriod) -> None:
    """Drops `tacit_until` from a period no longer tacit, then refuses an inconsistent one."""
    if period.ends_on < period.starts_on:
        raise click.ClickException('--end comes before --start.')
    if period.renewal != 'tacit':
        period.tacit_until = None
    elif not period.tacit_until or period.tacit_until <= period.ends_on:
        raise click.ClickException('A tacit renewal needs --tacit-until, after --end.')
    if period.notice_by and period.notice_by > period.ends_on:
        raise click.ClickException('--notice-by comes after --end.')
    if overlapping(period.restaurant_id, period.starts_on, period.ends_on, other_than=period.id):
        raise click.ClickException('This period overlaps another one of the site.')


def _path(site: Restaurant) -> str:
    return public_page_path(site).lstrip('/')


def _audit(action: str, period: SubscriptionPeriod, site: Restaurant, **details) -> None:
    AuditLog.log(
        action=action,
        target_type='subscription_period',
        target_id=period.id,
        details={'via': 'cli', 'site': _path(site), **details},
        restaurant_id=site.id,
        organization_id=site.organization_id,
    )


def _snapshot(period: SubscriptionPeriod) -> dict:
    return {
        column: str(value) for column in PERIOD_FIELDS
        if (value := getattr(period, column)) is not None
    }


def _find_period(period_id: int) -> SubscriptionPeriod:
    period = db.session.get(SubscriptionPeriod, period_id)
    if period is None:
        raise click.ClickException(f'No subscription period #{period_id}.')
    return period


def _span(period: Period) -> str:
    return f'{period.kind} {period.starts_on} → {period.ends_on}'


def _state_label(position) -> str:
    if position.state == ACTIVE:
        return f'active, {position.end}, {position.days_left} day(s) left'
    return position.state


@subscription_cli.command('list')
@click.option('--org', default=None, help='Filter by organization (id or slug)')
@click.option('--ending-within', type=int, default=None,
              help='Only the sites whose period ends within that many days, or has ended')
def list_subscriptions(org, ending_within):
    """Where each site stands, sites with no period included."""
    query = Restaurant.query.join(Organization, Organization.id == Restaurant.organization_id)
    if org:
        query = query.filter(Restaurant.organization_id == find_organization(org).id)
    sites = query.order_by(Organization.slug, Restaurant.slug).all()
    periods = periods_by_site([site.id for site in sites])
    today = paris_today()

    rows = []
    for site in sites:
        position = standing(periods[site.id], today, site.is_active)
        if ending_within is not None and not (
            position.state == EXPIRED
            or (position.days_left is not None and position.days_left <= ending_within)
        ):
            continue
        rows.append((site, position))
    if not rows:
        click.echo('No site matches.')
        return

    click.echo(f"{'PATH':<32} {'STATE':<9} {'PERIOD':<34} {'END':<10} DAYS")
    for site, position in rows:
        span = _span(position.current) if position.current else '—'
        click.echo(
            f'{_path(site)[:31]:<32} {position.state:<9} {span:<34} '
            f"{position.end or '—':<10} {'' if position.days_left is None else position.days_left}"
        )
    click.echo(f'\n{len(rows)} site(s).')


@subscription_cli.command('show')
@click.argument('site')
@click.option('--org', default=None, help='Organization (id or slug), when several share the slug')
def show_subscription(site, org):
    """Show a site's standing and every period recorded for it."""
    restaurant = find_site(site, org)
    position = site_standing(restaurant, paris_today())
    rows = (
        SubscriptionPeriod.query.filter_by(restaurant_id=restaurant.id)
        .order_by(SubscriptionPeriod.starts_on.desc()).all()
    )

    click.echo('\n' + '=' * 60)
    click.echo(f'  {restaurant.name} ({_path(restaurant)})')
    click.echo('=' * 60)
    click.echo(f'  State: {_state_label(position)}')
    if position.current and position.current.renewed_tacitly:
        click.echo(f'  Renewed tacitly: {_span(position.current)}')
    for row in rows:
        terms = [row.renewal]
        if row.tacit_until:
            terms.append(f'until {row.tacit_until}')
        if row.notice_by:
            terms.append(f'notice by {row.notice_by}')
        click.echo(f'  #{row.id:<4} {_span(Period.of(row)):<34} {", ".join(terms)}')
        references = [
            f'{label} {value}' for label, value in (
                ('quote', row.quote_ref), ('order', row.order_ref), ('payer', row.payer_name),
                ('SIRET', row.payer_siret), ('service', row.payer_service_code),
            ) if value
        ]
        if references:
            click.echo(f'         {" · ".join(references)}')
    if not rows:
        click.echo('  No period recorded.')
    reminders = (
        SubscriptionReminder.query.filter_by(restaurant_id=restaurant.id)
        .order_by(SubscriptionReminder.sent_at.desc()).all()
    )
    for reminder in reminders:
        click.echo(
            f'  Reminder: {reminder.days} days before {reminder.ends_on}, '
            f'sent {reminder.sent_at:%Y-%m-%d}'
        )
    click.echo('=' * 60 + '\n')


@subscription_cli.command('add')
@click.argument('site')
@click.option('--org', default=None, help='Organization (id or slug), when several share the slug')
@_period_options(required=True)
@click.option('--from-previous', is_flag=True,
              help="Take the renewal terms and the payer from the site's latest period")
def add_period(site, org, from_previous, **options):
    """Record a period of a site's subscription."""
    restaurant = find_site(site, org)
    values = {'renewal': 'undecided'}
    if from_previous:
        latest = (
            SubscriptionPeriod.query.filter_by(restaurant_id=restaurant.id)
            .order_by(SubscriptionPeriod.starts_on.desc()).first()
        )
        if latest is None:
            raise click.ClickException('--from-previous: the site has no period yet.')
        values.update({column: getattr(latest, column) for column in CARRIED_OVER})
    values.update(_given(options))

    period = SubscriptionPeriod(restaurant_id=restaurant.id, **values)
    _settle(period)
    db.session.add(period)
    db.session.flush()
    _audit(AuditLog.ACTION_SUBSCRIPTION_CREATE, period, restaurant, **_snapshot(period))
    db.session.commit()
    click.echo(f'Period #{period.id} recorded: {_span(Period.of(period))} ({_path(restaurant)})')


@subscription_cli.command('update')
@click.argument('period_id', type=int)
@_period_options(required=False)
@click.option('--clear', 'cleared', multiple=True, type=click.Choice(sorted(CLEARABLE)),
              help='Empty a field; repeat for several')
def update_period(period_id, cleared, **options):
    """Change the fields of a recorded period."""
    period = _find_period(period_id)
    restaurant = db.session.get(Restaurant, period.restaurant_id)
    before = _snapshot(period)
    for column, value in _given(options).items():
        setattr(period, column, value)
    for name in cleared:
        setattr(period, CLEARABLE[name], None)
    _settle(period)
    after = _snapshot(period)
    changes = {
        column: after.get(column) for column in sorted(set(before) | set(after))
        if before.get(column) != after.get(column)
    }
    if not changes:
        click.echo(f'Period #{period.id} unchanged.')
        return
    _audit(AuditLog.ACTION_SUBSCRIPTION_UPDATE, period, restaurant, **changes)
    db.session.commit()
    click.echo(f'Period #{period.id} updated: {", ".join(changes)}')


@subscription_cli.command('delete')
@click.argument('period_id', type=int)
@click.option('--yes', is_flag=True, help='Delete without asking for confirmation')
def delete_period(period_id, yes):
    """Delete a period recorded by mistake."""
    period = _find_period(period_id)
    restaurant = db.session.get(Restaurant, period.restaurant_id)
    label = f'{_span(Period.of(period))} ({_path(restaurant)})'
    if not yes:
        click.confirm(f'Delete period #{period.id}, {label}?', abort=True)
    _audit(AuditLog.ACTION_SUBSCRIPTION_DELETE, period, restaurant, **_snapshot(period))
    db.session.delete(period)
    db.session.commit()
    click.echo(f'Period #{period_id} deleted: {label}')


@subscription_cli.command('send-reminder')
@click.argument('site')
@click.option('--org', default=None, help='Organization (id or slug), when several share the slug')
@click.option('--dry-run', is_flag=True, help='Show the recipients and the email, send nothing')
def send_reminder(site, org, dry_run):
    """Email the site's admins now the reminder its standing calls for.

    Refused when the end is covered or the site is not active. The daily
    reminders keep their own thresholds: this one is not counted among them.
    """
    restaurant = find_site(site, org)
    position = site_standing(restaurant, paris_today())
    end = end_ahead(position)
    if end is None:
        raise click.ClickException(f'Nothing to remind: {_state_label(position)}.')
    admins = site_admins([restaurant.id])[restaurant.id]
    if not admins:
        raise click.ClickException('The site has no active admin with an email address.')
    mail = reminder_mail([(restaurant, end)])

    if dry_run:
        click.echo(f'To: {", ".join(user.email for user in admins)}')
        click.echo(f'Subject: {mail["subject"]}\n')
        click.echo(mail['text'])
        return
    if not is_configured():
        raise click.ClickException('SMTP is not configured: nothing sent.')
    sent = [
        user.email for user in admins
        if send_email(user.email, mail['subject'], mail['text'], mail['html'],
                      kind=Kind.SUBSCRIPTION)
    ]
    click.echo(f'Reminder sent to {len(sent)} of {len(admins)} admin(s): {", ".join(sent) or "—"}')
