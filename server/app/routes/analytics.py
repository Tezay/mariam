"""Dashboard analytics for site admins and supervisors.

Scope comes from the caller's accessible sites, so one endpoint serves a
single-site admin and a supervisor of thirty sites without branching. The
`X-Restaurant-Id` header is deliberately ignored here: a supervisor filters
through `site_ids` instead of switching active site.
"""
from flask import jsonify, request
from flask_smorest import Blueprint

from ..services.analytics_stats import (
    DEFAULT_MIN_DISH_VOTES,
    cached_json,
    overview,
    publication_stats,
    resolve_scope,
    satisfaction_stats,
    traffic_stats,
)
from .helpers import admin_required, get_current_user

analytics_bp = Blueprint('analytics', __name__, description='Dashboard analytics')


def _cache_namespace(user) -> int:
    return user.organization_id or 0


@analytics_bp.route('/overview', methods=['GET'])
@admin_required
def analytics_overview():
    """Headline KPIs, trend and per-site table for the period."""
    user = get_current_user()
    scope = resolve_scope(user)
    data = cached_json(
        _cache_namespace(user),
        'overview',
        scope,
        lambda: overview(scope, user.organization_id),
    )
    return jsonify(data), 200


@analytics_bp.route('/publications', methods=['GET'])
@admin_required
def analytics_publications():
    """Publication compliance, punctuality and content completeness per site."""
    user = get_current_user()
    scope = resolve_scope(user)
    data = cached_json(
        _cache_namespace(user), 'publications', scope, lambda: publication_stats(scope)
    )
    return jsonify(data), 200


@analytics_bp.route('/traffic', methods=['GET'])
@admin_required
def analytics_traffic():
    """Public-page consultation over the period, per day, site, hour and page kind."""
    user = get_current_user()
    scope = resolve_scope(user)
    data = cached_json(
        _cache_namespace(user),
        'traffic',
        scope,
        lambda: traffic_stats(scope, user.organization_id),
    )
    return jsonify(data), 200


@analytics_bp.route('/satisfaction', methods=['GET'])
@admin_required
def analytics_satisfaction():
    """Menu ratings over the period, per day, site and dish."""
    user = get_current_user()
    scope = resolve_scope(user)
    try:
        min_votes = max(1, int(request.args.get('min_votes', DEFAULT_MIN_DISH_VOTES)))
    except ValueError:
        min_votes = DEFAULT_MIN_DISH_VOTES
    data = cached_json(
        _cache_namespace(user),
        'satisfaction',
        scope,
        lambda: satisfaction_stats(scope, min_votes),
        extra={'min_votes': min_votes},
    )
    return jsonify(data), 200
