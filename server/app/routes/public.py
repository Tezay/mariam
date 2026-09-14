"""
Slugged public API for MARIAM — resolves the tenant from the request Origin,
falling back to the Host (subdomain = organization), and the restaurant slug in
the path.

    GET /v1/public/org                     -> organization + its sites (by Host)
    GET /v1/public/<restaurant_slug>/today
    GET /v1/public/<restaurant_slug>/tomorrow
    GET /v1/public/<restaurant_slug>/week
    GET /v1/public/<restaurant_slug>/events
    GET /v1/public/<restaurant_slug>/closures
    GET /v1/public/<restaurant_slug>/restaurant
    POST /v1/public/track

No authentication. Only published, active content is exposed. The legacy
`?restaurant_id=` endpoints stay for backward compatibility during the migration.
"""
import os
from datetime import timedelta
from urllib.parse import urlparse

from flask import jsonify, render_template, request
from flask_smorest import Blueprint
from marshmallow import ValidationError

from ..extensions import db
from ..models import PAGE_KINDS, Event, ExceptionalClosure, Menu, Organization, Restaurant
from ..models.telemetry import ORG_PAGE_KINDS
from ..schemas.public import VoteInputSchema
from ..security import get_client_ip, limiter
from ..services.email_service import user_from_token
from ..services.telemetry import record_page_view
from ..services.votes import (
    VoteError,
    get_own_vote,
    mint_device_id,
    published_menu_today,
    throttle_device_mint,
    validate_and_record_vote,
    vote_dish_groups,
    voting_open,
)
from ..utils.time import paris_today
from ..utils.urls import frontend_base_url
from .menus import _format_menu_for_display

public_bp = Blueprint('public', __name__, description='Public tenant-scoped display API')

_DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']


def _public_limit() -> str:
    """Rate limit shared by the anonymous pages.

    A campus reaches us through a single NAT address, so this budget covers a
    whole school at lunchtime rather than one visitor. Raise it for a very large
    site; lowering it below a few hundred starts refusing menus to students.
    """
    return os.environ.get('PUBLIC_RATE_LIMIT', '600 per minute')


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


def _tenant_host() -> str | None:
    """Hostname designating the tenant: Origin first, Host as the fallback.

    The API may answer on a domain of its own, where Host names the API and not
    the tenant. Origin is missing on same-origin GETs and on server-side calls,
    which is precisely where Host is the right answer.
    """
    origin = (request.headers.get('Origin') or '').strip()
    if origin and origin != 'null':
        hostname = urlparse(origin).hostname
        if hostname:
            return hostname
    return request.host


def resolve_organization():
    """Return the active Organization for the current request, or None."""
    slug = org_slug_from_host(_tenant_host())
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
@limiter.limit(_public_limit)
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
@limiter.limit(_public_limit)
def public_today(restaurant_slug):
    restaurant, err = _restaurant_or_404(restaurant_slug)
    if err:
        return err
    return jsonify(_day_payload(restaurant, paris_today())), 200


@public_bp.route('/<restaurant_slug>/tomorrow', methods=['GET'])
@limiter.limit(_public_limit)
def public_tomorrow(restaurant_slug):
    restaurant, err = _restaurant_or_404(restaurant_slug)
    if err:
        return err
    return jsonify(_day_payload(restaurant, paris_today() + timedelta(days=1))), 200


@public_bp.route('/<restaurant_slug>/week', methods=['GET'])
@limiter.limit(_public_limit)
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
@limiter.limit(_public_limit)
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
@limiter.limit(_public_limit)
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
@limiter.limit(_public_limit)
def public_restaurant(restaurant_slug):
    restaurant, err = _restaurant_or_404(restaurant_slug)
    if err:
        return err
    return jsonify({'restaurant': restaurant.to_dict(include_config=True)}), 200


# ============================================================
# TELEMETRY — anonymous, aggregate-only page counting
# ============================================================

def _beacon_origin_allowed() -> bool:
    """Reject a beacon claiming an origin this deployment does not serve.

    A missing Origin is accepted: same-origin beacons do not carry one on every
    engine, and refusing those would silently drop a whole browser family. What
    bounds a forged beacon is the per-visitor budget, not this check.
    """
    origin = request.headers.get('Origin')
    if not origin:
        return True
    host = (urlparse(origin).hostname or '').lower()
    if host in ('localhost', '127.0.0.1'):
        return True
    allowed = {
        urlparse(url.strip()).hostname
        for url in os.environ.get('FRONTEND_URL', '').split(',')
        if url.strip()
    }
    base = os.environ.get('BASE_DOMAIN', 'mariam.app').lower()
    return host in allowed or host == base or host.endswith(f'.{base}')


