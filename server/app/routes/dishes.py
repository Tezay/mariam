import csv
import io

from flask import Response, url_for
from flask_jwt_extended import jwt_required
from flask_smorest import Blueprint
from sqlalchemy.orm import selectinload

from ..extensions import db
from ..models import (
    MIN_SITE_VOTES,
    AuditLog,
    DishCatalog,
    Menu,
    MenuCategory,
    MenuItem,
    MenuVote,
    Restaurant,
    menu_vote_dishes,
)
from ..models.taxonomy import Certification, DietaryTag
from ..pagination import paginate
from ..problems import Problem
from ..schemas.common import FileUploadSchema
from ..schemas.dishes import (
    DishBatchDeleteResultSchema,
    DishBatchUpdateResultSchema,
    DishBatchUpdateSchema,
    DishCompareQuerySchema,
    DishExportQuerySchema,
    DishIdsSchema,
    DishInputSchema,
    DishListSchema,
    DishPatchSchema,
    DishQuerySchema,
    DishSchema,
    DishStatsListSchema,
    DishStatsQuerySchema,
    DishStatsSchema,
)
from ..security import limiter
from ..services import catalog_csv, text_match
from ..services.dish_stats import MAX_BATCH, dish_stats, first_served, period_cutoff
from ..services.storage import storage
from ..utils.time import paris_today
from .helpers import audit, editor_required, normalize_dish_name, store_image
from .scope import member_site

dishes_bp = Blueprint('dishes', __name__, description="A site's catalog of dishes")


def _csv(raw: str | None) -> list[str]:
    return [value.strip() for value in (raw or '').split(',') if value.strip()]


def _csv_ids(raw: str | None) -> list[int]:
    return [int(value) for value in _csv(raw) if value.isdigit()]


def _usage_over(dish_ids: list[int], cutoff) -> dict[int, int]:
    if not dish_ids:
        return {}
    query = (
        db.session.query(MenuItem.dish_id, db.func.count(MenuItem.id))
        .join(Menu, Menu.id == MenuItem.menu_id)
        .filter(MenuItem.dish_id.in_(dish_ids))
    )
    if cutoff:
        query = query.filter(Menu.date >= cutoff)
    return {dish_id: int(count) for dish_id, count in query.group_by(MenuItem.dish_id).all()}


def _votes_over(dish_ids: list[int], cutoff) -> dict[int, dict]:
    if not dish_ids:
        return {}
    query = (
        db.session.query(
            menu_vote_dishes.c.dish_id,
            db.func.count(MenuVote.id),
            db.func.avg(MenuVote.rating),
        )
        .join(MenuVote, MenuVote.id == menu_vote_dishes.c.vote_id)
        .filter(menu_vote_dishes.c.dish_id.in_(dish_ids))
    )
    if cutoff:
        query = query.filter(MenuVote.date >= cutoff)
    return {
        dish_id: {
            'votes': int(count),
            'score': round(float(average), 2) if int(count) >= MIN_SITE_VOTES else None,
        }
        for dish_id, count, average in query.group_by(menu_vote_dishes.c.dish_id).all()
    }


def _views(dishes: list, cutoff=None) -> list[dict]:
    ids = [dish.id for dish in dishes]
    usage, votes = _usage_over(ids, cutoff), _votes_over(ids, cutoff)
    return [
        {
            **dish.to_dict(usage_count=usage.get(dish.id, 0)),
            **votes.get(dish.id, {'votes': 0, 'score': None}),
            'created_at': dish.created_at,
        }
        for dish in dishes
    ]


def _site_dish(restaurant: Restaurant, dish_id: int):
    dish = DishCatalog.query.filter_by(id=dish_id, restaurant_id=restaurant.id).first()
    if dish is None:
        raise Problem(404, 'dish_not_found', 'Plat introuvable.')
    return dish


def _site_dishes(restaurant: Restaurant, ids: list[int]) -> list:
    return DishCatalog.query.filter(
        DishCatalog.id.in_(ids), DishCatalog.restaurant_id == restaurant.id
    ).all()


def _leaf_category(category_id: int, restaurant: Restaurant) -> MenuCategory:
    """The category a dish may hang from: it must exist here and carry no children."""
    category = MenuCategory.query.filter_by(id=category_id, restaurant_id=restaurant.id).first()
    if category is None or not category.is_leaf:
        raise Problem(
            422, 'category_invalid', 'Catégorie inconnue, ou qui porte des sous-catégories.'
        )
    return category


