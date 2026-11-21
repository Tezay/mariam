"""
flask user — account administration from the command line.

Covers what no interface exposes: reading an account's real state, resetting a
second factor, reissuing a link, fixing an address, retiring an account.

Every write records an AuditLog entry with no author and no address, carrying
`via: cli` in its details. Failures raise ClickException, so a script can act on
the exit code.

Usage:
    docker compose exec backend flask user show user@example.com
"""
import click
from flask.cli import AppGroup

from ..extensions import db
from ..models.activation_link import ActivationLink
from ..models.audit_log import AuditLog
from ..models.membership import OrgSupervision, SiteMembership
from ..models.organization import Organization
from ..models.restaurant import Restaurant
from ..models.user import User
from ..services.access import mirror_first_place
from ..services.account import (
    SecurityEvent,
    change_email,
    notify_email_changed,
    notify_security_event,
    reset_second_factor,
)
from ..utils.email_address import canonical_email
from ..utils.time import utc_naive_to_paris
from ..utils.urls import frontend_base_url

user_cli = AppGroup('user', help='Account administration.')


def register_commands(app):
    app.cli.add_command(user_cli)


def _address(value: str) -> str:
    try:
        return canonical_email(value)
    except ValueError as exc:
        raise click.ClickException(f'Not a storable address: {value}') from exc


def _find_user(email: str) -> User:
    user = User.query.filter_by(email=_address(email)).first()
    if not user:
        raise click.ClickException(f'No account with {email}.')
    return user


def _find_restaurant(value: str, org: str | None = None) -> Restaurant:
    organization = _find_organization(org) if org else None
    site = db.session.get(Restaurant, int(value)) if value.isdigit() else None
    if site is None:
        query = Restaurant.query.filter_by(slug=value)
        if organization:
            query = query.filter_by(organization_id=organization.id)
        # A slug is unique within its organization only.
        sites = query.limit(2).all()
        if len(sites) > 1:
            raise click.ClickException(f'Several organizations have a site {value}: pass --org.')
        site = sites[0] if sites else None
    if site is None or (organization and site.organization_id != organization.id):
        raise click.ClickException(f'No such site: {value}')
    return site


def _find_organization(value: str) -> Organization:
    org = db.session.get(Organization, int(value)) if value.isdigit() else None
    if org is None:
        org = Organization.query.filter_by(slug=value).first()
    if org is None:
        raise click.ClickException(f'No such organization: {value}')
    return org


def _resolve_tenant(role: str, restaurant: str | None, org: str | None) -> tuple:
    """(restaurant_id, organization_id, label) for a role and its target."""
    if role == User.ROLE_ORG_ADMIN:
        if not org:
            raise click.ClickException('--org is required for the org_admin role.')
        organization = _find_organization(org)
        return None, organization.id, organization.name

    if not restaurant:
        raise click.ClickException('--restaurant is required for a site role.')
    site = _find_restaurant(restaurant, org)
    return site.id, site.organization_id, site.name


def _audit(
    action: str, user: User, restaurant_id: int | None = None,
    organization_id: int | None = None, **details,
) -> None:
    # No address rather than a marker in an address column: the origin belongs
    # in the details, which the log viewer shows on demand.
    AuditLog.log(
        action=action,
        target_type='user',
        target_id=user.id,
        details={'via': 'cli', 'email': user.email, **details},
        restaurant_id=restaurant_id,
        organization_id=organization_id,
    )


def _places(user) -> list[str]:
    return [
        *(f'{m.restaurant.name} ({m.role})' for m in user.memberships),
        *(f'{s.organization.name} (supervisor)' for s in user.supervisions),
    ]


def _places_label(user) -> str:
    return ', '.join(_places(user)) or '—'


def _place_ids(user) -> list[tuple[int | None, int | None]]:
    return [
        *((m.restaurant_id, m.restaurant.organization_id) for m in user.memberships),
        *((None, s.organization_id) for s in user.supervisions),
    ] or [(None, None)]


def _factors_label(user: User) -> str:
    factors = []
    if user.mfa_enabled:
        factors.append('TOTP')
    count = user.passkeys.count()
    if count:
        factors.append(f'passkey x{count}')
    return ' + '.join(factors) or 'none'


