from flask import jsonify
from flask_smorest import Blueprint

from ..models import Restaurant
from ..schemas.restaurant import RestaurantSchema
from ..services.access import accessible_restaurant_ids
from .helpers import admin_required, get_current_user, paginated_response

restaurant_bp = Blueprint('restaurant', __name__, description='The sites an account reaches')


@restaurant_bp.route('/restaurants', methods=['GET'])
@restaurant_bp.response(200, RestaurantSchema(many=True))
@admin_required
def list_restaurants():
    """List restaurants of the caller's organization (admin only)."""
    ids = accessible_restaurant_ids(get_current_user())
    if not ids:
        return jsonify({'restaurants': []}), 200
    query = Restaurant.query.filter(Restaurant.id.in_(ids)).order_by(Restaurant.name)
    return paginated_response(query, 'restaurants', lambda r: r.to_dict())