@public_bp.route('/track', methods=['POST'])
@limiter.limit(_public_limit)
def track_page_view():
    """Count one view of a public page.

    Always answers 204, including when telemetry is off or Redis is down: a
    visitor must never see a menu page degraded by a counter.

    Body: `page_kind`, plus `site` for a site-scoped page. Parsed regardless of
    the content type, which `navigator.sendBeacon` sets to text/plain to avoid a
    CORS preflight.
    """
    if not _beacon_origin_allowed():
        return '', 204

    payload = request.get_json(silent=True, force=True) or {}
    page_kind = payload.get('page_kind') or request.args.get('page_kind')
    if page_kind not in PAGE_KINDS:
        return '', 204

    if page_kind in ORG_PAGE_KINDS:
        organization = resolve_organization()
        if organization:
            record_page_view(
                page_kind,
                get_client_ip(),
                request.headers.get('User-Agent', ''),
                organization_id=organization.id,
            )
        return '', 204

    site_slug = payload.get('site') or request.args.get('site')
    restaurant = resolve_restaurant(site_slug) if site_slug else None
    if restaurant:
        record_page_view(
            page_kind,
            get_client_ip(),
            request.headers.get('User-Agent', ''),
            restaurant_id=restaurant.id,
        )
    return '', 204


# ============================================================
# MENU VOTE — anonymous, one per device and organization per day
# ============================================================

@public_bp.route('/device', methods=['POST'])
@limiter.limit(_public_limit)
def mint_device():
    """Issue a signed device token for the vote widget.

    The signature is what stops a client from minting its own identities; the
    hourly throttle bounds how many one address can collect.
    """
    if not throttle_device_mint(get_client_ip()):
        return jsonify({'error': 'Trop de demandes, réessayez plus tard.'}), 429
    return jsonify({'device_id': mint_device_id()}), 200


@public_bp.route('/<restaurant_slug>/vote', methods=['GET'])
@limiter.limit(_public_limit)
def get_vote_state(restaurant_slug):
    """State of the widget: the caller's own vote, never anyone else's."""
    restaurant, err = _restaurant_or_404(restaurant_slug)
    if err:
        return err

    menu = published_menu_today(restaurant.id) if restaurant.vote_enabled else None
    vote = get_own_vote(restaurant.organization_id, request.args.get('device_id'))
    return jsonify({
        'vote': vote.to_dict() if vote else None,
        'dish_groups': vote_dish_groups(restaurant, menu) if menu else [],
        'voting_open': menu is not None and voting_open(restaurant),
        'icon_preset': restaurant.vote_icon_preset,
    }), 200


@public_bp.route('/<restaurant_slug>/vote', methods=['POST'])
@limiter.limit(_public_limit)
def cast_vote(restaurant_slug):
    restaurant, err = _restaurant_or_404(restaurant_slug)
    if err:
        return err

    try:
        payload = VoteInputSchema().load(request.get_json(silent=True) or {})
    except ValidationError:
        return jsonify({'error': 'Requête invalide.'}), 400

    try:
        status = validate_and_record_vote(
            restaurant,
            payload['device_id'],
            payload['rating'],
            payload['dish_ids'],
            payload['fingerprint'],
            get_client_ip(),
        )
    except VoteError as error:
        return jsonify({'error': error.message}), error.status

    vote = get_own_vote(restaurant.organization_id, payload['device_id'])
    return jsonify({'status': status, 'vote': vote.to_dict() if vote else None}), 200


# ============================================================
# EMAIL — one-click unsubscribe from the weekly digest
# ============================================================

@public_bp.route('/unsubscribe/<token>', methods=['GET', 'POST'])
@limiter.limit(_public_limit)
def unsubscribe(token: str):
    """Turn the weekly digest off from the email itself.

    POST answers the one-click of mail clients (RFC 8058); GET renders a page
    for the footer link, so neither needs a session.
    """
    user = user_from_token(token)
    if user:
        prefs = user.get_notification_preferences()
        prefs['weekly_digest'] = False
        user.notification_preferences = prefs
        db.session.commit()

    if request.method == 'POST':
        return '', 204
    return render_template(
        'public/unsubscribe.html',
        done=user is not None,
        url=frontend_base_url(),
    )