def _date(value) -> str:
    return utc_naive_to_paris(value).strftime('%Y-%m-%d %H:%M') if value else 'never'


def _row(label: str, value) -> None:
    click.echo(f'  {label:<20}: {value}')


@user_cli.command('list')
@click.option('--role', default=None, help='Filter by role on a place: org_admin | admin | editor')
@click.option('--site', default=None, help='Filter by site (id or slug)')
@click.option('--org', default=None, help='Filter by organization (id or slug)')
@click.option('--all', 'show_all', is_flag=True, help='Include disabled accounts')
def list_users(role, site, org, show_all):
    """List accounts with their places and second factor."""
    memberships = db.session.query(SiteMembership.user_id)
    supervisions = db.session.query(OrgSupervision.user_id)
    if role:
        memberships = memberships.filter(SiteMembership.role == role)
        if role != User.ROLE_ORG_ADMIN:
            supervisions = supervisions.filter(db.false())
    if site:
        memberships = memberships.filter(
            SiteMembership.restaurant_id == _find_restaurant(site, org).id
        )
        supervisions = supervisions.filter(db.false())
    elif org:
        organization = _find_organization(org)
        memberships = memberships.join(SiteMembership.restaurant).filter(
            Restaurant.organization_id == organization.id
        )
        supervisions = supervisions.filter(OrgSupervision.organization_id == organization.id)
    query = User.query
    if role or site or org:
        query = query.filter(db.or_(User.id.in_(memberships), User.id.in_(supervisions)))
    if not show_all:
        query = query.filter_by(is_active=True)

    users = query.order_by(User.id).all()
    if not users:
        click.echo('No account matches.')
        return

    click.echo(f"{'ID':<4} {'EMAIL':<32} {'PLACES':<36} {'2FA':<18} STATE")
    for user in users:
        click.echo(
            f'{user.id:<4} {user.email:<32} {_places_label(user)[:35]:<36} '
            f'{_factors_label(user):<18} '
            f"{'active' if user.is_active else 'disabled'}"
        )
    click.echo(f'\n{len(users)} account(s).')


@user_cli.command('show')
@click.argument('email')
def show_user(email):
    """Show the full state of one account."""
    user = _find_user(email)

    click.echo('\n' + '=' * 60)
    click.echo(f'  {user.email}')
    click.echo('=' * 60)
    _row('Id', user.id)
    _row('Name', user.username or '—')
    _row('Places', len(_places(user)))
    for place in _places(user):
        click.echo(f'    · {place}')
    _row('State', 'active' if user.is_active else 'disabled')
    _row('Rescue account', 'yes' if user.is_rescue_account else 'no')
    _row('TOTP', 'enabled' if user.mfa_enabled else 'disabled')

    passkeys = user.passkeys.all()
    _row('Passkeys', len(passkeys))
    for passkey in passkeys:
        used = f'last used {_date(passkey.last_used_at)}' if passkey.last_used_at else 'never used'
        click.echo(
            f"    · {passkey.device_name or 'Unnamed device'} — "
            f'added {_date(passkey.created_at)}, {used}'
        )

    _row('Created', _date(user.created_at))
    _row('Last login', _date(user.last_login))
    if user.tokens_valid_after:
        _row('Tokens revoked', _date(user.tokens_valid_after))
    click.echo('=' * 60 + '\n')


