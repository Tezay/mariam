"""The organization and site a path names, as an anonymous caller may see them."""
from flask import Response, request

from ..models import Organization, Restaurant
from ..problems import Problem


def public_org(slug: str) -> Organization:
    org = Organization.query.filter_by(slug=slug, is_active=True).first()
    if org is None:
        raise Problem(404, 'org_not_found', 'Organisation introuvable.')
    return org


def public_site(org_slug: str, site_slug: str) -> Restaurant:
    org = public_org(org_slug)
    site = Restaurant.query.filter_by(
        organization_id=org.id, slug=site_slug, is_active=True
    ).first()
    if site is None:
        raise Problem(404, 'site_not_found', 'Restaurant introuvable.')
    return site


def finish_public_read(response: Response) -> Response:
    """Any origin may read what anyone may read; a client that has it gets a 304.

    Writes are left to the application's CORS list, which skips a response that
    already names its allowed origin.
    """
    if request.method not in ('GET', 'HEAD'):
        return response
    response.headers.setdefault('Access-Control-Allow-Origin', '*')
    if response.status_code == 200:
        # Stored and revalidated each time, where the API's default is no-store.
        response.headers.setdefault('Cache-Control', 'no-cache')
        response.add_etag()
        response.make_conditional(request)
    return response
