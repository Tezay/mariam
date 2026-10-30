"""The analytics reports, of one site or of the sites of an organization."""
from flask_jwt_extended import jwt_required
from flask_smorest import Blueprint

from ..models import Restaurant
from ..schemas.analytics import (
    AnalyticsQuerySchema,
    OrgAnalyticsQuerySchema,
    OrgSatisfactionQuerySchema,
    OverviewReportSchema,
    PublicationsReportSchema,
    SatisfactionQuerySchema,
    SatisfactionReportSchema,
    TrafficReportSchema,
)
from ..services.analytics_stats import (
    cached_json,
    overview,
    publication_stats,
    resolve_scope,
    satisfaction_stats,
    traffic_stats,
)
from .helpers import org_admin_required
from .scope import member_org, member_site

analytics_bp = Blueprint(
    'analytics', __name__,
    description="Publication, traffic and rating reports, of a site or of an organization",
)

REPORTS = {
    'overview': lambda scope, org_id, query: overview(scope, org_id),
    'publications': lambda scope, org_id, query: publication_stats(scope),
    'traffic': lambda scope, org_id, query: traffic_stats(scope, org_id),
    'satisfaction': lambda scope, org_id, query: satisfaction_stats(scope, query['min_votes']),
}


def _report(name: str, cache_namespace: int, site_ids, org_id: int | None, query: dict):
    scope = resolve_scope(site_ids, query)
    # A site's report leaves out the organization's own page, which the same
    # site seen from the organization counts: they must not share an entry.
    extra = {'org': org_id, **({'min_votes': query['min_votes']} if 'min_votes' in query else {})}
    return cached_json(
        cache_namespace, name, scope, lambda: REPORTS[name](scope, org_id, query), extra=extra
    )


def _site_report(name: str, query: dict, org: str, site: str):
    restaurant = member_site(org, site)
    return _report(name, restaurant.organization_id, [restaurant.id], None, query)


def _org_report(name: str, query: dict, org: str):
    organization = member_org(org)
    sites = Restaurant.query.filter_by(organization_id=organization.id)
    if 'sites' in query:
        sites = sites.filter(Restaurant.slug.in_(query['sites'].split(',')))
    site_ids = [site.id for site in sites.with_entities(Restaurant.id)]
    return _report(name, organization.id, site_ids, organization.id, query)


@analytics_bp.route('/<org>/sites/<site>/analytics/overview', methods=['GET'])
@jwt_required()
@analytics_bp.arguments(AnalyticsQuerySchema, location='query')
@analytics_bp.response(200, OverviewReportSchema)
def site_overview(query, org: str, site: str):
    """Headline figures and trend of the site over the period."""
    return _site_report('overview', query, org, site)


@analytics_bp.route('/<org>/sites/<site>/analytics/publications', methods=['GET'])
@jwt_required()
@analytics_bp.arguments(AnalyticsQuerySchema, location='query')
@analytics_bp.response(200, PublicationsReportSchema)
def site_publications(query, org: str, site: str):
    """How on time and how complete the site's menus were."""
    return _site_report('publications', query, org, site)


@analytics_bp.route('/<org>/sites/<site>/analytics/traffic', methods=['GET'])
@jwt_required()
@analytics_bp.arguments(AnalyticsQuerySchema, location='query')
@analytics_bp.response(200, TrafficReportSchema)
def site_traffic(query, org: str, site: str):
    """Views of the site's public pages, per day, hour and page."""
    return _site_report('traffic', query, org, site)


@analytics_bp.route('/<org>/sites/<site>/analytics/satisfaction', methods=['GET'])
@jwt_required()
@analytics_bp.arguments(SatisfactionQuerySchema, location='query')
@analytics_bp.response(200, SatisfactionReportSchema)
def site_satisfaction(query, org: str, site: str):
    """The site's menu ratings, per day and per dish."""
    return _site_report('satisfaction', query, org, site)


@analytics_bp.route('/<org>/analytics/overview', methods=['GET'])
@org_admin_required
@analytics_bp.arguments(OrgAnalyticsQuerySchema, location='query')
@analytics_bp.response(200, OverviewReportSchema)
def org_overview(query, org: str):
    """Headline figures, trend and per-site table of the organization."""
    return _org_report('overview', query, org)


@analytics_bp.route('/<org>/analytics/publications', methods=['GET'])
@org_admin_required
@analytics_bp.arguments(OrgAnalyticsQuerySchema, location='query')
@analytics_bp.response(200, PublicationsReportSchema)
def org_publications(query, org: str):
    """How on time and how complete the menus of each site were."""
    return _org_report('publications', query, org)


@analytics_bp.route('/<org>/analytics/traffic', methods=['GET'])
@org_admin_required
@analytics_bp.arguments(OrgAnalyticsQuerySchema, location='query')
@analytics_bp.response(200, TrafficReportSchema)
def org_traffic(query, org: str):
    """Views of the public pages, per day, site, hour and page."""
    return _org_report('traffic', query, org)


@analytics_bp.route('/<org>/analytics/satisfaction', methods=['GET'])
@org_admin_required
@analytics_bp.arguments(OrgSatisfactionQuerySchema, location='query')
@analytics_bp.response(200, SatisfactionReportSchema)
def org_satisfaction(query, org: str):
    """Menu ratings, per day, site and dish."""
    return _org_report('satisfaction', query, org)
