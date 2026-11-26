"""
flask site — opening a site, reading its state, turning it off and on, handing
its data over and deleting it.

A disabled site keeps its data: its public pages answer 404 and its dashboard
reads only, until it is enabled again or deleted.

Every write records an AuditLog entry with no author and no address, carrying
`via: cli` in its details. Failures raise ClickException.

Usage:
    docker compose exec backend flask site show nord --org example
"""
import os
import secrets
from datetime import datetime

import click
from flask.cli import AppGroup

from ..extensions import db
from ..models import AuditLog, Menu, MenuCategory, Organization, Restaurant, SiteMembership
from ..services.site_removal import removal_plan, remove_site
from ..utils.site_name import parse_site_name
from ..utils.slug import is_valid_slug, normalize_slug
from ..utils.time import PARIS_TZ
from ..utils.urls import public_page_path
from .lookup import date_label, find_organization, find_site, row
from .site_export import write_archive

site_cli = AppGroup('site', help='Sites: open, read, turn off and on, export, delete.')

ORG_OPTION = click.option(
    '--org', default=None, help='Organization (id or slug), when several share the slug'
)


def register_commands(app):
    app.cli.add_command(site_cli)


def _path(site: Restaurant) -> str:
    return public_page_path(site).lstrip('/')


def _state(site: Restaurant) -> str:
    return 'active' if site.is_active else 'disabled'


def _audit(action: str, site: Restaurant, **details) -> None:
    AuditLog.log(
        action=action,
        target_type='site',
        target_id=site.id,
        details={'via': 'cli', 'site': _path(site), **details},
        restaurant_id=site.id,
        organization_id=site.organization_id,
    )


@site_cli.command('list')
@click.option('--org', default=None, help='Filter by organization (id or slug)')
@click.option('--all', 'show_all', is_flag=True, help='Include disabled sites')
def list_sites(org, show_all):
    """List sites with their accounts and state."""
    query = Restaurant.query.join(Organization, Organization.id == Restaurant.organization_id)
    if org:
        query = query.filter(Restaurant.organization_id == find_organization(org).id)
    if not show_all:
        query = query.filter(Restaurant.is_active.is_(True))
    sites = query.order_by(Organization.slug, Restaurant.slug).all()
    if not sites:
        click.echo('No site matches.')
        return

    accounts = dict(
        db.session.query(SiteMembership.restaurant_id, db.func.count())
        .group_by(SiteMembership.restaurant_id)
        .all()
    )
    click.echo(f"{'ID':<4} {'PATH':<36} {'NAME':<32} {'ACCOUNTS':<9} STATE")
    for site in sites:
        click.echo(
            f'{site.id:<4} {_path(site)[:35]:<36} {site.name[:31]:<32} '
            f'{accounts.get(site.id, 0):<9} {_state(site)}'
        )
    click.echo(f'\n{len(sites)} site(s).')


@site_cli.command('show')
@click.argument('site')
@ORG_OPTION
def show_site(site, org):
    """Show the full state of one site."""
    restaurant = find_site(site, org)
    roles = dict(
        db.session.query(SiteMembership.role, db.func.count())
        .filter(SiteMembership.restaurant_id == restaurant.id)
        .group_by(SiteMembership.role)
        .all()
    )
    last_published = (
        db.session.query(db.func.max(Menu.date))
        .filter(Menu.restaurant_id == restaurant.id, Menu.status == 'published')
        .scalar()
    )

    click.echo('\n' + '=' * 60)
    click.echo(f'  {restaurant.name}')
    click.echo('=' * 60)
    row('Id', restaurant.id)
    row('Organization', f'{restaurant.organization.name} ({restaurant.organization.slug})')
    row('Path', _path(restaurant))
    row('State', _state(restaurant))
    row('Accounts', ', '.join(f'{role} x{count}' for role, count in sorted(roles.items())) or '—')
    row('Last published menu', last_published.isoformat() if last_published else 'none')
    row('Created', date_label(restaurant.created_at))
    click.echo('=' * 60 + '\n')


@site_cli.command('create')
@click.option('--org', 'org_slug', required=True, help='Organization slug')
@click.option('--name', required=True, help='Site name, as its page shows it')
@click.option('--slug', required=True, help='URL slug, unique in the organization')
def create_site(org_slug, name, slug):
    """Create a site of an organization, with the default categories."""
    organization = Organization.query.filter_by(slug=normalize_slug(org_slug)).first()
    if not organization:
        raise click.ClickException(f"No organization '{org_slug}'.")
    site_name = parse_site_name(name)
    if site_name is None:
        raise click.ClickException('Invalid site name.')
    slug = normalize_slug(slug)
    if not is_valid_slug(slug):
        raise click.ClickException('Invalid or reserved slug.')
    if Restaurant.query.filter_by(organization_id=organization.id, slug=slug).first():
        raise click.ClickException(f"Site '{slug}' already exists in '{organization.slug}'.")

    # The code is an internal identifier that no page or route shows.
    restaurant = Restaurant(
        name=site_name, code=secrets.token_hex(10), slug=slug, organization_id=organization.id,
    )
    db.session.add(restaurant)
    db.session.flush()
    MenuCategory.create_defaults(restaurant.id)
    _audit(AuditLog.ACTION_SITE_CREATE, restaurant)
    db.session.commit()
    click.echo(f'Site created: {site_name} ({_path(restaurant)})')


