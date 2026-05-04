"""
Category routes for MARIAM — CRUD for menu categories and subcategories.

Admin endpoints (JWT required, admin role):
- GET    /v1/settings/categories              List all categories + subcategories
- POST   /v1/settings/categories              Create a category (or subcategory if parent_id)
- PUT    /v1/settings/categories/<id>         Update label, icon, order, is_highlighted
- DELETE /v1/settings/categories/<id>         Delete (forbidden if is_protected)
- PUT    /v1/settings/categories/reorder      Reorder categories (array of {id, order})
"""
from functools import wraps
from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from flask_smorest import Blueprint
from ..extensions import db
from ..models import User, Restaurant, AuditLog
from ..models.category import MenuCategory
from ..security import get_client_ip
from ..schemas.menus import (
    MenuCategorySchema,
    MenuCategoryCreateSchema,
    MenuCategoryUpdateSchema,
    MenuCategoryReorderSchema,
)
from ..schemas.common import ErrorSchema, MessageSchema


categories_bp = Blueprint(
    'categories', __name__,
    description='Menu categories — CRUD and ordering'
)


# ============================================================
# HELPERS
# ============================================================

def admin_required(f):
    @wraps(f)
    @jwt_required()
    def decorated(*args, **kwargs):
        user = User.query.get(int(get_jwt_identity()))
        if not user or not user.is_admin():
            return jsonify({'error': 'Accès réservé aux administrateurs'}), 403
        return f(*args, **kwargs)
    return decorated


def _get_restaurant():
    return Restaurant.query.filter_by(is_active=True).first()


# ============================================================
# ROUTES
# ============================================================

@categories_bp.route('/settings/categories', methods=['GET'])
@categories_bp.response(200, MenuCategorySchema(many=True))
@jwt_required()
def list_categories():
    """List all categories (with subcategories) for the active restaurant.

    Returns top-level categories in order, each with their subcategories nested.
    Accessible to any authenticated user.
    """
    user = User.query.get(int(get_jwt_identity()))
    if not user:
        return jsonify({'error': 'Non authentifié'}), 401

    restaurant = _get_restaurant()
    if not restaurant:
        return jsonify({'categories': []}), 200

    top_level = MenuCategory.query.filter_by(
        restaurant_id=restaurant.id, parent_id=None
    ).order_by(MenuCategory.order).all()

    return jsonify({'categories': [c.to_dict() for c in top_level]}), 200


@categories_bp.route('/settings/categories', methods=['POST'])
@categories_bp.arguments(MenuCategoryCreateSchema)
@categories_bp.response(201, MenuCategorySchema)
@categories_bp.alt_response(400, schema=ErrorSchema)
@categories_bp.alt_response(404, schema=ErrorSchema)
@admin_required
def create_category(data):
    """Create a new category or subcategory.

    Pass `parent_id` to create a subcategory (max 1 level deep).
    Subcategories can only be created under top-level categories.
    """
    restaurant = _get_restaurant()
    if not restaurant:
        return jsonify({'error': 'Aucun restaurant configuré'}), 404

    parent_id = data.get('parent_id')
    if parent_id is not None:
        parent = MenuCategory.query.filter_by(
            id=parent_id, restaurant_id=restaurant.id
        ).first()
        if not parent:
            return jsonify({'error': 'Catégorie parente introuvable'}), 404
        if parent.parent_id is not None:
            return jsonify({'error': 'Imbrication limitée à 1 niveau'}), 400

    label = (data.get('label') or '').strip()
    if not label:
        return jsonify({'error': 'Le nom est requis'}), 400

    # Auto-assign the first unused color from the palette (cyclic from indigo)
    _palette = ['indigo', 'sky', 'mint', 'saffron', 'clay', 'lilac']
    existing_colors = {
        c.color_key for c in
        MenuCategory.query.filter_by(restaurant_id=restaurant.id).all()
        if c.color_key
    }
    auto_color = next((c for c in _palette if c not in existing_colors), _palette[0])

    category = MenuCategory(
        restaurant_id=restaurant.id,
        parent_id=parent_id,
        label=label,
        icon=data.get('icon', 'utensils'),
        order=data.get('order', 0),
        color_key=auto_color,
    )
    db.session.add(category)

    AuditLog.log(
        action='category_create',
        user_id=int(get_jwt_identity()),
        target_type='menu_category',
        details={'label': label, 'parent_id': parent_id},
        ip_address=get_client_ip()
    )

    db.session.commit()
    return jsonify({'category': category.to_dict()}), 201


