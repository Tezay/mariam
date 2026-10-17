from flask_smorest import Blueprint

from ..problems import Problem
from ..schemas.public import DomainSchema
from ..security import limiter, public_limit
from ..services.tenancy import organization_for_host
from .scope import finish_public_read

domains_bp = Blueprint('domains', __name__, description='Domains: which organization serves a host')
domains_bp.after_request(finish_public_read)


@domains_bp.route('/<host>', methods=['GET'])
@domains_bp.doc(security=[])
@limiter.limit(public_limit)
@domains_bp.response(200, DomainSchema)
def get_domain(host: str):
    """The organization a host serves.

    For a frontend that renders an organization's pages: it names the
    organization to read under `/v1/orgs/{org}`. The answer may be cached
    five minutes.
    """
    host = host.lower()
    organization = organization_for_host(host)
    if organization is None:
        raise Problem(404, 'domain_not_found', 'Aucune organisation ne sert cette adresse.')
    return {'host': host, 'organization': organization}, 200, {
        'Cache-Control': 'public, max-age=300',
    }
