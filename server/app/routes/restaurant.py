"""
Restaurant and settings routes for MARIAM.

Public endpoints:
- GET /v1/restaurant         Active restaurant info (with config)

Editor endpoints (JWT required):
- GET /v1/settings           Active restaurant settings
- PUT /v1/settings           Update settings (admin only)

Admin endpoints:
- GET  /v1/restaurants       List all restaurants
- POST /v1/restaurants       Create a restaurant
- PUT  /v1/restaurants/<id>  Update a restaurant
"""
from functools import wraps
from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from flask_smorest import Blueprint
from ..extensions import db
from ..models import User, Restaurant, RestaurantServiceHours, AuditLog, DietaryTag, Certification
from ..models.category import MenuCategory
from ..security import get_client_ip, limiter
from ..schemas.restaurant import RestaurantSchema, RestaurantUpdateSchema
from ..schemas.common import ErrorSchema, MessageSchema


restaurant_bp = Blueprint(
    'restaurant', __name__,
    description='Restaurant — Public info, settings and management'
)


# ============================================================
# HELPERS
# ============================================================

def admin_required(f):
    """Décorateur : accès réservé aux administrateurs."""
    @wraps(f)
    @jwt_required()
    def decorated_function(*args, **kwargs):
        current_user_id = int(get_jwt_identity())
        user = User.query.get(current_user_id)
        if not user or not user.is_admin():
            return jsonify({'error': 'Accès réservé aux administrateurs'}), 403
        return f(*args, **kwargs)
    return decorated_function


# ============================================================
# ROUTE PUBLIQUE — info restaurant
# ============================================================

@restaurant_bp.route('/restaurant', methods=['GET'])
@limiter.limit("30 per minute")
@restaurant_bp.response(200, RestaurantSchema)
def get_restaurant_info():
    """Active restaurant info (no authentication required).

    Returns the name, address, logo and public configuration
    (service days, menu categories, active tags, etc.).

    Query param: `restaurant_id` (int, optional)
    """
    restaurant_id = request.args.get('restaurant_id', type=int)

    if restaurant_id:
        restaurant = Restaurant.query.get(restaurant_id)
    else:
        restaurant = Restaurant.query.filter_by(is_active=True).first()

    if not restaurant:
        return jsonify({'error': 'Restaurant non trouvé', 'restaurant': None}), 200

    return jsonify({'restaurant': restaurant.to_dict(include_config=True)}), 200


# ============================================================
# PARAMÈTRES — GET accessible à tout le staff, PUT admin only
# ============================================================

@restaurant_bp.route('/settings', methods=['GET'])
@restaurant_bp.response(200, RestaurantSchema)
@restaurant_bp.alt_response(404, schema=ErrorSchema, description="No restaurant configured")
@jwt_required()
def get_settings():
    """Full settings for the active restaurant.

    Accessible to any authenticated user (editor or admin).
    Includes complete configuration: service days, categories,
    enabled dietary tags, certifications, etc.
    """
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)
    if not user:
        return jsonify({'error': 'Utilisateur introuvable'}), 401

    restaurant = Restaurant.query.filter_by(is_active=True).first()
    if not restaurant:
        return jsonify({'error': 'Aucun restaurant configuré'}), 404

    return jsonify({'restaurant': restaurant.to_dict(include_config=True)}), 200


@restaurant_bp.route('/settings', methods=['PUT'])
@restaurant_bp.arguments(RestaurantUpdateSchema)
@restaurant_bp.response(200, RestaurantSchema)
@restaurant_bp.alt_response(400, schema=ErrorSchema, description="Invalid data")
@restaurant_bp.alt_response(404, schema=ErrorSchema, description="No restaurant configured")
@admin_required
def update_settings(data):
    """Update the active restaurant's settings.

    Editable fields: `name`, `address`, `logo_url`, `service_days`,
    `menu_categories`, `dietary_tags` (list of IDs), `certifications` (list of IDs).
    """
    current_user_id = int(get_jwt_identity())
    restaurant = Restaurant.query.filter_by(is_active=True).first()
    if not restaurant:
        return jsonify({'error': 'Aucun restaurant configuré'}), 404

    if 'name' in data:
        restaurant.name = data['name']
    if 'logo_url' in data:
        restaurant.logo_url = data['logo_url']

    # Address (BAN-verified)
    if 'address_label' in data:
        restaurant.address_label = data['address_label']
    if 'address_lat' in data:
        restaurant.address_lat = data['address_lat']
    if 'address_lon' in data:
        restaurant.address_lon = data['address_lon']

    # Contact
    if 'email' in data:
        restaurant.email = data['email']
    if 'phone' in data:
        restaurant.phone = data['phone']
    if 'capacity' in data:
        restaurant.capacity = data['capacity']

    # Payment methods & accessibility
    if 'payment_methods' in data:
        restaurant.payment_methods = data['payment_methods']
    if 'pmr_access' in data:
        restaurant.pmr_access = data['pmr_access']

    # Service hours — upsert one row per day
    if 'service_hours' in data and isinstance(data['service_hours'], dict):
        incoming = data['service_hours']  # {"0": {"open": "11:30", "close": "14:00"}, ...}
        existing = {str(h.day_of_week): h for h in restaurant.service_hours}
        for day_str, times in incoming.items():
            try:
                day = int(day_str)
            except ValueError:
                continue
            if day_str in existing:
                existing[day_str].open_time = times['open']
                existing[day_str].close_time = times['close']
            else:
                db.session.add(RestaurantServiceHours(
                    restaurant_id=restaurant.id,
                    day_of_week=day,
                    open_time=times['open'],
                    close_time=times['close'],
                ))
        # Remove rows for days no longer present
        for day_str, row in existing.items():
            if day_str not in incoming:
                db.session.delete(row)

    if 'service_days' in data:
        days = data['service_days']
        if isinstance(days, list) and all(isinstance(d, int) and 0 <= d <= 6 for d in days):
            restaurant.service_days = sorted(days)

    if 'dietary_tags' in data or 'certifications' in data:
        restaurant.tags_customized = True

    if 'dietary_tags' in data:
        tag_ids = data['dietary_tags']
        if isinstance(tag_ids, list):
            if tag_ids and isinstance(tag_ids[0], dict):
                tag_ids = [t['id'] for t in tag_ids]
            restaurant.enabled_tags = DietaryTag.query.filter(
                DietaryTag.id.in_(tag_ids)
            ).all()

    if 'certifications' in data:
        cert_ids = data['certifications']
        if isinstance(cert_ids, list):
            if cert_ids and isinstance(cert_ids[0], dict):
                cert_ids = [c['id'] for c in cert_ids]
            restaurant.enabled_certifications = Certification.query.filter(
                Certification.id.in_(cert_ids)
            ).all()

    AuditLog.log(
        action='settings_update',
        user_id=current_user_id,
        target_type='restaurant',
        target_id=restaurant.id,
        details={'updated_fields': list(data.keys())},
        ip_address=get_client_ip()
    )

    db.session.commit()

    return jsonify({
        'message': 'Paramètres mis à jour',
        'restaurant': restaurant.to_dict(include_config=True),
    }), 200


