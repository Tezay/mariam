"""A site's subscription to the service, as its operator records it from the command line."""
from dataclasses import asdict

from ..models import Restaurant
from ..problems import Blueprint
from ..schemas.subscriptions import OrgSubscriptionListSchema, SubscriptionSchema
from ..services.subscriptions import periods_by_site, site_standing, standing
from ..utils.time import paris_today
from .helpers import admin_required, org_admin_required
from .scope import member_org, member_site

subscriptions_bp = Blueprint(
    'subscriptions', __name__, description="A site's subscription to the service, read only"
)


@subscriptions_bp.route('/<org>/sites/<site>/subscription', methods=['GET'])
@admin_required
@subscriptions_bp.response(200, SubscriptionSchema)
def get_site_subscription(org: str, site: str):
    """The site's current period, the next one and the past ones."""
    return asdict(site_standing(member_site(org, site), paris_today()))


@subscriptions_bp.route('/<org>/subscriptions', methods=['GET'])
@org_admin_required
@subscriptions_bp.response(200, OrgSubscriptionListSchema)
def list_org_subscriptions(org: str):
    """Where each site of the organization stands, by name."""
    sites = (
        Restaurant.query.filter_by(organization_id=member_org(org).id)
        .order_by(Restaurant.name).all()
    )
    periods = periods_by_site([site.id for site in sites])
    today = paris_today()
    return {'items': [
        {
            'site': site.slug,
            'name': site.name,
            **asdict(standing(periods[site.id], today, site.is_active)),
        }
        for site in sites
    ]}
