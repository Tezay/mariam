"""The dishes of an organization's sites, grouped by name, for its supervisors."""
from flask_smorest import Blueprint

from ..pagination import paginate
from ..problems import Problem
from ..schemas.orgs import OrgDishGroupListSchema, OrgDishGroupQuerySchema, OrgDishGroupSchema
from ..services.org_catalog import dish_group, pooled_dishes
from .helpers import org_admin_required
from .scope import member_org

dish_groups_bp = Blueprint(
    'dish_groups', __name__,
    description="The same dish across the sites of an organization, by its normalized name",
)


@dish_groups_bp.route('', methods=['GET'])
@org_admin_required
@dish_groups_bp.arguments(OrgDishGroupQuerySchema, location='query')
@dish_groups_bp.response(200, OrgDishGroupListSchema)
def list_dish_groups(query, org: str):
    """The groups, one page at a time; the `Link` header gives the others."""
    groups = pooled_dishes(
        member_org(org).id,
        q=query['q'], sort=query['sort'], order=query.get('order'), period=query['period'],
    )
    return paginate(groups, query['page'], query['per_page'])


@dish_groups_bp.route('/<path:name>', methods=['GET'])
@org_admin_required
@dish_groups_bp.response(200, OrgDishGroupSchema)
def get_dish_group(org: str, name: str):
    """One group, with each site's own figures; `name` is its `normalized_name`, encoded."""
    group = dish_group(member_org(org).id, name)
    if group is None:
        raise Problem(404, 'dish_group_not_found', 'Plat introuvable.')
    return group
