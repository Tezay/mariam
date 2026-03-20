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
from ..models import User, Restaurant, AuditLog, DietaryTag, Certification
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
    if 'address' in data:
        restaurant.address = data['address']
    if 'logo_url' in data:
        restaurant.logo_url = data['logo_url']

    if 'service_days' in data:
        days = data['service_days']
        if isinstance(days, list) and all(isinstance(d, int) and 0 <= d <= 6 for d in days):
            restaurant.service_days = sorted(days)

    if 'menu_categories' in data:
        categories = data['menu_categories']
        if isinstance(categories, list):
            restaurant.menu_categories = categories

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
