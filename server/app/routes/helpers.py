"""Helpers partagés entre les routes authentifiées."""
import re
from functools import wraps

from flask import jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from ..extensions import db
from ..models import DishCatalog, Restaurant, User
from ..models.taxonomy import Certification, DietaryTag


def editor_required(f):
    """Décorateur : accès réservé aux éditeurs (role editor ou admin)."""
    @wraps(f)
    @jwt_required()
    def decorated_function(*args, **kwargs):
        current_user_id = int(get_jwt_identity())
        user = User.query.get(current_user_id)
        if not user or not user.is_editor():
            return jsonify({'error': 'Accès réservé aux éditeurs'}), 403
        return f(*args, **kwargs)
    return decorated_function


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


def get_default_restaurant():
    """Return the first active restaurant.

    Only for resolving which restaurant to display to an anonymous public
    visitor (single-tenant). NEVER use it as a fallback on an authenticated
    path: the tenant must always come from the current user.
    """
    return Restaurant.query.filter_by(is_active=True).first()


def get_current_user():
    """Return the user for the current JWT identity, or None."""
    identity = get_jwt_identity()
    if not identity:
        return None
    return User.query.get(int(identity))


def get_user_and_restaurant():
    """Return (user, restaurant) for the current JWT user.

    The restaurant is the one the user belongs to, with no fallback to a default
    restaurant. Returns (user, None) if the user has no restaurant, and
    (None, None) if the user cannot be found.
    """
    user = get_current_user()
    if not user:
        return None, None
    return user, get_active_restaurant(user)


def get_active_restaurant(user):
    """Restaurant targeted by the current request.

    An org_admin can act on any site of its organization by sending the
    `X-Restaurant-Id` header (validated against its accessible sites). Any other
    user acts on its own restaurant.
    """
    if user is None:
        return None
    header = request.headers.get('X-Restaurant-Id')
    if header:
        try:
            target = int(header)
        except (TypeError, ValueError):
            target = None
        if target is not None and target in accessible_restaurant_ids(user):
            return Restaurant.query.get(target)
    return Restaurant.query.get(user.restaurant_id) if user.restaurant_id else None


def accessible_restaurant_ids(user):
    """Return the set of restaurant ids the user may act on.

    - org_admin: every restaurant of its organization.
    - admin / editor / reader: only its own restaurant.
    - unassigned: empty set (no access).
    """
    if user is None:
        return set()
    if user.is_org_admin() and user.organization_id:
        rows = Restaurant.query.filter_by(
            organization_id=user.organization_id
        ).with_entities(Restaurant.id).all()
        return {row[0] for row in rows}
    if user.restaurant_id:
        return {user.restaurant_id}
    return set()


def user_can_access_restaurant(user, restaurant_id):
    """Return True if the user may act on this restaurant."""
    return restaurant_id is not None and restaurant_id in accessible_restaurant_ids(user)


def scoped_get(model, resource_id):
    """Return a model row by id only if it belongs to a restaurant accessible to
    the current user, otherwise None.

    The model must expose a `restaurant_id` column.
    """
    ids = accessible_restaurant_ids(get_current_user())
    if not ids:
        return None
    return model.query.filter(
        model.id == resource_id, model.restaurant_id.in_(ids)
    ).first()


def normalize_dish_name(name: str) -> str:
    """Normalise un nom de plat : espaces compactés, première lettre en majuscule.

    Miroir de `normalizeDishName` côté client (pages/admin/catalogue/utils.ts).
    """
    name = re.sub(r'\s+', ' ', name.strip())
    return name[0].upper() + name[1:] if name else name


def get_or_create_dish(restaurant_id: int, item_data: dict) -> 'DishCatalog | None':
    """Retourne un plat existant (dish_id) ou en crée un nouveau (name + tag_ids + cert_ids)."""
    dish_id = item_data.get('dish_id')
    if dish_id:
        return DishCatalog.query.filter_by(id=dish_id, restaurant_id=restaurant_id).first()

    name = normalize_dish_name(item_data.get('name', ''))
    if not name:
        return None

    # Réutilise un plat existant de même nom dans la même catégorie (assure indempotence)
    existing = DishCatalog.query.filter(
        DishCatalog.restaurant_id == restaurant_id,
        DishCatalog.category_id == item_data.get('category_id'),
        db.func.lower(DishCatalog.name) == name.lower(),
    ).first()
    if existing:
        return existing

    dish = DishCatalog(
        restaurant_id=restaurant_id,
        category_id=item_data.get('category_id'),
        name=name,
    )
    tag_ids = item_data.get('tag_ids', [])
    if tag_ids:
        dish.tags = DietaryTag.query.filter(DietaryTag.id.in_(tag_ids)).all()
    cert_ids = item_data.get('certification_ids', [])
    if cert_ids:
        dish.certifications = Certification.query.filter(Certification.id.in_(cert_ids)).all()

    db.session.add(dish)
    db.session.flush()
    return dish


def paginated_response(query, items_key, serialize, default_per_page=50):
    """JSON envelope for a list endpoint: full list by default, DB-side paginated
    when ``?page=`` is present.

    Backward-compatible: without ``page`` the shape stays ``{items_key: [...]}``;
    with it, ``total``/``page``/``per_page``/``has_more`` are added. ``per_page``
    is capped at 200.
    """
    page = request.args.get('page', type=int)
    if page is None:
        return jsonify({items_key: [serialize(o) for o in query.all()]}), 200
    per_page = min(request.args.get('per_page', default_per_page, type=int), 200)
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    return jsonify({
        items_key: [serialize(o) for o in pagination.items],
        'total': pagination.total,
        'page': page,
        'per_page': per_page,
        'has_more': pagination.has_next,
    }), 200
