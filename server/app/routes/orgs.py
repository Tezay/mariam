from flask import request
from flask_smorest import Blueprint

from ..models import PAGE_KINDS, Organization, Restaurant
from ..models.telemetry import ORG_PAGE_KINDS
from ..schemas.public import PublicOrgSchema, PublicSiteListSchema
from ..security import get_client_ip, limiter, public_limit
from ..services.telemetry import beacon_origin_allowed, record_page_view
from .scope import finish_public_read, public_org

orgs_bp = Blueprint('orgs', __name__, description='Organizations and their sites')
orgs_bp.after_request(finish_public_read)


@orgs_bp.route('/<org>', methods=['GET'])
@orgs_bp.doc(security=[])
@limiter.limit(public_limit)
@orgs_bp.response(200, PublicOrgSchema)
def get_org(org: str):
    """An active organization."""
    return public_org(org)


@orgs_bp.route('/<org>/sites', methods=['GET'])
@orgs_bp.doc(security=[])
@limiter.limit(public_limit)
@orgs_bp.response(200, PublicSiteListSchema)
def list_sites(org: str):
    """The organization's active sites, by name."""
    organization = public_org(org)
    sites = (
        Restaurant.query.filter_by(organization_id=organization.id, is_active=True)
        .order_by(Restaurant.name)
        .all()
    )
    return {'items': sites}


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
