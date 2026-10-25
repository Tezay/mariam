from flask import request
from flask_smorest import Blueprint

from ..extensions import db
from ..models import PAGE_KINDS, Event, Menu, Organization, Restaurant, User
from ..models.telemetry import ORG_PAGE_KINDS
from ..schemas.orgs import OrgSiteListSchema
from ..schemas.public import PublicOrgSchema
from ..security import get_client_ip, limiter, public_limit
from ..services.service_calendar import closures_by_site, menu_status
from ..services.telemetry import beacon_origin_allowed, record_page_view
from ..utils.time import as_utc, paris_today
from .scope import SESSION_OPTIONAL, finish_public_read, public_org, readable_org

orgs_bp = Blueprint('orgs', __name__, description='Organizations and their sites')
orgs_bp.after_request(finish_public_read)


@orgs_bp.route('/<org>', methods=['GET'])
@orgs_bp.doc(security=[])
@limiter.limit(public_limit)
@orgs_bp.response(200, PublicOrgSchema)
def get_org(org: str):
    """An active organization."""
    return public_org(org)


def supervised_sites(sites: list) -> list[dict]:
    """The sites with what a supervisor checks first: today's menu, events, accounts."""
    ids = [site.id for site in sites]
    today = paris_today()
    member_counts = dict(
        db.session.query(User.restaurant_id, db.func.count(User.id))
        .filter(User.restaurant_id.in_(ids), User.role != User.ROLE_ORG_ADMIN)
        .group_by(User.restaurant_id)
    )
    menus_today = {
        menu.restaurant_id: menu
        for menu in Menu.query.filter(Menu.restaurant_id.in_(ids), Menu.date == today)
    }
    closures = closures_by_site(ids, today, today)
    upcoming_events = dict(
        db.session.query(Event.restaurant_id, db.func.count(Event.id))
        .filter(
            Event.restaurant_id.in_(ids),
            Event.is_active,
            Event.status == 'published',
            Event.event_date >= today,
        )
        .group_by(Event.restaurant_id)
    )
    last_published = dict(
        db.session.query(Menu.restaurant_id, db.func.max(Menu.published_at))
        .filter(Menu.restaurant_id.in_(ids), Menu.status == 'published')
        .group_by(Menu.restaurant_id)
    )
    return [{
        'slug': site.slug,
        'name': site.name,
        'logo_url': site.logo_url,
        'is_active': site.is_active,
        'member_count': member_counts.get(site.id, 0),
        'today_menu_status': menu_status(
            site, today, menus_today.get(site.id), closures.get(site.id, [])
        ),
        'upcoming_events': upcoming_events.get(site.id, 0),
        'last_published_at': as_utc(last_published.get(site.id)),
    } for site in sites]


@orgs_bp.route('/<org>/sites', methods=['GET'])
@orgs_bp.doc(security=SESSION_OPTIONAL)
@limiter.limit(public_limit)
@orgs_bp.response(200, OrgSiteListSchema)
def list_sites(org: str):
    """The organization's sites, by name.

    Anyone reads the active ones. Its supervisors read them all, closed ones
    included, with their figures.
    """
    organization, supervisor = readable_org(org)
    sites = Restaurant.query.filter_by(organization_id=organization.id)
    if supervisor:
        return {'items': supervised_sites(sites.order_by(Restaurant.name).all())}
    # Plain values: the schema would read the supervisors' fields off the model too.
    return {'items': [
        {'slug': site.slug, 'name': site.name, 'logo_url': site.logo_url}
        for site in sites.filter_by(is_active=True).order_by(Restaurant.name)
    ]}


@orgs_bp.route('/<org>/page-views', methods=['POST'])
@orgs_bp.doc(security=[])
@limiter.limit(public_limit)
@orgs_bp.response(204)
def record_view(org: str):
    """Count one view of a public page.

    Body: `page_kind` (`today`, `tomorrow`, `tv` or `sites`), plus `site`, the
    slug of the site a page belongs to. Read whatever the content type, which
    `navigator.sendBeacon` sets to text/plain to avoid a CORS preflight.

    Always answers 204, even when telemetry is off or the body is wrong: a
    visitor must never see a page degraded by a counter.
    """
    payload = request.get_json(silent=True, force=True)
    if not isinstance(payload, dict):
        payload = {}
    page_kind = payload.get('page_kind')
    if not beacon_origin_allowed(request.headers.get('Origin')) or page_kind not in PAGE_KINDS:
        return '', 204
    organization = Organization.query.filter_by(slug=org, is_active=True).first()
    if organization is None:
        return '', 204
    if page_kind in ORG_PAGE_KINDS:
        owner = {'organization_id': organization.id}
    else:
        site_slug = payload.get('site')
        site = isinstance(site_slug, str) and Restaurant.query.filter_by(
            organization_id=organization.id, slug=site_slug, is_active=True
        ).first()
        if not site:
            return '', 204
        owner = {'restaurant_id': site.id}
    record_page_view(page_kind, get_client_ip(), request.headers.get('User-Agent', ''), **owner)
    return '', 204
