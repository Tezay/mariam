"""Guarding the anonymous menu vote.

Nothing here can prove who votes. The chain bounds what one person can move: a
signed device token the client cannot mint itself, a fingerprint bound to that
token for the day, and a per-address ceiling sized for a shared campus network.
Every Redis-backed guard fails open — the unique constraint on (organization,
day, device) remains the last one, and refusing a whole campus's votes because
Redis blinked is the worse failure.
"""
import hmac
import logging
import os
import secrets
from datetime import date, timedelta

from sqlalchemy.exc import IntegrityError

from ..extensions import db
from ..models import (
    RATING_MAX,
    RATING_MIN,
    DishCatalog,
    Menu,
    MenuCategory,
    MenuItem,
    MenuVote,
    RestaurantServiceHours,
)
from ..utils.time import paris_now, paris_today
from .anti_abuse import claim_budget, daily_salt, digest, env_cap
from .redis_client import get_redis

logger = logging.getLogger(__name__)

_TOKEN_PREFIX = 'did1'
_TOKEN_BODY_CHARS = 64
_SIGNATURE_CHARS = 16
_FINGERPRINT_TTL = 48 * 3600


class VoteError(Exception):
    """Carries the HTTP status the route should answer with."""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def _secret() -> str:
    return os.environ.get('DEVICE_ID_SECRET', 'dev-device-secret-change-me')


def _sign(body: str) -> str:
    return hmac.new(_secret().encode(), body.encode(), 'sha256').hexdigest()[:_SIGNATURE_CHARS]


