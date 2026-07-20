"""
Slugged public API for MARIAM — resolves the tenant from the request Host
(subdomain = organization) and the restaurant slug in the path.

    GET /v1/public/org                     -> organization + its sites (by Host)
    GET /v1/public/<restaurant_slug>/today
    GET /v1/public/<restaurant_slug>/tomorrow
    GET /v1/public/<restaurant_slug>/week
    GET /v1/public/<restaurant_slug>/events
    GET /v1/public/<restaurant_slug>/closures
    GET /v1/public/<restaurant_slug>/restaurant

No authentication. Only published, active content is exposed. The legacy
`?restaurant_id=` endpoints stay for backward compatibility during the migration.
"""
import os
from datetime import timedelta

from flask import jsonify, request
from flask_smorest import Blueprint

from ..models import Event, ExceptionalClosure, Menu, Organization, Restaurant
from ..security import limiter
from ..utils.time import paris_today
from .menus import _format_menu_for_display

public_bp = Blueprint('public', __name__, description='Public tenant-scoped display API')

_DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']


# ============================================================
# TENANT RESOLUTION (Host -> organization, path slug -> restaurant)
# ============================================================

def org_slug_from_host(host: str | None) -> str | None:
    """Extract the organization slug from the request Host header.

    Production: ``<org>.<BASE_DOMAIN>``. Dev: ``<org>.localhost`` or the
    ``DEFAULT_ORG_SLUG`` fallback for a bare localhost / apex / unknown host.
    """
    default = os.environ.get('DEFAULT_ORG_SLUG')
    if not host:
        return default
    host = host.split(':')[0].lower()
    base = os.environ.get('BASE_DOMAIN', 'mariam.app')
    if host in ('localhost', '127.0.0.1'):
        return default
    if host.endswith('.localhost'):
        return host[: -len('.localhost')].split('.')[-1]
    if host.endswith('.' + base):
        return host[: -len('.' + base)].split('.')[-1]
    return default  # apex or custom domain


def resolve_organization():
    """Return the active Organization for the current request Host, or None."""
    slug = org_slug_from_host(request.host)
    if not slug:
        return None
    return Organization.query.filter_by(slug=slug, is_active=True).first()


def resolve_restaurant(restaurant_slug: str):
    """Return the active restaurant for the current Host + path slug, or None."""
    org = resolve_organization()
    if not org:
        return None
    return Restaurant.query.filter_by(
        organization_id=org.id, slug=restaurant_slug, is_active=True
    ).first()


def _restaurant_or_404(restaurant_slug: str):
    restaurant = resolve_restaurant(restaurant_slug)
    if not restaurant:
        return None, (jsonify({'error': 'Restaurant introuvable'}), 404)
    return restaurant, None


# ============================================================
# BOOTSTRAP — organization + sites for the current Host
# ============================================================

@public_bp.route('/org', methods=['GET'])
@limiter.limit('30 per minute')
def get_org():
    """Organization resolved from the Host, with its active restaurants (sites)."""
    org = resolve_organization()
    if not org:
        return jsonify({'error': 'Organisation introuvable', 'organization': None}), 404
    sites = (
        Restaurant.query.filter_by(organization_id=org.id, is_active=True)
        .order_by(Restaurant.name)
        .all()
    )
    return jsonify({
        'organization': {'name': org.name, 'slug': org.slug},
        'sites': [
            {'slug': r.slug, 'name': r.name, 'logo_url': r.logo_url}
            for r in sites
        ],
    }), 200


# ============================================================
# MENUS — today / tomorrow / week
# ============================================================

def _day_payload(restaurant, target_date):
    menu = Menu.query.filter_by(
        restaurant_id=restaurant.id, date=target_date, status='published'
    ).first()
    return {
        'date': target_date.isoformat(),
        'day_name': _DAY_NAMES[target_date.weekday()],
        'restaurant': restaurant.to_dict(include_config=True),
        'menu': _format_menu_for_display(menu),
    }


