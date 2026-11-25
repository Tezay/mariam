"""flask org — organizations from the command line."""
import click
from flask.cli import AppGroup

from ..extensions import db
from ..models import AuditLog, Organization
from ..models.organization import RESERVED_ORG_SLUGS
from ..utils.slug import is_valid_slug, normalize_slug

org_cli = AppGroup('org', help='Organizations.')


def register_commands(app):
    app.cli.add_command(org_cli)


@org_cli.command('create')
@click.option('--name', required=True, help='Organization name')
@click.option('--slug', required=True, help='URL slug, its first path segment')
def create_org(name, slug):
    """Create an organization, unless its slug is taken."""
    slug = normalize_slug(slug)
    if not is_valid_slug(slug) or slug in RESERVED_ORG_SLUGS:
        raise click.ClickException('Invalid or reserved slug.')
    if Organization.query.filter_by(slug=slug).first():
        click.echo(f"Organization '{slug}' already exists.")
        return
    organization = Organization(name=name, slug=slug)
    db.session.add(organization)
    db.session.flush()
    AuditLog.log(
        action=AuditLog.ACTION_ORG_CREATE,
        target_type='organization',
        target_id=organization.id,
        details={'via': 'cli', 'organization': slug},
        organization_id=organization.id,
    )
    db.session.commit()
    click.echo(f'Organization created: {name} ({slug}), id={organization.id}')
