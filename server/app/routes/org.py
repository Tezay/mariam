"""
Supervision dashboard (org_admin only).

Endpoints under /v1/org give a cross-site view of the caller's organization.
Per-site management (menus, catalog, service) stays in the site dashboards, and
cross-site metrics live in /v1/analytics, which site admins also reach.
"""
from flask import jsonify
from flask_smorest import Blueprint

from ..extensions import db
from ..models import Event, Menu, Restaurant, User
from ..utils.time import paris_today, utc_naive_to_paris
from .helpers import accessible_restaurant_ids, get_current_user, org_admin_required

org_bp = Blueprint('org', __name__, description='Supervision dashboard')


@org_bp.route('/sites', methods=['GET'])
@org_admin_required
def org_sites():
    """Overview of every site of the caller's organization, with key metrics."""
    ids = accessible_restaurant_ids(get_current_user())
    if not ids:
        return jsonify({'sites': []}), 200

    sites = Restaurant.query.filter(Restaurant.id.in_(ids)).order_by(Restaurant.name).all()
    today = paris_today()

    user_counts = dict(
        db.session.query(User.restaurant_id, db.func.count(User.id))
        .filter(User.restaurant_id.in_(ids))
        .group_by(User.restaurant_id)
        .all()
    )
    published_today = {
        row[0]
        for row in db.session.query(Menu.restaurant_id)
        .filter(
            Menu.restaurant_id.in_(ids),
            Menu.date == today,
            Menu.status == 'published',
        )
        .all()
    }
    upcoming_events = dict(
        db.session.query(Event.restaurant_id, db.func.count(Event.id))
        .filter(
            Event.restaurant_id.in_(ids),
            Event.is_active,
            Event.status == 'published',
            Event.event_date >= today,
        )
        .group_by(Event.restaurant_id)
        .all()
    )
    last_published = dict(
        db.session.query(Menu.restaurant_id, db.func.max(Menu.published_at))
        .filter(Menu.restaurant_id.in_(ids), Menu.status == 'published')
        .group_by(Menu.restaurant_id)
        .all()
    )

    result = []
    for site in sites:
        published_at = last_published.get(site.id)
        result.append({
            'id': site.id,
            'name': site.name,
            'slug': site.slug,
            'is_active': site.is_active,
            'user_count': user_counts.get(site.id, 0),
            'today_menu_published': site.id in published_today,
            'upcoming_events': upcoming_events.get(site.id, 0),
            'last_published_at': (
                utc_naive_to_paris(published_at).isoformat() if published_at else None
            ),
        })

    return jsonify({'sites': result}), 200
