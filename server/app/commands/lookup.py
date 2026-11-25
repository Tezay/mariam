"""How the command groups name an organization or a site: by id, or by slug."""
import click

from ..extensions import db
from ..models.organization import Organization
from ..models.restaurant import Restaurant
from ..utils.time import utc_naive_to_paris


def find_organization(value: str) -> Organization:
    org = db.session.get(Organization, int(value)) if value.isdigit() else None
    if org is None:
        org = Organization.query.filter_by(slug=value).first()
    if org is None:
        raise click.ClickException(f'No such organization: {value}')
    return org


def find_site(value: str, org: str | None = None) -> Restaurant:
    organization = find_organization(org) if org else None
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


def date_label(value) -> str:
    return utc_naive_to_paris(value).strftime('%Y-%m-%d %H:%M') if value else 'never'


def row(label: str, value) -> None:
    click.echo(f'  {label:<20}: {value}')
