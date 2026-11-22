"""Which sites and organizations an account holds, and with what role.

Lives with the services rather than with the routes: the analytics, alert and
email layers all need it, and a service importing a route module pulls every
blueprint into the cycle.
"""
from dataclasses import dataclass
from datetime import UTC, datetime

from ..extensions import db
from ..models import OrgSupervision, Restaurant, SiteMembership, User

# Far above a restaurant's team: a bound for a script inviting in a loop, not for a customer.
SITE_MEMBERS_MAX = 200

ADMIN = 'admin'
EDITOR = 'editor'
SUPERVISOR = 'supervisor'


def supervises(user, organization_id: int) -> bool:
    return db.session.query(
        OrgSupervision.query.filter_by(user_id=user.id, organization_id=organization_id).exists()
    ).scalar()


def site_role(user, site: Restaurant) -> str | None:
    """Its membership's role, else `supervisor` over the site's organization.

    A member who also supervises keeps its membership's role, to write as that role
    allows; what it reads as a supervisor is `oversees`.
    """
    membership = SiteMembership.query.filter_by(user_id=user.id, restaurant_id=site.id).first()
    if membership is not None:
        return membership.role
    return SUPERVISOR if supervises(user, site.organization_id) else None


def oversees(user, site: Restaurant, role: str | None) -> bool:
    """Whether the account reads what a site's admins read there."""
    return role == ADMIN or supervises(user, site.organization_id)


def supervised_site_ids(user) -> set[int]:
    rows = (
        db.session.query(Restaurant.id)
        .join(OrgSupervision, OrgSupervision.organization_id == Restaurant.organization_id)
        .filter(OrgSupervision.user_id == user.id)
    )
    return {row[0] for row in rows}


def member_site_ids(user, roles: tuple[str, ...] = (ADMIN, EDITOR)) -> set[int]:
    rows = db.session.query(SiteMembership.restaurant_id).filter(
        SiteMembership.user_id == user.id, SiteMembership.role.in_(roles)
    )
    return {row[0] for row in rows}


def accessible_restaurant_ids(user) -> set[int]:
    if user is None:
        return set()
    return member_site_ids(user) | supervised_site_ids(user)


@dataclass(frozen=True)
class Reach:
    """The sites an account administers and the organizations it supervises."""

    sites: frozenset[int]
    organizations: frozenset[int]

    def covers(self, account) -> bool:
        return all(
            m.restaurant_id in self.sites or m.restaurant.organization_id in self.organizations
            for m in account.memberships
        ) and all(place.organization_id in self.organizations for place in account.supervisions)


def reach_of(user) -> Reach:
    organizations = db.session.query(OrgSupervision.organization_id).filter(
        OrgSupervision.user_id == user.id
    )
    return Reach(
        frozenset(member_site_ids(user, (ADMIN,))), frozenset(row[0] for row in organizations)
    )


def _since(place) -> tuple:
    # A place not yet written is the newest; one copied without a date, the oldest.
    return (place.id is None, place.created_at or datetime.min.replace(tzinfo=UTC))


def first_place(user) -> SiteMembership | OrgSupervision | None:
    places = [*user.memberships, *user.supervisions]
    return min(places, key=_since) if places else None


def mirror_first_place(user) -> None:
    """Copies the account's oldest place into the columns the previous release reads."""
    place = first_place(user)
    if isinstance(place, SiteMembership):
        user.role = place.role
        user.restaurant_id = place.restaurant.id
        user.organization_id = place.restaurant.organization_id
    elif place is not None:
        user.role = User.ROLE_ORG_ADMIN
        user.restaurant_id = None
        user.organization_id = place.organization_id


def holds_invitation_place(user, link) -> bool:
    if link.restaurant_id is not None:
        return any(m.restaurant_id == link.restaurant_id for m in user.memberships)
    return any(place.organization_id == link.organization_id for place in user.supervisions)


def grant_invitation(user, link) -> None:
    if link.restaurant_id is not None:
        user.memberships.append(SiteMembership(
            restaurant=db.session.get(Restaurant, link.restaurant_id), role=link.role
        ))
    elif link.organization_id is not None:
        user.supervisions.append(OrgSupervision(organization_id=link.organization_id))
    mirror_first_place(user)


def site_is_full(restaurant_id: int, pending: int = 0) -> bool:
    members = SiteMembership.query.filter_by(restaurant_id=restaurant_id).count()
    return members + pending >= SITE_MEMBERS_MAX
