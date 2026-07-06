"""Helpers partagés entre les routes authentifiées."""
import re
from functools import wraps

from flask import jsonify
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
    """Retourne le premier restaurant actif."""
    return Restaurant.query.filter_by(is_active=True).first()


def get_user_and_restaurant():
    """Retourne (user, restaurant) pour l'utilisateur JWT courant.

    Si l'utilisateur n'a pas de restaurant_id (comptes historiques),
    retombe sur le premier restaurant actif.
    Retourne (None, None) si l'utilisateur est introuvable.
    """
    user = User.query.get(int(get_jwt_identity()))
    if not user:
        return None, None
    if user.restaurant_id:
        restaurant = Restaurant.query.get(user.restaurant_id)
    else:
        restaurant = get_default_restaurant()
    return user, restaurant


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
