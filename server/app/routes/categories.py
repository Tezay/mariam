from flask_jwt_extended import jwt_required
from flask_smorest import Blueprint

from ..extensions import db
from ..models import DishCatalog, Restaurant
from ..models.category import MenuCategory
from ..problems import Problem
from ..schemas.categories import (
    CategoryOrderSchema,
    MenuCategoryInputSchema,
    MenuCategoryListSchema,
    MenuCategoryPatchSchema,
    MenuCategorySchema,
)
from .helpers import audit, site_admin_required
from .scope import member_site

categories_bp = Blueprint(
    'categories', __name__,
    description="A site's menu categories, one level of subcategories at most",
)


def category_tree(restaurant: Restaurant) -> dict:
    top_level = MenuCategory.query.filter_by(
        restaurant_id=restaurant.id, parent_id=None
    ).order_by(MenuCategory.order)
    return {'items': [category.to_dict() for category in top_level]}


def _site_category(restaurant: Restaurant, category_id: int):
    category = MenuCategory.query.filter_by(id=category_id, restaurant_id=restaurant.id).first()
    if category is None:
        raise Problem(404, 'category_not_found', 'Catégorie introuvable.')
    return category


def _has_dishes(category_ids: list[int]) -> Problem | None:
    count = DishCatalog.query.filter(DishCatalog.category_id.in_(category_ids)).count()
    if not count:
        return None
    return Problem(
        409, 'category_has_dishes', 'Des plats sont rattachés à cette catégorie.', dish_count=count
    )


@categories_bp.route('', methods=['GET'])
@jwt_required()
@categories_bp.response(200, MenuCategoryListSchema)
def list_categories(org: str, site: str):
    """The site's categories in order, each with its subcategories."""
    return category_tree(member_site(org, site))


@categories_bp.route('', methods=['POST'])
@site_admin_required
@categories_bp.arguments(MenuCategoryInputSchema)
@categories_bp.response(201, MenuCategorySchema)
def create_category(body, org: str, site: str):
    """Add a category, or a subcategory under a top-level one.

    A category with subcategories carries no dish: the parent's dishes move into
    the new subcategory with `move_dishes`, and are refused otherwise.
    """
    restaurant = member_site(org, site)
    label = body['label'].strip()
    if not label:
        raise Problem(422, 'label_invalid', 'Le nom est requis.')
    parent_id = body['parent_id']
    if parent_id is not None:
        parent = MenuCategory.query.filter_by(id=parent_id, restaurant_id=restaurant.id).first()
        if parent is None or parent.parent_id is not None:
            raise Problem(
                422, 'category_invalid', 'Le parent doit être une catégorie de premier niveau du site.'
            )
        if not body['move_dishes'] and (refusal := _has_dishes([parent.id])):
            raise refusal

    siblings = MenuCategory.query.filter_by(restaurant_id=restaurant.id, parent_id=parent_id)
    category = MenuCategory(
        restaurant_id=restaurant.id,
        parent_id=parent_id,
        label=label,
        order=body.get('order', siblings.count()),
        color_key=MenuCategory.next_color_key(restaurant.id),
    )
    db.session.add(category)
    db.session.flush()
    if parent_id is not None and body['move_dishes']:
        DishCatalog.query.filter_by(category_id=parent_id).update(
            {'category_id': category.id}, synchronize_session=False
        )
    audit(
        'category_create', restaurant,
        target_type='menu_category', target_id=category.id,
        details={'label': label, 'parent_id': parent_id},
    )
    db.session.commit()
    return category.to_dict()


@categories_bp.route('/order', methods=['PUT'])
@site_admin_required
@categories_bp.arguments(CategoryOrderSchema)
@categories_bp.response(200, MenuCategoryListSchema)
def order_categories(body, org: str, site: str):
    """Put the categories of one level, top-level or under one parent, in a new order."""
    restaurant = member_site(org, site)
    wanted = body['category_ids']
    found = MenuCategory.query.filter(
        MenuCategory.restaurant_id == restaurant.id, MenuCategory.id.in_(wanted)
    ).all()
    parents = {category.parent_id for category in found}
    siblings = []
    if len(parents) == 1:
        siblings = MenuCategory.query.filter_by(
            restaurant_id=restaurant.id, parent_id=parents.pop()
        ).all()
    if sorted(wanted) != sorted(category.id for category in siblings):
        raise Problem(
            422, 'category_order_invalid',
            'La liste doit reprendre chaque catégorie d’un même niveau, une fois.',
        )
    by_id = {category.id: category for category in siblings}
    for order, category_id in enumerate(wanted):
        by_id[category_id].order = order
    db.session.commit()
    return category_tree(restaurant)


@categories_bp.route('/<int:category_id>', methods=['PATCH'])
@site_admin_required
@categories_bp.arguments(MenuCategoryPatchSchema)
@categories_bp.response(200, MenuCategorySchema)
def patch_category(body, org: str, site: str, category_id: int):
    """Rename a category, highlight it or change its colour."""
    restaurant = member_site(org, site)
    category = _site_category(restaurant, category_id)
    if 'label' in body:
        label = body['label'].strip()
        if not label:
            raise Problem(422, 'label_invalid', 'Le nom est requis.')
        category.label = label
    for field in ('is_highlighted', 'color_key'):
        if field in body:
            setattr(category, field, body[field])
    audit(
        'category_update', restaurant,
        target_type='menu_category', target_id=category.id,
        details={'updated_fields': sorted(body)},
    )
    db.session.commit()
    return category.to_dict()


@categories_bp.route('/<int:category_id>', methods=['DELETE'])
@site_admin_required
@categories_bp.response(204)
def delete_category(org: str, site: str, category_id: int):
    """Delete a category and its subcategories, once no dish is left in them."""
    restaurant = member_site(org, site)
    category = _site_category(restaurant, category_id)
    if category.is_protected:
        raise Problem(409, 'category_protected', 'Cette catégorie ne peut pas être supprimée.')
    # A dish may not end up without a category, so the whole subtree has to be empty.
    if refusal := _has_dishes([category.id, *(child.id for child in category.subcategories)]):
        raise refusal
    audit(
        'category_delete', restaurant,
        target_type='menu_category', target_id=category.id, details={'label': category.label},
    )
    db.session.delete(category)
    db.session.commit()
