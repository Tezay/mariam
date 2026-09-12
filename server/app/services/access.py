"""Which restaurants a user may act on.

Lives with the services rather than with the routes: the analytics, alert and
email layers all need it, and a service importing a route module pulls every
blueprint into the cycle.
"""
from ..models import Restaurant


def accessible_restaurant_ids(user) -> set[int]:
    """Ids of the restaurants the user may act on.

    - org_admin: every restaurant of its organization.
    - admin / editor / reader: only its own restaurant.
    - unassigned: empty set (no access).
    """
    if user is None:
        return set()
    if user.is_org_admin() and user.organization_id:
        rows = (
            Restaurant.query
            .filter_by(organization_id=user.organization_id)
            .with_entities(Restaurant.id)
            .all()
        )
        return {row[0] for row in rows}
    if user.restaurant_id:
        return {user.restaurant_id}
    return set()