def _duplicate_dish(
    restaurant: Restaurant, category_id: int | None, name: str, exclude_id: int | None = None
) -> DishCatalog | None:
    """The dish already carrying this name in this category, if any.

    Same rule as `get_or_create_dish`, which reuses such a dish rather than
    adding a second one on import.
    """
    if category_id is None:
        return None
    query = DishCatalog.query.filter(
        DishCatalog.restaurant_id == restaurant.id,
        DishCatalog.category_id == category_id,
        db.func.lower(DishCatalog.name) == name.lower(),
    )
    if exclude_id is not None:
        query = query.filter(DishCatalog.id != exclude_id)
    return query.first()


def _refuse_duplicate(duplicate: DishCatalog | None) -> None:
    if duplicate is not None:
        raise Problem(
            409, 'dish_duplicate', 'Un plat de ce nom existe déjà dans cette catégorie.',
            dish_id=duplicate.id, dish_name=duplicate.name,
        )


def _labels(tag_ids: list[str], certification_ids: list[str]) -> tuple[list, list]:
    return (
        DietaryTag.query.filter(DietaryTag.id.in_(tag_ids)).all() if tag_ids else [],
        Certification.query.filter(Certification.id.in_(certification_ids)).all()
        if certification_ids else [],
    )


def _filtered_dishes(restaurant: Restaurant, query: dict) -> list:
    """Dishes matching the filters, name-ordered.

    Shared with the export so a CSV carries exactly what the list shows.
    """
    dishes = DishCatalog.query.filter_by(restaurant_id=restaurant.id).options(
        selectinload(DishCatalog.tags),  # type: ignore[arg-type]
        selectinload(DishCatalog.certifications),  # type: ignore[arg-type]
    )
    # A dish belongs to one category, so several of them read as a union.
    category_ids = _csv_ids(query.get('category_ids'))
    if category_ids:
        dishes = dishes.filter(DishCatalog.category_id.in_(category_ids))
    # Conjunctive: a dish must carry every requested label, not any of them.
    for tag_id in _csv(query.get('tag_ids')):
        dishes = dishes.filter(DishCatalog.tags.any(DietaryTag.id == tag_id))
    for cert_id in _csv(query.get('certification_ids')):
        dishes = dishes.filter(DishCatalog.certifications.any(Certification.id == cert_id))
    found = dishes.order_by(DishCatalog.name.asc()).all()

    # A novelty only means something inside a bounded period.
    cutoff = period_cutoff(query['period'])
    if query['new_only'] and cutoff:
        newcomers = first_served([restaurant.id], cutoff, paris_today())
        found = [dish for dish in found if dish.id in newcomers]
    words = (query.get('q') or '').strip()
    if words:
        found = [dish for dish in found if text_match.matches(dish.name, words)]
    return found


@dishes_bp.route('', methods=['GET'])
@jwt_required()
@dishes_bp.arguments(DishQuerySchema, location='query')
@dishes_bp.response(200, DishListSchema)
def list_dishes(query, org: str, site: str):
    """The catalog, one page at a time; the `Link` header gives the others."""
    restaurant = member_site(org, site)
    dishes = _filtered_dishes(restaurant, query)
    sort = query['sort']
    ascending = query.get('order', 'asc' if sort == 'name' else 'desc') == 'asc'
    if sort == 'name':
        dishes.sort(key=lambda dish: dish.name.lower(), reverse=not ascending)
    elif sort == 'recent':
        dishes.sort(key=lambda dish: dish.created_at, reverse=not ascending)

    views = _views(dishes, period_cutoff(query['period']))
    if sort == 'usage':
        views.sort(key=lambda view: view['usage_count'], reverse=not ascending)
    elif sort == 'score':
        # Unrated dishes go last whichever way the sort points: a missing score
        # is not a bad one.
        views.sort(key=lambda view: (
            view['score'] is None, (view['score'] or 0) * (1 if ascending else -1)
        ))
    return paginate(views, query['page'], query['per_page'])


@dishes_bp.route('', methods=['POST'])
@editor_required
@dishes_bp.arguments(DishInputSchema)
@dishes_bp.response(201, DishSchema)
def create_dish(body, org: str, site: str):
    """Add a dish to the catalog."""
    restaurant = member_site(org, site)
    name = normalize_dish_name(body['name'])
    category = _leaf_category(body['category_id'], restaurant)
    _refuse_duplicate(_duplicate_dish(restaurant, category.id, name))

    tags, certifications = _labels(body['tag_ids'], body['certification_ids'])
    dish = DishCatalog(
        restaurant_id=restaurant.id,
        category_id=category.id,
        name=name,
        tags=tags,
        certifications=certifications,
    )
    db.session.add(dish)
    db.session.flush()
    audit(
        AuditLog.ACTION_DISH_CREATE, restaurant,
        target_type='dish', target_id=dish.id, details={'name': dish.name},
    )
    db.session.commit()
    location = url_for('dishes.get_dish', org=org, site=site, dish_id=dish.id)
    return _views([dish])[0], 201, {'Location': location}


