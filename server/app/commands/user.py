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
from ..models.organization import Organization
from ..models.restaurant import Restaurant
from ..models.user import User
from ..utils.time import utc_naive_to_paris
from ..utils.urls import frontend_base_url

user_cli = AppGroup('user', help='Account administration.')


def register_commands(app):
    app.cli.add_command(user_cli)


# ============================================================
# HELPERS
# ============================================================


def _find_user(email: str) -> User:
    user = User.query.filter_by(email=email).first()
    if not user:
        raise click.ClickException(f'No account with {email}.')
    return user


def _find_restaurant(value: str) -> Restaurant:
    site = db.session.get(Restaurant, int(value)) if value.isdigit() else None
    if site is None:
        site = Restaurant.query.filter_by(slug=value).first()
    if site is None:
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
    """(restaurant_id, organization_id, label) for a role and its target.

    A supervisor sits above the sites: it belongs to the organization and to no
    restaurant, which is what keeps its scope from collapsing to a single site.
    """
    if role == User.ROLE_ORG_ADMIN:
        if not org:
            raise click.ClickException('--org is required for the org_admin role.')
        organization = _find_organization(org)
        return None, organization.id, organization.name

    if not restaurant:
        raise click.ClickException('--restaurant is required for a site role.')
    site = _find_restaurant(restaurant)
    return site.id, site.organization_id, site.name


def _audit(action: str, user: User, **details) -> None:
    # No address rather than a marker in an address column: the origin belongs
    # in the details, which the log viewer shows on demand.
    AuditLog.log(
        action=action,
        target_type='user',
        target_id=user.id,
        details={'via': 'cli', 'email': user.email, **details},
        restaurant_id=user.restaurant_id,
    )


def _tenant_label(user: User) -> str:
    if user.restaurant_id:
        site = db.session.get(Restaurant, user.restaurant_id)
        return site.name if site else f'site #{user.restaurant_id}'
    if user.organization_id:
        org = db.session.get(Organization, user.organization_id)
        return org.name if org else f'org #{user.organization_id}'
    return '—'


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


# ============================================================
# READ
# ============================================================


@user_cli.command('list')
@click.option('--role', default=None, help='Filter by role')
@click.option('--site', default=None, help='Filter by site (id or slug)')
@click.option('--org', default=None, help='Filter by organization (id or slug)')
@click.option('--all', 'show_all', is_flag=True, help='Include disabled accounts')
def list_users(role, site, org, show_all):
    """List accounts with their tenant and second factor."""
    query = User.query
    if role:
        query = query.filter_by(role=role)
    if site:
        query = query.filter_by(restaurant_id=_find_restaurant(site).id)
    if org:
        query = query.filter_by(organization_id=_find_organization(org).id)
    if not show_all:
        query = query.filter_by(is_active=True)

    users = query.order_by(User.id).all()
    if not users:
        click.echo('No account matches.')
        return

    click.echo(f"{'ID':<4} {'EMAIL':<32} {'ROLE':<10} {'TENANT':<26} {'2FA':<18} STATE")
    for user in users:
        click.echo(
            f'{user.id:<4} {user.email:<32} {user.role:<10} '
            f'{_tenant_label(user)[:25]:<26} {_factors_label(user):<18} '
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
    _row('Role', user.role)
    _row('Tenant', _tenant_label(user))
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


# ============================================================
# SECURITY
# ============================================================


@user_cli.command('invite')
@click.argument('email')
@click.option('--role', required=True, help='org_admin | admin | editor | reader')
@click.option('--restaurant', default=None, help='Target site (id or slug) — site roles')
@click.option('--org', default=None, help='Organization (id or slug) — org_admin role')
def invite_user(email, role, restaurant, org):
    """Create an activation link for a new account."""
    if role not in User.VALID_ROLES:
        raise click.ClickException(f'Invalid role. Values: {User.VALID_ROLES}')
    if User.query.filter_by(email=email).first():
        raise click.ClickException(f'An account with {email} already exists.')

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
    )
    db.session.commit()

    click.echo(f'✅ Invited {email} ({role}) → {destination}')
    click.echo(f'🔗 {frontend_base_url()}/activate/{link.token}')
    click.echo('⚠️  Expires in 72 h, single use.')


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

    link = ActivationLink.create_password_reset_link(email=email, expires_hours=72)
    db.session.add(link)
    _audit(AuditLog.ACTION_PASSWORD_RESET_REQUEST, user, method='cli')
    db.session.commit()

    click.echo(f'✅ Password reset link for {email}')
    click.echo(f'🔗 {frontend_base_url()}/reset-password/{link.token}')
    click.echo('⚠️  Expires in 72 h, single use, second factor required.')


