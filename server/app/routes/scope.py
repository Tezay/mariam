"""The organization and site a path names, and what the caller may see of them."""
from flask import Response, request
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request

from ..models import Organization, Restaurant
from ..problems import Problem
from ..security import ACCESS_COOKIE
from ..services.access import accessible_restaurant_ids
from .helpers import get_current_user

# Documents a route open to anyone, where a session sees more.
SESSION_OPTIONAL: list[dict] = [{}, {'bearer': []}, {'session': []}]


def _site_not_found() -> Problem:
    return Problem(404, 'site_not_found', 'Restaurant introuvable.')


def _org_not_found() -> Problem:
    return Problem(404, 'org_not_found', 'Organisation introuvable.')


def public_org(slug: str) -> Organization:
    org = Organization.query.filter_by(slug=slug, is_active=True).first()
    if org is None:
        raise _org_not_found()
    return org


def member_org(slug: str) -> Organization:
    """The organization the session supervises, open or not; any other reads as missing."""
    user = get_current_user()
    org = Organization.query.filter_by(slug=slug).first()
    if org is None or not user.is_org_admin() or org.id != user.organization_id:
        raise _org_not_found()
    return org


def readable_org(slug: str) -> tuple[Organization, bool]:
    """The organization, and whether the caller is one of its supervisors."""
    verify_jwt_in_request(optional=True)
    if get_jwt_identity() is not None and get_current_user().is_org_admin():
        try:
            return member_org(slug), True
        except Problem:
            pass
    return public_org(slug), False


def public_site(org_slug: str, site_slug: str) -> Restaurant:
    org = public_org(org_slug)
    site = Restaurant.query.filter_by(
        organization_id=org.id, slug=site_slug, is_active=True
    ).first()
    if site is None:
        raise _site_not_found()
    return site


def member_site(org_slug: str, site_slug: str) -> Restaurant:
    """The site the session works on, open or not.

    Out of reach reads as missing, so a path does not tell whether a site exists.
    """
    site = (
        Restaurant.query.join(Organization, Organization.id == Restaurant.organization_id)
        .filter(Organization.slug == org_slug, Restaurant.slug == site_slug)
        .first()
    )
    if site is None or site.id not in accessible_restaurant_ids(get_current_user()):
        raise _site_not_found()
    return site


def readable_site(org_slug: str, site_slug: str) -> tuple[Restaurant, bool]:
    """The site, and whether the caller reads its drafts: an editor of the site does."""
    verify_jwt_in_request(optional=True)
    if get_jwt_identity() is not None and get_current_user().is_editor():
        try:
            return member_site(org_slug, site_slug), True
        except Problem:
            pass
    return public_site(org_slug, site_slug), False


def finish_public_read(response: Response) -> Response:
    """Any origin may read what anyone may read; a client that has it gets a 304.

    A request with a session is left to the API's defaults: what it reads may
    hold drafts. Writes are left to the application's CORS list, which skips a
    response that already names its allowed origin.
    """
    carries_session = 'Authorization' in request.headers or ACCESS_COOKIE in request.cookies
    if request.method not in ('GET', 'HEAD') or carries_session:
        return response
    response.headers.setdefault('Access-Control-Allow-Origin', '*')
    if response.status_code == 200:
        # Stored and revalidated each time, where the API's default is no-store.
        response.headers.setdefault('Cache-Control', 'no-cache')
        response.add_etag()
        response.make_conditional(request)
    return response