@dishes_bp.route('/<int:dish_id>', methods=['GET'])
@jwt_required()
@dishes_bp.response(200, DishSchema)
def get_dish(org: str, site: str, dish_id: int):
    """One dish, with its use and votes of all time."""
    return _views([_site_dish(member_site(org, site), dish_id)])[0]


@dishes_bp.route('/<int:dish_id>', methods=['PATCH'])
@editor_required
@dishes_bp.arguments(DishPatchSchema)
@dishes_bp.response(200, DishSchema)
def patch_dish(body, org: str, site: str, dish_id: int):
    """Change a dish's name, category or labels."""
    restaurant = member_site(org, site)
    dish = _site_dish(restaurant, dish_id)
    name = normalize_dish_name(body['name']) if 'name' in body else dish.name
    category_id = dish.category_id
    if 'category_id' in body:
        category_id = _leaf_category(body['category_id'], restaurant).id
    _refuse_duplicate(_duplicate_dish(restaurant, category_id, name, exclude_id=dish.id))

    dish.name, dish.category_id = name, category_id
    tags, certifications = _labels(body.get('tag_ids', []), body.get('certification_ids', []))
    if 'tag_ids' in body:
        dish.tags = tags
    if 'certification_ids' in body:
        dish.certifications = certifications
    audit(
        AuditLog.ACTION_DISH_UPDATE, restaurant,
        target_type='dish', target_id=dish.id, details={'name': dish.name},
    )
    db.session.commit()
    return _views([dish])[0]


@dishes_bp.route('/<int:dish_id>', methods=['DELETE'])
@editor_required
@dishes_bp.response(204)
def delete_dish(org: str, site: str, dish_id: int):
    """Delete a dish that no menu has served."""
    restaurant = member_site(org, site)
    dish = _site_dish(restaurant, dish_id)
    usage = _usage_over([dish.id], None).get(dish.id, 0)
    if usage:
        raise Problem(
            409, 'dish_in_use',
            f'Ce plat est utilisé dans {usage} menu(s) et ne peut pas être supprimé.',
        )
    if dish.storage_key:
        storage.delete_file(dish.storage_key)
    audit(
        AuditLog.ACTION_DISH_DELETE, restaurant,
        target_type='dish', target_id=dish.id, details={'name': dish.name},
    )
    db.session.delete(dish)
    db.session.commit()


@dishes_bp.route('/stats', methods=['GET'])
@jwt_required()
@dishes_bp.arguments(DishCompareQuerySchema, location='query')
@dishes_bp.response(200, DishStatsListSchema)
def compare_dishes(query, org: str, site: str):
    """The statistics of a few dishes in one request, to compare them."""
    restaurant = member_site(org, site)
    owned = [dish.id for dish in _site_dishes(restaurant, _csv_ids(query['ids'])[:MAX_BATCH])]
    stats = dish_stats(restaurant, owned, query['period'])
    return {'items': [{'dish_id': dish_id, **value} for dish_id, value in stats.items()]}


@dishes_bp.route('/<int:dish_id>/stats', methods=['GET'])
@jwt_required()
@dishes_bp.arguments(DishStatsQuerySchema, location='query')
@dishes_bp.response(200, DishStatsSchema)
def get_dish_stats(query, org: str, site: str, dish_id: int):
    """A dish's use by period, its weekly history and its votes."""
    restaurant = member_site(org, site)
    dish = _site_dish(restaurant, dish_id)
    return {'dish_id': dish.id, **dish_stats(restaurant, [dish.id], query['period'])[dish.id]}


@dishes_bp.route('/batch-delete', methods=['POST'])
@editor_required
@dishes_bp.arguments(DishIdsSchema)
@dishes_bp.response(200, DishBatchDeleteResultSchema)
def batch_delete_dishes(body, org: str, site: str):
    """Delete the given dishes, keeping those a menu has served."""
    restaurant = member_site(org, site)
    dishes = _site_dishes(restaurant, body['ids'])
    served = _usage_over([dish.id for dish in dishes], None)
    deleted, kept = [], []
    for dish in dishes:
        if served.get(dish.id):
            kept.append({'id': dish.id, 'name': dish.name, 'usage_count': served[dish.id]})
            continue
        if dish.storage_key:
            storage.delete_file(dish.storage_key)
        audit(
            AuditLog.ACTION_DISH_DELETE, restaurant,
            target_type='dish', target_id=dish.id, details={'name': dish.name},
        )
        db.session.delete(dish)
        deleted.append(dish.id)
    db.session.commit()
    return {'deleted': deleted, 'kept': kept}