@user_cli.command('reset-2fa')
@click.argument('email')
@click.option('--totp', 'only_totp', is_flag=True, help='Remove the TOTP secret only')
@click.option('--passkeys', 'only_passkeys', is_flag=True, help='Remove the passkeys only')
def reset_2fa(email, only_totp, only_passkeys):
    """Remove an account's second factor (TOTP and passkeys by default)."""
    user = _find_user(email)
    drop_totp = only_totp or not only_passkeys
    drop_passkeys = only_passkeys or not only_totp

    removed = 0
    if drop_passkeys:
        removed = user.passkeys.delete()
    if drop_totp:
        user.disable_mfa()

    # A session opened with the factor being removed must not survive it.
    user.revoke_tokens()
    _audit(
        AuditLog.ACTION_MFA_DISABLED,
        user,
        totp_removed=drop_totp,
        passkeys_removed=removed,
    )
    db.session.commit()

    click.echo(f'✅ Second factor reset for {email}')
    if drop_totp:
        click.echo('   · TOTP disabled')
    if drop_passkeys:
        click.echo(f'   · {removed} passkey(s) removed')
    click.echo('   · Live sessions revoked')
    if _factors_label(user) == 'none':
        click.echo('ℹ️  The account will have to enrol a method on its next sign-in.')


# ============================================================
# EDIT
# ============================================================


@user_cli.command('set-email')
@click.argument('email')
@click.argument('new_email')
def set_email(email, new_email):
    """Change an account's address."""
    user = _find_user(email)
    if User.query.filter_by(email=new_email).first():
        raise click.ClickException(f'An account with {new_email} already exists.')

    user.email = new_email
    _audit(AuditLog.ACTION_USER_UPDATE, user, field='email', old=email)
    db.session.commit()
    click.echo(f'✅ {email} → {new_email}')


@user_cli.command('set-role')
@click.argument('email')
@click.argument('role')
@click.option('--restaurant', default=None, help='Target site (id or slug) — site roles')
@click.option('--org', default=None, help='Organization (id or slug) — org_admin role')
def set_role(email, role, restaurant, org):
    """Change an account's role, and its tenant when needed."""
    if role not in User.VALID_ROLES:
        raise click.ClickException(f'Invalid role. Values: {User.VALID_ROLES}')
    user = _find_user(email)
    previous = user.role

    # Staying in the same family with no target given keeps the current tenant.
    moving_to_org = role == User.ROLE_ORG_ADMIN
    was_org = previous == User.ROLE_ORG_ADMIN
    if restaurant or org or moving_to_org != was_org:
        user.restaurant_id, user.organization_id, destination = _resolve_tenant(
            role, restaurant, org
        )
    else:
        destination = _tenant_label(user)

    user.role = role
    user.revoke_tokens()
    _audit(AuditLog.ACTION_USER_UPDATE, user, field='role', old=previous, new=role)
    db.session.commit()
    click.echo(f'✅ {email}: {previous} → {role} ({destination})')
    click.echo('   · Live sessions revoked')


@user_cli.command('enable')
@click.argument('email')
def enable_user(email):
    """Re-enable a disabled account."""
    user = _find_user(email)
    user.is_active = True
    _audit(AuditLog.ACTION_USER_UPDATE, user, field='is_active', new=True)
    db.session.commit()
    click.echo(f'✅ Account enabled: {email}')


@user_cli.command('disable')
@click.argument('email')
def disable_user(email):
    """Disable an account without deleting it."""
    user = _find_user(email)
    user.is_active = False
    user.revoke_tokens()
    _audit(AuditLog.ACTION_USER_UPDATE, user, field='is_active', new=False)
    db.session.commit()
    click.echo(f'✅ Account disabled: {email}')
    click.echo('   · Live sessions revoked')


@user_cli.command('delete')
@click.argument('email')
@click.option('--yes', is_flag=True, help='Delete without asking for confirmation')
def delete_user(email, yes):
    """Delete an account and its passkeys for good."""
    user = _find_user(email)
    if not yes:
        click.confirm(f'Permanently delete {email} ({user.role})?', abort=True)

    # Written before the row goes, so the entry keeps a resolvable target id.
    _audit(AuditLog.ACTION_USER_DELETE, user, role=user.role)
    db.session.delete(user)
    db.session.commit()
    click.echo(f'✅ Account deleted: {email}')
    click.echo('ℹ️  Its audit log entries are kept.')
