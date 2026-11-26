"""Removing a site for good, once its contract is over and its data handed over."""
from dataclasses import dataclass

from sqlalchemy import delete

from ..extensions import db
from ..models import (
    AuditLog,
    DishCatalog,
    Event,
    EventImage,
    ExceptionalClosure,
    Menu,
    Restaurant,
    RestaurantPhoto,
    SiteMembership,
    User,
)
from ..models.menu_vote import MenuVote
from . import telemetry
from .access import mirror_first_place
from .storage import storage


@dataclass(frozen=True)
class RemovalPlan:
    site_id: int
    organization_id: int
    path: str
    name: str
    counts: dict[str, int]
    # Email by account id.
    accounts_deleted: dict[int, str]
    accounts_kept: dict[int, str]
    storage_keys: list[str]


@dataclass(frozen=True)
class Removal:
    files_deleted: bool
    counters_dropped: bool


def removal_plan(site: Restaurant) -> RemovalPlan:
    """What removing the site takes with it, read without changing anything."""
    members = (
        User.query.join(SiteMembership, SiteMembership.user_id == User.id)
        .filter(SiteMembership.restaurant_id == site.id).order_by(User.email).all()
    )
    places = {user.id: len(user.memberships) + len(user.supervisions) for user in members}
    photos = RestaurantPhoto.query.filter_by(restaurant_id=site.id)
    images = EventImage.query.join(Event).filter(Event.restaurant_id == site.id)
    dishes = DishCatalog.query.filter_by(restaurant_id=site.id)
    keys = [
        site.logo_storage_key, site.cover_storage_key,
        *(photo.storage_key for photo in photos),
        *(image.storage_key for image in images),
        *(dish.storage_key for dish in dishes),
    ]
    return RemovalPlan(
        site_id=site.id,
        organization_id=site.organization_id,
        path=f'{site.organization.slug}/{site.slug}',
        name=site.name,
        counts={
            'menus': Menu.query.filter_by(restaurant_id=site.id).count(),
            'dishes': dishes.count(),
            'news': Event.query.filter_by(restaurant_id=site.id).count(),
            'closures': ExceptionalClosure.query.filter_by(restaurant_id=site.id).count(),
            'votes': MenuVote.query.filter_by(restaurant_id=site.id).count(),
            'audit_entries': AuditLog.query.filter_by(restaurant_id=site.id).count(),
        },
        accounts_deleted={user.id: user.email for user in members if places[user.id] == 1},
        accounts_kept={user.id: user.email for user in members if places[user.id] > 1},
        storage_keys=[key for key in keys if key],
    )


def remove_site(plan: RemovalPlan) -> Removal:
    """Deletes the site, every row of it and the accounts it was the only place of.

    The menus go first: `menu_items.dish_id` restricts the deletion of a dish still
    served, which Postgres checks at once, not at the end of the statement. The
    files and the Redis counters go once the deletion is committed, so a failed
    transaction loses nothing.
    """
    site = db.session.get(Restaurant, plan.site_id)
    if site is None or site.is_active:
        raise ValueError('Only a disabled site is removed.')

    for user in User.query.filter(User.id.in_(list(plan.accounts_kept))):
        (place,) = [m for m in user.memberships if m.restaurant_id == plan.site_id]
        user.memberships.remove(place)
        mirror_first_place(user)
    db.session.flush()

    db.session.execute(delete(Menu).where(Menu.restaurant_id == plan.site_id))
    db.session.execute(delete(Restaurant).where(Restaurant.id == plan.site_id))
    db.session.expire_all()
    for user in User.query.filter(User.id.in_(list(plan.accounts_deleted))):
        db.session.delete(user)

    AuditLog.log(
        action=AuditLog.ACTION_SITE_DELETE,
        target_type='site',
        target_id=plan.site_id,
        details={
            'via': 'cli', 'site': plan.path, 'name': plan.name, **plan.counts,
            'accounts_deleted': len(plan.accounts_deleted),
            'accounts_kept': len(plan.accounts_kept),
        },
        organization_id=plan.organization_id,
    )
    db.session.commit()
    return Removal(
        files_deleted=storage.delete_files(plan.storage_keys) or not plan.storage_keys,
        counters_dropped=telemetry.forget_site(plan.site_id),
    )