@site_cli.command('enable')
@click.argument('site')
@ORG_OPTION
def enable_site(site, org):
    """Turn a disabled site back on."""
    restaurant = find_site(site, org)
    if restaurant.is_active:
        click.echo(f'Already active: {_path(restaurant)}')
        return
    restaurant.is_active = True
    _audit(AuditLog.ACTION_SITE_ENABLE, restaurant)
    db.session.commit()
    click.echo(f'Site enabled: {_path(restaurant)}')


@site_cli.command('disable')
@click.argument('site')
@ORG_OPTION
def disable_site(site, org):
    """Turn a site off without deleting it."""
    restaurant = find_site(site, org)
    if not restaurant.is_active:
        click.echo(f'Already disabled: {_path(restaurant)}')
        return
    restaurant.is_active = False
    _audit(AuditLog.ACTION_SITE_DISABLE, restaurant)
    db.session.commit()
    click.echo(f'Site disabled: {_path(restaurant)}')
    click.echo('   · Its public pages answer 404 and its dashboard reads only')
    click.echo('   · No more push notifications nor weekly digest for it')


@site_cli.command('export')
@click.argument('site')
@ORG_OPTION
@click.option('--out', required=True, type=click.Path(dir_okay=False, writable=True),
              help='The ZIP archive to write')
def export_site(site, org, out):
    """Write the site's data to a ZIP archive, for its client: menus, dishes, news,
    closures, accounts, votes, EGalim declarations, audit log and images.
    """
    restaurant = find_site(site, org)
    counts, missing = write_archive(restaurant, out)
    click.echo(f'Archive written: {out} ({_path(restaurant)})')
    for name, count in counts.items():
        click.echo(f'   · {name}: {count}')
    for name in missing:
        click.echo(f'   ! Not read from storage: {name}')
    click.echo(f'From the host: docker compose cp backend:{os.path.abspath(out)} .')


def _emails(accounts: dict[int, str]) -> str:
    return ', '.join(accounts.values()) or '—'


@site_cli.command('delete')
@click.argument('site')
@ORG_OPTION
@click.option('--yes', is_flag=True, help='Delete without typing the path back')
def delete_site(site, org, yes):
    """Delete a disabled site for good, with every row and file of it.

    Its accounts with no other place go with it; the others only lose it.
    Export it first: nothing of it can be read back afterwards.
    """
    restaurant = find_site(site, org)
    if restaurant.is_active:
        raise click.ClickException(f'{_path(restaurant)} is active: disable it first.')
    plan = removal_plan(restaurant)
    click.echo(f'Deleting {plan.name} ({plan.path}) takes with it:')
    for name, count in plan.counts.items():
        click.echo(f'   · {name.replace("_", " ")}: {count}')
    click.echo(f'   · stored files: {len(plan.storage_keys)}')
    click.echo(f'   · accounts deleted: {_emails(plan.accounts_deleted)}')
    click.echo(f'   · accounts kept, which only lose this site: {_emails(plan.accounts_kept)}')
    if not yes:
        typed = click.prompt('Type the path to confirm', default='', show_default=False)
        if typed.strip() != plan.path:
            raise click.ClickException('The path does not match: nothing deleted.')

    deleted, kept = len(plan.accounts_deleted), len(plan.accounts_kept)
    removal = remove_site(plan)
    click.echo(
        f'\nSite deleted: {plan.name} ({plan.path}), '
        f'{datetime.now(PARIS_TZ):%Y-%m-%d %H:%M %Z}'
    )
    for name, count in plan.counts.items():
        click.echo(f'   · {name.replace("_", " ")}: {count}')
    click.echo(f'   · accounts deleted: {deleted}, kept: {kept}')
    click.echo(
        f'   · stored files: {len(plan.storage_keys)}, '
        + ('deleted' if removal.files_deleted else 'NOT deleted, see the backend logs')
    )
    if not removal.counters_dropped:
        click.echo('   ! Its Redis counters were not dropped: Redis was unreachable')
    click.echo('Backups keep these data until they expire.')