@dishes_bp.route('/batch-update', methods=['POST'])
@editor_required
@dishes_bp.arguments(DishBatchUpdateSchema)
@dishes_bp.response(200, DishBatchUpdateResultSchema)
def batch_update_dishes(body, org: str, site: str):
    """Move the given dishes to one category, add or remove labels on them.

    A dish whose name the target category already has is left as it was.
    """
    restaurant = member_site(org, site)
    category_id = None
    if 'category_id' in body:
        category_id = _leaf_category(body['category_id'], restaurant).id
    add_tags, add_certs = _labels(body['add_tag_ids'], body['add_certification_ids'])
    drop_tags, drop_certs = set(body['remove_tag_ids']), set(body['remove_certification_ids'])

    updated, kept = [], []
    for dish in _site_dishes(restaurant, body['ids']):
        if category_id is not None:
            if _duplicate_dish(restaurant, category_id, dish.name, exclude_id=dish.id):
                kept.append({'id': dish.id, 'name': dish.name})
                continue
            dish.category_id = category_id
        dish.tags = [tag for tag in dish.tags if tag.id not in drop_tags] + [
            tag for tag in add_tags if tag not in dish.tags
        ]
        dish.certifications = [
            cert for cert in dish.certifications if cert.id not in drop_certs
        ] + [cert for cert in add_certs if cert not in dish.certifications]
        updated.append(dish.id)

    audit(
        AuditLog.ACTION_DISH_UPDATE, restaurant,
        target_type='dish', details={'batch_update': True, 'count': len(updated)},
    )
    db.session.commit()
    return {'updated': updated, 'kept': kept}


@dishes_bp.route('/export', methods=['GET'])
@jwt_required()
@dishes_bp.arguments(DishExportQuerySchema, location='query')
@dishes_bp.response(
    200, {'type': 'string'}, content_type='text/csv', description='Semicolon-separated, UTF-8'
)
def export_dishes(query, org: str, site: str):
    """The given dishes, or those the filters select, as a CSV file."""
    restaurant = member_site(org, site)
    ids = _csv_ids(query.get('ids'))
    if ids:
        dishes = sorted(_site_dishes(restaurant, ids), key=lambda dish: dish.name)
    else:
        dishes = _filtered_dishes(restaurant, query)

    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=';')
    writer.writerow(catalog_csv.COLUMNS)
    writer.writerows(catalog_csv.serialize(dishes, catalog_csv.category_paths(restaurant.id)))
    return Response(
        # Excel opens a semicolon CSV as text unless the BOM marks it as UTF-8.
        '﻿' + buffer.getvalue(),
        mimetype='text/csv; charset=utf-8',
        headers={'Content-Disposition': 'attachment; filename=catalogue.csv'},
    )


@dishes_bp.route('/<int:dish_id>/image', methods=['PUT'])
@limiter.limit('30 per minute')
@editor_required
@dishes_bp.arguments(FileUploadSchema, location='files')
@dishes_bp.response(200, DishSchema)
def put_dish_image(files, org: str, site: str, dish_id: int):
    """Set or replace a dish's photo: JPEG, PNG, WebP or HEIC, stored as JPEG."""
    restaurant = member_site(org, site)
    dish = _site_dish(restaurant, dish_id)
    stored, filename = store_image(files['file'], 'catalog')
    if dish.storage_key:
        storage.delete_file(dish.storage_key)
    dish.storage_key, dish.image_url = stored['key'], stored['url']
    audit(
        AuditLog.ACTION_DISH_IMAGE_UPLOAD, restaurant,
        target_type='dish', target_id=dish.id, details={'name': dish.name, 'filename': filename},
    )
    db.session.commit()
    return _views([dish])[0]


@dishes_bp.route('/<int:dish_id>/image', methods=['DELETE'])
@editor_required
@dishes_bp.response(204)
def delete_dish_image(org: str, site: str, dish_id: int):
    """Remove a dish's photo."""
    restaurant = member_site(org, site)
    dish = _site_dish(restaurant, dish_id)
    if dish.storage_key:
        storage.delete_file(dish.storage_key)
        dish.storage_key = dish.image_url = None
        audit(
            AuditLog.ACTION_DISH_IMAGE_DELETE, restaurant,
            target_type='dish', target_id=dish.id, details={'name': dish.name},
        )
        db.session.commit()