@public_bp.route('/<restaurant_slug>/today', methods=['GET'])
@limiter.limit('30 per minute')
def public_today(restaurant_slug):
    restaurant, err = _restaurant_or_404(restaurant_slug)
    if err:
        return err
    return jsonify(_day_payload(restaurant, paris_today())), 200


@public_bp.route('/<restaurant_slug>/tomorrow', methods=['GET'])
@limiter.limit('30 per minute')
def public_tomorrow(restaurant_slug):
    restaurant, err = _restaurant_or_404(restaurant_slug)
    if err:
        return err
    return jsonify(_day_payload(restaurant, paris_today() + timedelta(days=1))), 200


@public_bp.route('/<restaurant_slug>/week', methods=['GET'])
@limiter.limit('30 per minute')
def public_week(restaurant_slug):
    restaurant, err = _restaurant_or_404(restaurant_slug)
    if err:
        return err
    week_offset = request.args.get('week_offset', 0, type=int)
    monday = paris_today() + timedelta(weeks=week_offset)
    monday = monday - timedelta(days=monday.weekday())
    week_dates = [monday + timedelta(days=i) for i in range(7)]
    menus = {}
    for i, d in enumerate(week_dates):
        menu = Menu.query.filter_by(
            restaurant_id=restaurant.id, date=d, status='published'
        ).first()
        menus[d.isoformat()] = {
            'day_name': _DAY_NAMES[i],
            'menu': _format_menu_for_display(menu),
        }
    return jsonify({
        'week_start': week_dates[0].isoformat(),
        'week_end': week_dates[6].isoformat(),
        'restaurant': restaurant.to_dict(include_config=True),
        'menus': menus,
    }), 200


# ============================================================
# EVENTS / CLOSURES / RESTAURANT
# ============================================================

@public_bp.route('/<restaurant_slug>/events', methods=['GET'])
@limiter.limit('30 per minute')
def public_events(restaurant_slug):
    restaurant, err = _restaurant_or_404(restaurant_slug)
    if err:
        return err
    today = paris_today()
    visibility = request.args.get('visibility')
    limit = request.args.get('limit', 5, type=int)
    query = Event.query.filter(
        Event.restaurant_id == restaurant.id,
        Event.is_active,
        Event.status == 'published',
        Event.event_date >= today,
    )
    if visibility in ('tv', 'mobile'):
        query = query.filter((Event.visibility == visibility) | (Event.visibility == 'all'))
    events = query.order_by(Event.event_date.asc()).limit(limit).all()

    today_event = None
    upcoming = []
    for event in events:
        payload = event.to_dict(include_images=True)
        if event.event_date == today:
            today_event = payload
        else:
            upcoming.append(payload)
    return jsonify({
        'today_event': today_event,
        'upcoming_events': upcoming,
        'events': [e.to_dict(include_images=True) for e in events],
    }), 200


@public_bp.route('/<restaurant_slug>/closures', methods=['GET'])
@limiter.limit('30 per minute')
def public_closures(restaurant_slug):
    restaurant, err = _restaurant_or_404(restaurant_slug)
    if err:
        return err
    today = paris_today()
    closures = (
        ExceptionalClosure.query.filter(
            ExceptionalClosure.restaurant_id == restaurant.id,
            ExceptionalClosure.is_active,
            ExceptionalClosure.end_date >= today,
        )
        .order_by(ExceptionalClosure.start_date.asc())
        .all()
    )
    current = None
    upcoming = []
    for c in closures:
        payload = c.to_dict(today)
        if c.start_date <= today <= c.end_date:
            current = payload
        else:
            upcoming.append(payload)
    return jsonify({
        'current_closure': current,
        'upcoming_closures': upcoming,
        'closures': [c.to_dict(today) for c in closures],
    }), 200


@public_bp.route('/<restaurant_slug>/restaurant', methods=['GET'])
@limiter.limit('30 per minute')
def public_restaurant(restaurant_slug):
    restaurant, err = _restaurant_or_404(restaurant_slug)
    if err:
        return err
    return jsonify({'restaurant': restaurant.to_dict(include_config=True)}), 200
