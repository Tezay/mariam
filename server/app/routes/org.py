"""
Organization director dashboard (org_admin only).

Endpoints under /v1/org give a cross-site view of the caller's organization.
Per-site management (menus, catalog, service) stays in the site dashboards.
"""
from flask import jsonify
from flask_smorest import Blueprint

from ..models import Event, Menu, Restaurant, User
from ..utils.time import paris_today
from .helpers import accessible_restaurant_ids, admin_required, get_current_user

org_bp = Blueprint('org', __name__, description='Organization director dashboard')


@org_bp.route('/sites', methods=['GET'])
@admin_required
def org_sites():
    """Overview of every site of the caller's organization, with key metrics."""
    caller = get_current_user()
    if not caller.is_org_admin():
        return jsonify({'error': "Réservé au directeur d'organisation"}), 403

    ids = accessible_restaurant_ids(caller)
    sites = (
        Restaurant.query.filter(Restaurant.id.in_(ids)).order_by(Restaurant.name).all()
        if ids else []
    )
    today = paris_today()

    result = []
    for site in sites:
        result.append({
            'id': site.id,
            'name': site.name,
            'slug': site.slug,
            'is_active': site.is_active,
            'user_count': User.query.filter_by(restaurant_id=site.id).count(),
            'today_menu_published': Menu.query.filter_by(
                restaurant_id=site.id, date=today, status='published'
            ).first() is not None,
            'upcoming_events': Event.query.filter(
                Event.restaurant_id == site.id,
                Event.is_active,
                Event.status == 'published',
                Event.event_date >= today,
            ).count(),
        })

    return jsonify({'sites': result}), 200
