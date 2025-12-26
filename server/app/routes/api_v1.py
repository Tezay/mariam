"""
MARIAM - API v1 (API Publique pour Développeurs)

API publique versionnée pour les développeurs tiers.
Tous les endpoints sont en lecture seule et ne nécessitent pas d'authentification.

Documentation disponible sur /api/v1/docs (Swagger UI)

Endpoints :
- GET /api/v1/menus - Menu d'aujourd'hui et de demain
- GET /api/v1/restaurant - Informations sur le restaurant
"""
from datetime import date, timedelta, datetime, timezone
from flask import request
from flask.views import MethodView
from flask_smorest import Blueprint
from marshmallow import Schema, fields


# ========================================
# SCHEMAS (Marshmallow for OpenAPI)
# ========================================

class MenuItemSchema(Schema):
    """Schema for a menu item."""
    name = fields.Str(description="Name of the dish")
    category = fields.Str(description="Category ID (e.g., 'entree', 'plat', 'dessert')")
    tags = fields.List(fields.Str(), description="Dietary tags (e.g., 'vegetarian', 'halal')")
    certifications = fields.List(fields.Str(), description="Certifications (e.g., 'bio', 'local')")


class DayMenuSchema(Schema):
    """Schema for a single day's menu."""
    date = fields.Str(description="Menu date (YYYY-MM-DD)")
    day_name = fields.Str(description="Day name in French")
    items = fields.List(fields.Nested(MenuItemSchema), description="List of menu items")
    is_available = fields.Bool(description="Whether menu data is available")


class MenusResponseSchema(Schema):
    """Response schema for /menus endpoint."""
    success = fields.Bool(dump_default=True)
    data = fields.Dict(keys=fields.Str(), values=fields.Nested(DayMenuSchema))
    meta = fields.Dict()


class RestaurantConfigSchema(Schema):
    """Schema for restaurant configuration."""
    service_days = fields.List(fields.Int(), description="Active service days (0=Monday, 6=Sunday)")
    menu_categories = fields.List(fields.Dict(), description="Menu category definitions")
    dietary_tags = fields.List(fields.Dict(), description="Available dietary tags")
    certifications = fields.List(fields.Dict(), description="Available certifications")


class RestaurantSchema(Schema):
    """Schema for restaurant information."""
    id = fields.Int(description="Restaurant ID")
    name = fields.Str(description="Restaurant name")
    address = fields.Str(description="Restaurant address", allow_none=True)
    code = fields.Str(description="Unique restaurant code")
    config = fields.Nested(RestaurantConfigSchema, description="Restaurant configuration")


class RestaurantResponseSchema(Schema):
    """Response schema for /restaurant endpoint."""
    success = fields.Bool(dump_default=True)
    data = fields.Nested(RestaurantSchema)
    meta = fields.Dict()


class ErrorResponseSchema(Schema):
    """Error response schema."""
    success = fields.Bool(dump_default=False)
    error = fields.Str(description="Error message")
    code = fields.Str(description="Error code")


# ========================================
# BLUEPRINT
# ========================================

api_v1_bp = Blueprint(
    'api_v1',
    __name__,
    url_prefix='/api/v1',
    description='Public API for developers - Read-only access to menu and restaurant data'
)


# ========================================
# HELPER FUNCTIONS
# ========================================

def get_default_restaurant():
    """Get the default active restaurant."""
    from ..models import Restaurant
    return Restaurant.query.filter_by(is_active=True).first()


def format_menu_items(menu):
    """Format menu items for API response."""
    if not menu or not menu.items:
        return []
    return [
        {
            'name': item.name,
            'category': item.category,
            'tags': item.tags or [],
            'certifications': item.certifications or []
        }
        for item in menu.items
    ]


def get_day_name(d: date) -> str:
    """Get French day name."""
    names = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
    return names[d.weekday()]


# ========================================
# ENDPOINTS
# ========================================

@api_v1_bp.route('/menus')
class MenusResource(MethodView):
    """Public menus endpoint - Today and tomorrow only."""
    
    @api_v1_bp.response(200, MenusResponseSchema)
    @api_v1_bp.alt_response(404, schema=ErrorResponseSchema, description="Restaurant not found")
    def get(self):
        """
        Get today's and tomorrow's menu.
        
        Returns the published menus for today and tomorrow.
        This endpoint is rate-limited and cached for performance.
        """
        from ..models import Menu
        
        restaurant_id = request.args.get('restaurant_id', type=int)
        
        if not restaurant_id:
            restaurant = get_default_restaurant()
            if not restaurant:
                return {
                    'success': False,
                    'error': 'No restaurant configured',
                    'code': 'NO_RESTAURANT'
                }, 404
            restaurant_id = restaurant.id
        
        today = date.today()
        tomorrow = today + timedelta(days=1)
        
        # Fetch menus
        today_menu = Menu.query.filter_by(
            restaurant_id=restaurant_id,
            date=today,
            status='published'
        ).first()
        
        tomorrow_menu = Menu.query.filter_by(
            restaurant_id=restaurant_id,
            date=tomorrow,
            status='published'
        ).first()
        
        return {
            'success': True,
            'data': {
                'today': {
                    'date': today.isoformat(),
                    'day_name': get_day_name(today),
                    'items': format_menu_items(today_menu),
                    'is_available': today_menu is not None
                },
                'tomorrow': {
                    'date': tomorrow.isoformat(),
                    'day_name': get_day_name(tomorrow),
                    'items': format_menu_items(tomorrow_menu),
                    'is_available': tomorrow_menu is not None
                }
            },
            'meta': {
                'generated_at': datetime.now(timezone.utc).isoformat(),
                'restaurant_id': restaurant_id
            }
        }


@api_v1_bp.route('/restaurant')
class RestaurantResource(MethodView):
    """Public restaurant information endpoint."""
    
    @api_v1_bp.response(200, RestaurantResponseSchema)
    @api_v1_bp.alt_response(404, schema=ErrorResponseSchema, description="Restaurant not found")
    def get(self):
        """
        Get restaurant information.
        
        Returns details about the restaurant including name, address,
        and configuration (service days, menu categories, dietary tags).
        """
        from ..models import Restaurant
        
        restaurant_id = request.args.get('restaurant_id', type=int)
        
        if restaurant_id:
            restaurant = Restaurant.query.get(restaurant_id)
        else:
            restaurant = get_default_restaurant()
        
        if not restaurant:
            return {
                'success': False,
                'error': 'Restaurant not found',
                'code': 'NOT_FOUND'
            }, 404
        
        config = restaurant.get_config()
        
        return {
            'success': True,
            'data': {
                'id': restaurant.id,
                'name': restaurant.name,
                'address': restaurant.address,
                'code': restaurant.code,
                'config': config
            },
            'meta': {
                'generated_at': datetime.now(timezone.utc).isoformat()
            }
        }
