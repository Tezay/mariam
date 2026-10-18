from flask_smorest import Blueprint

from ..models import Event, ExceptionalClosure
from ..schemas.public import (
    EventQuerySchema,
    PublicClosureListSchema,
    PublicEventListSchema,
    PublicSiteSchema,
)
from ..security import limiter, public_limit
from ..services.menu_window import visible_range
from ..utils.time import paris_today
from .scope import SESSION_OPTIONAL, finish_public_read, public_site, readable_site

sites_bp = Blueprint('sites', __name__, description='A site, its events and closures')
sites_bp.after_request(finish_public_read)


def _public_event(event: Event) -> dict:
    return {**event.to_dict(include_images=True), 'event_date': event.event_date}


@sites_bp.route('/<site>', methods=['GET'])
@sites_bp.doc(security=SESSION_OPTIONAL)
@limiter.limit(public_limit)
@sites_bp.response(200, PublicSiteSchema)
def get_site(org: str, site: str):
    """A site, with what a visitor needs to read its menus.

    Anyone reads an active site; its editors read it while it is closed too.
    """
    restaurant, _ = readable_site(org, site)
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