# ============================================================
# HELPERS
# ============================================================

def _create_default_categories(restaurant_id: int) -> None:
    """Create the standard set of categories for a new restaurant."""
    plat = MenuCategory(
        restaurant_id=restaurant_id,
        label='Plat principal',
        icon='utensils',
        order=2,
        is_protected=True,
        is_highlighted=True,
        color_key=None,
    )
    db.session.add(plat)
    db.session.flush()  # get plat.id for subcategories

    defaults = [
        MenuCategory(restaurant_id=restaurant_id, label='Entrées', icon='salad', order=1, color_key='indigo'),
        MenuCategory(restaurant_id=restaurant_id, label='Dessert', icon='cake-slice', order=3, color_key='saffron'),
    ]
    subcategories = [
        MenuCategory(restaurant_id=restaurant_id, parent_id=plat.id, label='Protéine', icon='beef', order=1, is_protected=True, color_key='clay'),
        MenuCategory(restaurant_id=restaurant_id, parent_id=plat.id, label='Accompagnement', icon='wheat', order=2, is_protected=True, color_key='mint'),
    ]
    for cat in defaults + subcategories:
        db.session.add(cat)


# ============================================================
# GESTION ADMIN DES RESTAURANTS (CRUD)
# ============================================================

@restaurant_bp.route('/restaurants', methods=['GET'])
@restaurant_bp.response(200, RestaurantSchema(many=True))
@admin_required
def list_restaurants():
    """List all restaurants (admin only)."""
    restaurants = Restaurant.query.order_by(Restaurant.name).all()
    return jsonify({'restaurants': [r.to_dict() for r in restaurants]}), 200


@restaurant_bp.route('/restaurants', methods=['POST'])
@restaurant_bp.arguments(RestaurantUpdateSchema)
@restaurant_bp.response(201, RestaurantSchema)
@restaurant_bp.alt_response(400, schema=ErrorSchema, description="Name and code required")
@restaurant_bp.alt_response(409, schema=ErrorSchema, description="Code already in use")
@admin_required
def create_restaurant(data):
    """Create a new restaurant."""
    name = data.get('name')
    code = data.get('code')

    if not name or not code:
        return jsonify({'error': 'Nom et code requis'}), 400

    if Restaurant.query.filter_by(code=code).first():
        return jsonify({'error': 'Ce code est déjà utilisé'}), 409

    restaurant = Restaurant(
        name=name,
        code=code,
        address=data.get('address'),
        logo_url=data.get('logo_url'),
    )
    db.session.add(restaurant)
    db.session.flush()  # get restaurant.id without committing

    _create_default_categories(restaurant.id)
    db.session.commit()

    return jsonify({'message': 'Restaurant créé', 'restaurant': restaurant.to_dict()}), 201


@restaurant_bp.route('/restaurants/<int:restaurant_id>', methods=['PUT'])
@restaurant_bp.arguments(RestaurantUpdateSchema)
@restaurant_bp.response(200, RestaurantSchema)
@restaurant_bp.alt_response(404, schema=ErrorSchema, description="Restaurant not found")
@admin_required
def update_restaurant(data, restaurant_id):
    """Update an existing restaurant."""
    restaurant = Restaurant.query.get(restaurant_id)
    if not restaurant:
        return jsonify({'error': 'Restaurant non trouvé'}), 404

    if 'name' in data:
        restaurant.name = data['name']
    if 'address' in data:
        restaurant.address = data['address']
    if 'logo_url' in data:
        restaurant.logo_url = data['logo_url']
    if 'is_active' in data:
        restaurant.is_active = data['is_active']

    db.session.commit()

    return jsonify({'message': 'Restaurant mis à jour', 'restaurant': restaurant.to_dict()}), 200
