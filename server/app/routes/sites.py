import datetime

from flask_smorest import Blueprint

from ..models import Event, ExceptionalClosure, Menu
from ..problems import Problem
from ..schemas.public import (
    DeviceHeaderSchema,
    EventQuerySchema,
    MenuRangeQuerySchema,
    PublicClosureListSchema,
    PublicEventListSchema,
    PublicMenuListSchema,
    PublicMenuSchema,
    PublicSiteSchema,
    VoteInputSchema,
    VoteSchema,
    VoteStateSchema,
)
from ..security import get_client_ip, limiter, public_limit
from ..services.menu_window import visible_range
from ..services.votes import (
    VoteError,
    get_own_vote,
    published_menu_today,
    validate_and_record_vote,
    vote_dish_groups,
    voting_open,
)
from ..utils.time import paris_today
from .menus import _format_menu_for_display
from .scope import finish_public_read, public_site

sites_bp = Blueprint('sites', __name__, description='A site, its menus, events and closures')
sites_bp.after_request(finish_public_read)


def _only_today(day: datetime.date) -> None:
    if day != paris_today():
        raise Problem(404, 'vote_not_found', 'Le vote ne porte que sur le menu du jour.')


def _public_menu(menu: Menu) -> dict:
    return {**_format_menu_for_display(menu), 'date': menu.date}


def _public_event(event: Event) -> dict:
    return {**event.to_dict(include_images=True), 'event_date': event.event_date}


@sites_bp.route('/<site>', methods=['GET'])
@sites_bp.doc(security=[])
@limiter.limit(public_limit)
@sites_bp.response(200, PublicSiteSchema)
def get_site(org: str, site: str):
    """An active site, with what a visitor needs to read its menus."""
    restaurant = public_site(org, site)
    config = restaurant.get_config()
    start, end = visible_range(paris_today())
    return {
        **restaurant.to_dict(),
        'slug': restaurant.slug,
        'service_days': config['service_days'],
        'vote_enabled': config['vote_enabled'],
        'vote_icon_preset': config['vote_icon_preset'],
        'dietary_tags': config['dietary_tags'],
        'certifications': config['certifications'],
        'menu_window': {'start': start, 'end': end},
    }


@sites_bp.route('/<site>/menus', methods=['GET'])
@sites_bp.doc(security=[])
@limiter.limit(public_limit)
@sites_bp.arguments(MenuRangeQuerySchema, location='query')
@sites_bp.response(200, PublicMenuListSchema)
def list_menus(query, org: str, site: str):
    """Published menus between two dates, both included.

    Only the dates of the site's `menu_window` are visible: a range reaching
    past it lists what falls inside.
    """
    restaurant = public_site(org, site)
    today = paris_today()
    window_start, window_end = visible_range(today)
    start = max(query.get('start', today), window_start)
    end = min(query.get('end', window_end), window_end)
    menus = Menu.query.filter(
        Menu.restaurant_id == restaurant.id,
        Menu.status == 'published',
        Menu.date >= start,
        Menu.date <= end,
    ).order_by(Menu.date).all()
    return {'items': [_public_menu(menu) for menu in menus]}


@sites_bp.route('/<site>/menus/<date:date>', methods=['GET'])
@sites_bp.doc(security=[])
@limiter.limit(public_limit)
@sites_bp.response(200, PublicMenuSchema)
def get_menu(org: str, site: str, date: datetime.date):
    """The published menu of one day, within the site's `menu_window`."""
    restaurant = public_site(org, site)
    window_start, window_end = visible_range(paris_today())
    menu = None
    if window_start <= date <= window_end:
        menu = Menu.query.filter_by(
            restaurant_id=restaurant.id, date=date, status='published'
        ).first()
    if menu is None:
        raise Problem(404, 'menu_not_found', 'Menu introuvable.')
    return _public_menu(menu)


@sites_bp.route('/<site>/events', methods=['GET'])
@sites_bp.doc(security=[])
@limiter.limit(public_limit)
@sites_bp.arguments(EventQuerySchema, location='query')
@sites_bp.response(200, PublicEventListSchema)
def list_events(query, org: str, site: str):
    """Published events from today on, soonest first."""
    restaurant = public_site(org, site)
    events = Event.query.filter(
        Event.restaurant_id == restaurant.id,
        Event.is_active,
        Event.status == 'published',
        Event.event_date >= paris_today(),
    )
    if 'visibility' in query:
        events = events.filter(Event.visibility.in_((query['visibility'], 'all')))
    events = events.order_by(Event.event_date.asc()).limit(query['limit']).all()
    return {'items': [_public_event(event) for event in events]}


@sites_bp.route('/<site>/closures', methods=['GET'])
@sites_bp.doc(security=[])
@limiter.limit(public_limit)
@sites_bp.response(200, PublicClosureListSchema)
def list_closures(org: str, site: str):
    """Exceptional closures under way or to come, soonest first."""
    restaurant = public_site(org, site)
    closures = ExceptionalClosure.query.filter(
        ExceptionalClosure.restaurant_id == restaurant.id,
        ExceptionalClosure.is_active,
        ExceptionalClosure.end_date >= paris_today(),
    ).order_by(ExceptionalClosure.start_date.asc()).all()
    return {'items': closures}


@sites_bp.route('/<site>/menus/<date:date>/vote', methods=['GET'])
@sites_bp.doc(security=[])
@limiter.limit(public_limit)
@sites_bp.arguments(DeviceHeaderSchema, location='headers')
@sites_bp.response(200, VoteStateSchema)
def get_vote(headers, org: str, site: str, date: datetime.date):
    """What the caller's device may rate today, and its own vote if any.

    Never anyone else's vote.
    """
    restaurant = public_site(org, site)
    _only_today(date)
    menu = published_menu_today(restaurant.id) if restaurant.vote_enabled else None
    vote = get_own_vote(restaurant.organization_id, headers.get('device_id'))
    return {
        'vote': vote.to_dict() if vote else None,
        'dish_groups': vote_dish_groups(restaurant, menu) if menu else [],
        'voting_open': menu is not None and voting_open(restaurant),
    }


@sites_bp.route('/<site>/menus/<date:date>/vote', methods=['PUT'])
@sites_bp.doc(security=[])
@limiter.limit(public_limit)
@sites_bp.arguments(DeviceHeaderSchema, location='headers')
@sites_bp.arguments(VoteInputSchema)
@sites_bp.response(200, VoteSchema, description='The vote replaced the device’s previous one')
@sites_bp.alt_response(201, schema=VoteSchema, description='The device’s first vote of the day')
def put_vote(headers, body, org: str, site: str, date: datetime.date):
    """Rate today's meal: one vote per device, organization and day."""
    restaurant = public_site(org, site)
    _only_today(date)
    try:
        outcome = validate_and_record_vote(
            restaurant,
            headers.get('device_id'),
            body['rating'],
            body['dish_ids'],
            body['fingerprint'],
            get_client_ip(),
        )
    except VoteError as error:
        raise Problem(error.status, error.code, error.message) from None
    vote = get_own_vote(restaurant.organization_id, headers.get('device_id'))
    assert vote is not None, 'the vote just stored'
    return vote.to_dict(), 201 if outcome == 'created' else 200