@user_cli.command('invite')
@click.argument('email')
@click.option('--role', required=True, help='org_admin | admin | editor')
@click.option('--restaurant', default=None, help='Target site (id or slug) — site roles')
@click.option('--org', default=None, help="Organization (id or slug): org_admin's, or the site's")
def invite_user(email, role, restaurant, org):
    """Create an activation link for a new account."""
    if role not in User.VALID_ROLES:
        raise click.ClickException(f'Invalid role. Values: {User.VALID_ROLES}')
    email = _address(email)
    if User.query.filter_by(email=email).first():
        raise click.ClickException(
            f'An account with {email} already exists: give it the place with `flask user grant`.'
        )

    restaurant_id, organization_id, destination = _resolve_tenant(role, restaurant, org)
    link = ActivationLink.create_invite_link(
        email=email,
        role=role,
        restaurant_id=restaurant_id,
        organization_id=organization_id,
    )
    db.session.add(link)
    AuditLog.log(
        action=AuditLog.ACTION_ACTIVATION_LINK_CREATE,
        target_type='user',
        details={'via': 'cli', 'email': email, 'role': role},
        restaurant_id=restaurant_id,
        organization_id=organization_id,
    )
    db.session.commit()

    click.echo(f'Invited {email} ({role}) → {destination}')
    click.echo(f'{frontend_base_url()}/activate/{link.token}')
    click.echo('Expires in 72 h, single use.')


@user_cli.command('reset-password')
@click.argument('email')
def reset_password(email):
    """Create a password reset link."""
    user = _find_user(email)
    if not user.is_active:
        raise click.ClickException(f'Account {email} is disabled.')
    # The reset page verifies identity with the code or with a passkey; without
    # either there is nothing to prove the holder of the link is the owner.
    if not user.has_second_factor():
        raise click.ClickException(
            f'{email} has no second factor: use `user invite` to re-enrol the account.'
        )

    link = ActivationLink.create_password_reset_link(email=user.email, expires_hours=72)
    db.session.add(link)
    _audit(AuditLog.ACTION_PASSWORD_RESET_REQUEST, user, method='cli')
    db.session.commit()

    click.echo(f'Password reset link for {email}')
    click.echo(f'{frontend_base_url()}/reset-password/{link.token}')
    click.echo('Expires in 72 h, single use, second factor required.')


@user_cli.command('reset-2fa')
@click.argument('email')
@click.option('--totp', 'only_totp', is_flag=True, help='Remove the TOTP secret only')
@click.option('--passkeys', 'only_passkeys', is_flag=True, help='Remove the passkeys only')
def reset_2fa(email, only_totp, only_passkeys):
    """Remove an account's second factor (TOTP and passkeys by default)."""
    user = _find_user(email)
    drop_totp = only_totp or not only_passkeys
    drop_passkeys = only_passkeys or not only_totp

    removed = reset_second_factor(user, totp=drop_totp, passkeys=drop_passkeys)
    _audit(
        AuditLog.ACTION_MFA_DISABLED,
        user,
        totp_removed=drop_totp,
        passkeys_removed=removed,
    )
    db.session.commit()
    alerted = notify_security_event(user, SecurityEvent.SECOND_FACTORS_RESET)

    click.echo(f'Second factor reset for {email}')
    if drop_totp:
        click.echo('   · TOTP disabled')
    if drop_passkeys:
        click.echo(f'   · {removed} passkey(s) removed')
    click.echo('   · Live sessions revoked')
    click.echo(f"   · {'Alert sent to' if alerted else 'No alert sent to'} {email}")
    if _factors_label(user) == 'none':
        click.echo('The account will have to enrol a method on its next sign-in.')


@user_cli.command('set-email')
@click.argument('email')
@click.argument('new_email')
def set_email(email, new_email):
    """Change an account's address."""
    user = _find_user(email)
    new_email = _address(new_email)
    if User.query.filter_by(email=new_email).first():
        raise click.ClickException(f'An account with {new_email} already exists.')

    previous = change_email(user, new_email)
    user.revoke_tokens()
    _audit(AuditLog.ACTION_EMAIL_CHANGE, user, success=True, old=previous, new=new_email)
    db.session.commit()
    alerted = notify_email_changed(previous, new_email)

    click.echo(f'{previous} → {new_email}')
    click.echo('   · Live sessions revoked')
    click.echo(f"   · {'Alert sent to' if alerted else 'No alert sent to'} {previous}")