@categories_bp.route('/settings/categories/reorder', methods=['PUT'])
@categories_bp.arguments(MenuCategoryReorderSchema)
@categories_bp.response(200, MessageSchema)
@admin_required
def reorder_categories(data):
    """Reorder categories or subcategories.

    JSON body: `{ "items": [{"id": 1, "order": 0}, {"id": 2, "order": 1}] }`
    """
    restaurant = _get_restaurant()
    if not restaurant:
        return jsonify({'error': 'Aucun restaurant configuré'}), 404

    for item in data.get('items', []):
        cat = MenuCategory.query.filter_by(
            id=item.get('id'), restaurant_id=restaurant.id
        ).first()
        if cat:
            cat.order = item.get('order', cat.order)

    db.session.commit()
    return jsonify({'message': 'Ordre mis à jour'}), 200


@categories_bp.route('/settings/categories/<int:category_id>', methods=['PUT'])
@categories_bp.arguments(MenuCategoryUpdateSchema)
@categories_bp.response(200, MenuCategorySchema)
@categories_bp.alt_response(404, schema=ErrorSchema)
@admin_required
def update_category(data, category_id):
    """Update a category: label, icon, order, or is_highlighted."""
    restaurant = _get_restaurant()
    if not restaurant:
        return jsonify({'error': 'Aucun restaurant configuré'}), 404

    category = MenuCategory.query.filter_by(
        id=category_id, restaurant_id=restaurant.id
    ).first()
    if not category:
        return jsonify({'error': 'Catégorie introuvable'}), 404

    if 'label' in data:
        category.label = data['label'].strip() or category.label
    if 'icon' in data:
        category.icon = data['icon']
    if 'order' in data:
        category.order = data['order']
    if 'is_highlighted' in data:
        category.is_highlighted = data['is_highlighted']
    if 'color_key' in data:
        category.color_key = data.get('color_key')

    AuditLog.log(
        action='category_update',
        user_id=int(get_jwt_identity()),
        target_type='menu_category',
        target_id=category_id,
        details={'updated_fields': list(data.keys())},
        ip_address=get_client_ip()
    )

    db.session.commit()
    return jsonify({'category': category.to_dict()}), 200


@categories_bp.route('/settings/categories/<int:category_id>', methods=['DELETE'])
@categories_bp.response(200, MessageSchema)
@categories_bp.alt_response(403, schema=ErrorSchema, description="Category is protected")
@categories_bp.alt_response(404, schema=ErrorSchema)
@admin_required
def delete_category(category_id):
    """Delete a category or subcategory.

    Forbidden if `is_protected=True`.
    Cascades to subcategories and their menu items (FK cascade).
    """
    restaurant = _get_restaurant()
    if not restaurant:
        return jsonify({'error': 'Aucun restaurant configuré'}), 404

    category = MenuCategory.query.filter_by(
        id=category_id, restaurant_id=restaurant.id
    ).first()
    if not category:
        return jsonify({'error': 'Catégorie introuvable'}), 404

    if category.is_protected:
        return jsonify({'error': 'Cette catégorie ne peut pas être supprimée'}), 403

    AuditLog.log(
        action='category_delete',
        user_id=int(get_jwt_identity()),
        target_type='menu_category',
        target_id=category_id,
        details={'label': category.label},
        ip_address=get_client_ip()
    )

    db.session.delete(category)
    db.session.commit()
    return jsonify({'message': 'Catégorie supprimée'}), 200