def mint_device_id() -> str:
    body = secrets.token_hex(_TOKEN_BODY_CHARS // 2)
    return f'{_TOKEN_PREFIX}.{body}.{_sign(body)}'


def device_body(token: str | None) -> str | None:
    """Random half of a valid token, or None when the signature does not match."""
    parts = (token or '').split('.')
    if len(parts) != 3 or parts[0] != _TOKEN_PREFIX:
        return None
    _, body, signature = parts
    if len(body) != _TOKEN_BODY_CHARS or not hmac.compare_digest(signature, _sign(body)):
        return None
    return body


def throttle_device_mint(ip: str) -> bool:
    """False once this address has spent its hourly allowance of new tokens."""
    client = get_redis()
    if client is None:
        return True
    try:
        salt = daily_salt(client, paris_today())
        if not salt:
            return True
        key = f'mariam:devmint:{digest(salt, ip)[:32]}'
        return claim_budget(client, key, env_cap('VOTE_DEVICE_MINT_PER_HOUR', 2000), ttl=3600)
    except Exception:
        return True


def voting_open(restaurant) -> bool:
    """A meal is rated once served, so the window opens with the day's service.

    It then stays open until midnight: a student answers on the way out, or in
    the evening. A day without service hours cannot be rated at all.
    """
    moment = paris_now()
    hours = RestaurantServiceHours.query.filter_by(
        restaurant_id=restaurant.id, day_of_week=moment.weekday()
    ).first()
    if hours is None or not hours.open_time:
        return False
    return moment.strftime('%H:%M') >= hours.open_time


def published_menu_today(restaurant_id: int) -> Menu | None:
    return Menu.query.filter_by(
        restaurant_id=restaurant_id, date=paris_today(), status='published'
    ).first()


def votable_categories(restaurant) -> list[MenuCategory]:
    """Categories a vote may name a dish from.

    Never configured means the first subcategory of the highlighted category —
    the main course — which is what a student means by "what I ate". An empty
    list is a deliberate choice and keeps the dish question off the widget.
    """
    selected = restaurant.vote_category_ids
    if selected is not None:
        if not selected:
            return []
        return (
            MenuCategory.query.filter(
                MenuCategory.restaurant_id == restaurant.id,
                MenuCategory.id.in_(selected),
            )
            .order_by(MenuCategory.order)
            .all()
        )

    highlighted = (
        MenuCategory.query.filter_by(
            restaurant_id=restaurant.id, is_highlighted=True, parent_id=None
        )
        .order_by(MenuCategory.order)
        .first()
    )
    if highlighted is None:
        return []
    first_child = (
        MenuCategory.query.filter_by(parent_id=highlighted.id)
        .order_by(MenuCategory.order)
        .first()
    )
    return [first_child or highlighted]


def vote_dish_groups(restaurant, menu: Menu) -> list[dict]:
    """Today's dishes, grouped by votable category."""
    categories = votable_categories(restaurant)
    if not categories:
        return []

    rows = (
        db.session.query(
            MenuItem.category_id, DishCatalog.id, DishCatalog.name, DishCatalog.image_url
        )
        .join(DishCatalog, DishCatalog.id == MenuItem.dish_id)
        .filter(
            MenuItem.menu_id == menu.id,
            MenuItem.category_id.in_([category.id for category in categories]),
        )
        .order_by(MenuItem.order)
        .all()
    )
    by_category: dict[int, list[dict]] = {}
    for category_id, dish_id, name, image_url in rows:
        by_category.setdefault(category_id, []).append(
            {'id': dish_id, 'name': name, 'image_url': image_url}
        )
    return [
        {'category_id': category.id, 'label': category.label, 'dishes': by_category[category.id]}
        for category in categories
        if category.id in by_category
    ]


def _address_budget_ok(org_id: int, day: date, ip: str) -> bool:
    """Ceiling on what one address may cast in a day.

    A campus votes from a single NAT address, so this bounds a scripted flood
    rather than a person; the device token is what limits an individual.
    """
    client = get_redis()
    if client is None:
        return True
    try:
        salt = daily_salt(client, day)
        if not salt:
            return True
        key = f'mariam:votecap:{org_id}:{day.isoformat()}:{digest(salt, ip)[:32]}'
        return claim_budget(client, key, env_cap('VOTE_IP_DAILY_CAP', 3000))
    except Exception:
        return True


def _fingerprint_free(org_id: int, day: date, fingerprint: str, device: str) -> bool:
    """Claim the fingerprint for this device; False when another already holds it.

    Salted per organization and per day and stored only in Redis, so the link
    cannot be followed from one day or one tenant to the next.
    """
    client = get_redis()
    if client is None:
        return True
    try:
        salt = daily_salt(client, day)
        if not salt:
            return True
        marker = digest(salt, str(org_id), fingerprint)[:32]
        key = f'mariam:fp:{org_id}:{day.isoformat()}:{marker}'
        client.set(key, device, nx=True, ex=_FINGERPRINT_TTL)
        holder = client.get(key)
        return holder is None or holder == device
    except Exception:
        return True


def get_own_vote(org_id: int, token: str | None) -> MenuVote | None:
    device = device_body(token)
    if device is None:
        return None
    return MenuVote.query.filter_by(
        organization_id=org_id, date=paris_today(), device_id=device
    ).first()


def _find_vote(org_id: int, day: date, device: str) -> MenuVote | None:
    return MenuVote.query.filter_by(
        organization_id=org_id, date=day, device_id=device
    ).first()


def _store(restaurant, menu: Menu, day: date, device: str, rating: int,
           dishes: list[DishCatalog], existing: MenuVote | None) -> str:
    if existing is None:
        db.session.add(MenuVote(
            organization_id=restaurant.organization_id,
            restaurant_id=restaurant.id,
            menu_id=menu.id,
            date=day,
            device_id=device,
            rating=rating,
            dishes=dishes,
            icon_preset=restaurant.vote_icon_preset,
        ))
        try:
            db.session.commit()
            return 'created'
        except IntegrityError:
            # Two taps raced; the second one is an edit of the first.
            db.session.rollback()
            existing = _find_vote(restaurant.organization_id, day, device)
            if existing is None:
                raise

    # Voting on another site of the organization moves the vote there.
    existing.restaurant_id = restaurant.id
    existing.menu_id = menu.id
    existing.rating = rating
    # The 1.x-style relationship carries no element type for mypy.
    existing.dishes = dishes  # type: ignore[assignment]
    existing.icon_preset = restaurant.vote_icon_preset
    db.session.commit()
    return 'updated'


def _resolve_dishes(restaurant, menu: Menu, dish_ids: list[int]) -> list[DishCatalog]:
    """Reject anything not on today's menu, and any second dish from one category."""
    if not dish_ids:
        return []

    allowed: dict[int, int] = {}
    for group in vote_dish_groups(restaurant, menu):
        for dish in group['dishes']:
            allowed[dish['id']] = group['category_id']

    seen_categories = set()
    for dish_id in dish_ids:
        category_id = allowed.get(dish_id)
        if category_id is None or category_id in seen_categories:
            raise VoteError(400, 'Plat invalide pour le menu du jour.')
        seen_categories.add(category_id)

    return DishCatalog.query.filter(DishCatalog.id.in_(dish_ids)).all()


def validate_and_record_vote(restaurant, token: str | None, rating: int,
                             dish_ids: list[int], fingerprint: str | None, ip: str) -> str:
    """Run the guard chain and store the vote. Raises VoteError on refusal."""
    device = device_body(token)
    if device is None:
        raise VoteError(403, "Jeton d'appareil invalide.")
    if not RATING_MIN <= rating <= RATING_MAX:
        raise VoteError(400, 'Note invalide.')
    # Uniqueness is scoped to the organization, so a site outside one has no
    # scope to be unique in and cannot take a vote at all.
    if not restaurant.vote_enabled or restaurant.organization_id is None:
        raise VoteError(409, "Le vote n'est pas proposé sur ce site.")

    menu = published_menu_today(restaurant.id)
    if menu is None or not voting_open(restaurant):
        raise VoteError(409, "Le vote n'est pas encore ouvert pour aujourd'hui.")

    day = paris_today()
    org_id = restaurant.organization_id
    existing = _find_vote(org_id, day, device)

    # Only a new vote can move the score, and only a new vote may spend the
    # shared address budget: charging edits would let one student exhaust it for
    # everyone else on the same network.
    if existing is None:
        if not _address_budget_ok(org_id, day, ip):
            raise VoteError(429, 'Trop de votes envoyés depuis ce réseau aujourd’hui.')
        if fingerprint and not _fingerprint_free(org_id, day, fingerprint, device):
            raise VoteError(409, 'Vote déjà enregistré.')

    dishes = _resolve_dishes(restaurant, menu, dish_ids)
    return _store(restaurant, menu, day, device, rating, dishes, existing)


def forget_device_ids(app, before: date | None = None) -> int:
    """Strip the device token from votes that can no longer be edited.

    Uniqueness only has to hold within a day, and NULLs never collide, so the
    constraint keeps working on the rows that still matter.
    """
    with app.app_context():
        cutoff = before or (paris_today() - timedelta(days=1))
        try:
            cleared = (
                MenuVote.query.filter(MenuVote.date < cutoff, MenuVote.device_id.isnot(None))
                .update({'device_id': None}, synchronize_session=False)
            )
            db.session.commit()
        except Exception:
            db.session.rollback()
            logger.exception('Device-id cleanup failed')
            return 0
        return cleared