@user_cli.command('grant')
@click.argument('email')
@click.argument('role')
@click.option('--restaurant', default=None, help='Target site (id or slug) — site roles')
@click.option('--org', default=None, help="Organization (id or slug): org_admin's, or the site's")
def grant_place(email, role, restaurant, org):
    """Give an account a site with a role, or an organization to supervise.

    On a site the account already belongs to, the role changes.
    """
    if role not in User.VALID_ROLES:
        raise click.ClickException(f'Invalid role. Values: {User.VALID_ROLES}')
    user = _find_user(email)
    restaurant_id, organization_id, destination = _resolve_tenant(role, restaurant, org)

    previous = None
    if role == User.ROLE_ORG_ADMIN:
        if any(s.organization_id == organization_id for s in user.supervisions):
            raise click.ClickException(f'{email} already supervises {destination}.')
        user.supervisions.append(OrgSupervision(organization_id=organization_id))
    else:
        membership = next((m for m in user.memberships if m.restaurant_id == restaurant_id), None)
        if membership is None:
            user.memberships.append(SiteMembership(
                restaurant=db.session.get(Restaurant, restaurant_id), role=role
            ))
        else:
            previous, membership.role = membership.role, role
    mirror_first_place(user)
    user.revoke_tokens()
    _audit(
        AuditLog.ACTION_USER_UPDATE, user, restaurant_id, organization_id,
        field='role', old=previous, new=role,
    )
    db.session.commit()
    click.echo(f"{email}: {previous or '—'} → {role} ({destination})")
    click.echo('   · Live sessions revoked')


@user_cli.command('revoke')
@click.argument('email')
@click.option('--restaurant', default=None, help='Site (id or slug) to take from the account')
@click.option('--org', default=None, help="Organization (id or slug) it stops supervising, or the site's")
def revoke_place(email, restaurant, org):
    """Take a site, or the supervision of an organization, from an account."""
    user = _find_user(email)
    if restaurant:
        site = _find_restaurant(restaurant, org)
        places, destination = user.memberships, site.name
        place = next((m for m in places if m.restaurant_id == site.id), None)
        restaurant_id, organization_id = site.id, site.organization_id
    elif org:
        organization = _find_organization(org)
        places, destination = user.supervisions, organization.name
        place = next((s for s in places if s.organization_id == organization.id), None)
        restaurant_id, organization_id = None, organization.id
    else:
        raise click.ClickException('--restaurant or --org is required.')
    if place is None:
        raise click.ClickException(f'{email} holds no place on {destination}.')
    if len(user.memberships) + len(user.supervisions) == 1:
        raise click.ClickException('This is its last place: delete the account with `flask user delete`.')

    places.remove(place)
    mirror_first_place(user)
    user.revoke_tokens()
    _audit(AuditLog.ACTION_MEMBER_REMOVE, user, restaurant_id, organization_id)
    db.session.commit()
    click.echo(f'{email} no longer holds {destination}.')
    click.echo('   · Live sessions revoked')


@user_cli.command('enable')
@click.argument('email')
def enable_user(email):
    """Re-enable a disabled account."""
    user = _find_user(email)
    user.is_active = True
    _audit(AuditLog.ACTION_USER_UPDATE, user, field='is_active', new=True)
    db.session.commit()
    click.echo(f'Account enabled: {email}')


@user_cli.command('disable')
@click.argument('email')
def disable_user(email):
    """Disable an account without deleting it."""
    user = _find_user(email)
    user.is_active = False
    user.revoke_tokens()
    _audit(AuditLog.ACTION_USER_UPDATE, user, field='is_active', new=False)
    db.session.commit()
    click.echo(f'Account disabled: {email}')
    click.echo('   · Live sessions revoked')


@user_cli.command('delete')
@click.argument('email')
@click.option('--yes', is_flag=True, help='Delete without asking for confirmation')
def delete_user(email, yes):
    """Delete an account and its passkeys for good."""
    user = _find_user(email)
    if not yes:
        click.confirm(f'Permanently delete {email} ({_places_label(user)})?', abort=True)

    # Written before the row goes, so the entry keeps a resolvable target id; once the
    # account is gone, only its places tie the entry to a log.
    for restaurant_id, organization_id in _place_ids(user):
        _audit(
            AuditLog.ACTION_USER_DELETE, user, restaurant_id, organization_id,
            places=_places(user),
        )
    db.session.delete(user)
    db.session.commit()
    click.echo(f'Account deleted: {email}')
    click.echo('Its audit log entries are kept.')
