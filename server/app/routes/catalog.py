"""
Catalog routes for MARIAM — CRUD pour le catalogue de plats par restaurant.

Endpoints en lecture (JWT required) :
- GET    /v1/catalog              Lister les plats (filtres: category_ids, q, sort)
- GET    /v1/catalog/<id>         Détail d'un plat
- GET    /v1/catalog/<id>/stats   Utilisation et satisfaction du plat
- GET    /v1/catalog/stats?ids=   Les mêmes, pour plusieurs plats (comparaison)

Endpoints en écriture (editor ou admin) :
- POST   /v1/catalog              Créer un plat
- PUT    /v1/catalog/<id>         Mettre à jour un plat
- DELETE /v1/catalog/<id>         Supprimer un plat
- POST   /v1/catalog/<id>/image   Uploader l'image du plat
- DELETE /v1/catalog/<id>/image   Supprimer l'image du plat
"""
import csv
import io
import re

from flask import Response, jsonify, request
from flask_jwt_extended import jwt_required
from flask_smorest import Blueprint
from marshmallow import ValidationError
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
    menu_vote_dishes,
)
from ..models.taxonomy import Certification, DietaryTag
from ..schemas.catalog import (
    DishCatalogCreateSchema,
    DishCatalogUpdateSchema,
)
from ..security import get_client_ip, limiter
from ..services import catalog_csv, text_match
from ..services.dish_stats import MAX_BATCH, dish_stats, first_served, period_cutoff
from ..services.storage import storage
from ..utils.time import paris_today
from .helpers import editor_required, get_user_and_restaurant

catalog_bp = Blueprint(
    'catalog', __name__,
    description='Dish catalog — CRUD per restaurant'
)


# ============================================================
# HELPERS
# ============================================================

def _usage_count_subquery(dish_id: int) -> int:
    """Calcule le nombre d'utilisations d'un plat dans les menus."""
    return db.session.query(db.func.count(MenuItem.id)).filter(
        MenuItem.dish_id == dish_id
    ).scalar() or 0


def _build_dish_dict(dish: DishCatalog) -> dict:
    usage = _usage_count_subquery(dish.id)
    return dish.to_dict(usage_count=usage)


def _csv(raw: str | None) -> list[str]:
    return [value.strip() for value in (raw or '').split(',') if value.strip()]


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


def _leaf_category(category_id: int, restaurant_id: int) -> 'MenuCategory | None':
    """The category a dish may hang from: it must exist here and carry no children."""
    category = MenuCategory.query.filter_by(id=category_id, restaurant_id=restaurant_id).first()
    return category if category and category.is_leaf else None


def _duplicate_dish(
    restaurant_id: int, category_id: int | None, name: str, exclude_id: int | None = None
) -> 'DishCatalog | None':
    """The dish already carrying this name in this category, if any.

    Same rule as `get_or_create_dish`, which reuses such a dish rather than
    adding a second one on import.
    """
    if category_id is None:
        return None
    query = DishCatalog.query.filter(
        DishCatalog.restaurant_id == restaurant_id,
        DishCatalog.category_id == category_id,
        db.func.lower(DishCatalog.name) == name.lower(),
    )
    if exclude_id is not None:
        query = query.filter(DishCatalog.id != exclude_id)
    return query.first()


def _duplicate_response(duplicate: 'DishCatalog'):
    return jsonify({
        'error': 'Un plat de ce nom existe déjà dans cette catégorie',
        'dish_id': duplicate.id,
        'dish_name': duplicate.name,
    }), 409


def _capitalize_name(name: str) -> str:
    """Première lettre en majuscule, trim des espaces superflus."""
    cleaned = re.sub(r'\s+', ' ', name.strip())
    return cleaned[0].upper() + cleaned[1:] if cleaned else cleaned


# ============================================================
# ROUTES — CATALOGUE
# ============================================================

def _filtered_dishes(restaurant_id: int) -> list:
    """Dishes matching the filters of the current request, name-ordered.

    Shared with the export so a CSV carries exactly what the list shows.
    """
    query = DishCatalog.query.filter_by(restaurant_id=restaurant_id).options(
        selectinload(DishCatalog.tags),  # type: ignore[arg-type]
        selectinload(DishCatalog.certifications),  # type: ignore[arg-type]
    )

    # A dish belongs to one category, so several of them read as a union.
    category_ids = [int(value) for value in _csv(request.args.get('category_ids'))
                    if value.isdigit()]
    if category_ids:
        query = query.filter(DishCatalog.category_id.in_(category_ids))

    # Conjunctive: a dish must carry every requested label, not any of them.
    for tag_id in _csv(request.args.get('tag_ids')):
        query = query.filter(DishCatalog.tags.any(DietaryTag.id == tag_id))
    for cert_id in _csv(request.args.get('certification_ids')):
        query = query.filter(DishCatalog.certifications.any(Certification.id == cert_id))

    dishes = query.order_by(DishCatalog.name.asc()).all()

    # A novelty only means something inside a bounded period.
    if request.args.get('new_only') == '1':
        cutoff = period_cutoff(request.args.get('period'))
        if cutoff:
            newcomers = first_served([restaurant_id], cutoff, paris_today())
            dishes = [dish for dish in dishes if dish.id in newcomers]

    q = request.args.get('q', '').strip()
    if q:
        dishes = [dish for dish in dishes if text_match.matches(dish.name, q)]
    return dishes


@catalog_bp.route('', methods=['GET'])
@jwt_required()
def list_dishes():
    """Liste les plats du catalogue pour le restaurant de l'utilisateur.

    Query params:
        category_ids (csv) — filtrer par catégories (disjonctif)
        tag_ids / certification_ids (csv) — conjonctifs
        q (str) — recherche par nom
        period (str) — 'all' (défaut) | '7d' | '30d' | '90d' | '12m'
        sort (str) — 'usage' (défaut) | 'name' | 'recent' | 'score'
        order (str) — 'desc' (défaut) | 'asc'
    """
    _, restaurant = get_user_and_restaurant()
    if not restaurant:
        return jsonify({'error': 'Restaurant non trouvé'}), 404

    dishes = _filtered_dishes(restaurant.id)

    sort = request.args.get('sort', 'usage')
    # A name reads A to Z by default; a measure reads best-first.
    ascending = request.args.get('order', 'asc' if sort == 'name' else 'desc') == 'asc'
    if sort == 'name':
        dishes.sort(key=lambda d: d.name.lower(), reverse=not ascending)
    elif sort == 'recent':
        dishes.sort(key=lambda d: d.created_at, reverse=not ascending)

    dish_ids = [d.id for d in dishes]
    cutoff = period_cutoff(request.args.get('period'))
    usage_map = _usage_over(dish_ids, cutoff)
    vote_map = _votes_over(dish_ids, cutoff)

    if sort == 'usage':
        dishes.sort(key=lambda d: usage_map.get(d.id, 0), reverse=not ascending)
    elif sort == 'score':
        # Unrated dishes go last whichever way the sort points: a missing score
        # is not a bad one.
        dishes.sort(
            key=lambda d: (
                vote_map.get(d.id, {}).get('score') is None,
                (vote_map.get(d.id, {}).get('score') or 0) * (1 if ascending else -1),
            )
        )

    serialized = [
        {
            **d.to_dict(usage_count=usage_map.get(d.id, 0)),
            **vote_map.get(d.id, {'votes': 0, 'score': None}),
        }
        for d in dishes
    ]

    page = request.args.get('page', type=int)
    if page is not None:
        per_page = min(request.args.get('per_page', 24, type=int), 200)
        total = len(serialized)
        offset = (page - 1) * per_page
        return jsonify({
            'dishes': serialized[offset:offset + per_page],
            'total': total,
            'page': page,
            'per_page': per_page,
            'has_more': offset + per_page < total,
        }), 200

    return jsonify({'dishes': serialized}), 200


@catalog_bp.route('', methods=['POST'])
@editor_required
def create_dish():
    """Crée un nouveau plat dans le catalogue."""
    user, restaurant = get_user_and_restaurant()
    if not restaurant:
        return jsonify({'error': 'Restaurant non trouvé'}), 404

    data = request.get_json(silent=True) or {}
    try:
        validated = DishCatalogCreateSchema().load(data)
    except ValidationError as err:
        return jsonify({'error': 'Données invalides', 'details': err.messages}), 400

    name = _capitalize_name(validated['name'])

    if not _leaf_category(validated['category_id'], restaurant.id):
        return jsonify({'error': 'Catégorie invalide ou porteuse de sous-catégories'}), 400

    duplicate = _duplicate_dish(restaurant.id, validated['category_id'], name)
    if duplicate:
        return _duplicate_response(duplicate)

    dish = DishCatalog(
        restaurant_id=restaurant.id,
        category_id=validated['category_id'],
        name=name,
    )

    # Attacher les tags
    tag_ids = validated.get('tag_ids', [])
    if tag_ids:
        tags = DietaryTag.query.filter(DietaryTag.id.in_(tag_ids)).all()
        dish.tags = tags

    # Attacher les certifications
    cert_ids = validated.get('certification_ids', [])
    if cert_ids:
        certs = Certification.query.filter(Certification.id.in_(cert_ids)).all()
        dish.certifications = certs

    db.session.add(dish)
    db.session.flush()

    AuditLog.log(
        action=AuditLog.ACTION_DISH_CREATE,
        user_id=user.id,
        target_type='dish',
        target_id=dish.id,
        details={'name': dish.name},
        ip_address=get_client_ip(),
    )

    db.session.commit()

    return jsonify({'dish': dish.to_dict(usage_count=0)}), 201


@catalog_bp.route('/<int:dish_id>', methods=['GET'])
@jwt_required()
def get_dish(dish_id):
    """Retourne le détail d'un plat."""
    _, restaurant = get_user_and_restaurant()
    if not restaurant:
        return jsonify({'error': 'Restaurant non trouvé'}), 404

    dish = DishCatalog.query.filter_by(id=dish_id, restaurant_id=restaurant.id).first()
    if not dish:
        return jsonify({'error': 'Plat non trouvé'}), 404

    return jsonify({'dish': _build_dish_dict(dish)}), 200


@catalog_bp.route('/stats', methods=['GET'])
@jwt_required()
def get_dishes_stats():
    """Statistiques de plusieurs plats en une requête, pour la comparaison."""
    _, restaurant = get_user_and_restaurant()
    if not restaurant:
        return jsonify({'error': 'Restaurant non trouvé'}), 404

    try:
        wanted = [int(value) for value in request.args.get('ids', '').split(',') if value.strip()]
    except ValueError:
        return jsonify({'error': 'Identifiants invalides'}), 400

    owned = [
        row[0]
        for row in db.session.query(DishCatalog.id)
        .filter(
            DishCatalog.id.in_(wanted[:MAX_BATCH]),
            DishCatalog.restaurant_id == restaurant.id,
        )
        .all()
    ]
    stats = dish_stats(restaurant, owned, request.args.get('period'))
    return jsonify({'stats': {str(dish_id): value for dish_id, value in stats.items()}}), 200


@catalog_bp.route('/<int:dish_id>/stats', methods=['GET'])
@jwt_required()
def get_dish_stats(dish_id):
    """Fenêtres d'utilisation, historique hebdomadaire et satisfaction d'un plat."""
    _, restaurant = get_user_and_restaurant()
    if not restaurant:
        return jsonify({'error': 'Restaurant non trouvé'}), 404

    dish = DishCatalog.query.filter_by(id=dish_id, restaurant_id=restaurant.id).first()
    if not dish:
        return jsonify({'error': 'Plat non trouvé'}), 404

    return jsonify(dish_stats(restaurant, [dish_id], request.args.get('period'))[dish_id]), 200


@catalog_bp.route('/<int:dish_id>', methods=['PUT'])
@editor_required
def update_dish(dish_id):
    """Met à jour un plat du catalogue."""
    user, restaurant = get_user_and_restaurant()
    if not restaurant:
        return jsonify({'error': 'Restaurant non trouvé'}), 404

    dish = DishCatalog.query.filter_by(id=dish_id, restaurant_id=restaurant.id).first()
    if not dish:
        return jsonify({'error': 'Plat non trouvé'}), 404

    data = request.get_json(silent=True) or {}
    try:
        validated = DishCatalogUpdateSchema().load(data)
    except ValidationError as err:
        return jsonify({'error': 'Données invalides', 'details': err.messages}), 400

    name = _capitalize_name(validated['name']) if 'name' in validated else dish.name
    category_id = validated.get('category_id', dish.category_id)
    if 'category_id' in validated and not _leaf_category(category_id, restaurant.id):
        return jsonify({'error': 'Catégorie invalide ou porteuse de sous-catégories'}), 400

    duplicate = _duplicate_dish(restaurant.id, category_id, name, exclude_id=dish.id)
    if duplicate:
        return _duplicate_response(duplicate)

    dish.name = name
    dish.category_id = category_id
    if 'tag_ids' in validated:
        tags = DietaryTag.query.filter(DietaryTag.id.in_(validated['tag_ids'])).all()
        dish.tags = tags
    if 'certification_ids' in validated:
        certs = Certification.query.filter(Certification.id.in_(validated['certification_ids'])).all()
        dish.certifications = certs

    AuditLog.log(
        action=AuditLog.ACTION_DISH_UPDATE,
        user_id=user.id,
        target_type='dish',
        target_id=dish.id,
        details={'name': dish.name},
        ip_address=get_client_ip(),
    )

    db.session.commit()
    return jsonify({'dish': _build_dish_dict(dish)}), 200


@catalog_bp.route('/<int:dish_id>', methods=['DELETE'])
@editor_required
def delete_dish(dish_id):
    """Supprime un plat du catalogue.

    Refusé si le plat est utilisé dans un menu existant.
    """
    user, restaurant = get_user_and_restaurant()
    if not restaurant:
        return jsonify({'error': 'Restaurant non trouvé'}), 404

    dish = DishCatalog.query.filter_by(id=dish_id, restaurant_id=restaurant.id).first()
    if not dish:
        return jsonify({'error': 'Plat non trouvé'}), 404

    usage = _usage_count_subquery(dish_id)
    if usage > 0:
        return jsonify({
            'error': f'Ce plat est utilisé dans {usage} menu(s) et ne peut pas être supprimé.'
        }), 409

    # Supprimer l'image S3 si elle existe
    if dish.storage_key:
        storage.delete_file(dish.storage_key)

    AuditLog.log(
        action=AuditLog.ACTION_DISH_DELETE,
        user_id=user.id,
        target_type='dish',
        target_id=dish.id,
        details={'name': dish.name},
        ip_address=get_client_ip(),
    )

    db.session.delete(dish)
    db.session.commit()
    return jsonify({'message': 'Plat supprimé'}), 200


# ============================================================
# ROUTES — ACTIONS GROUPÉES
# ============================================================

def _owned_dishes(ids, restaurant_id: int) -> list:
    wanted = [value for value in ids if isinstance(value, int)]
    if not wanted:
        return []
    return DishCatalog.query.filter(
        DishCatalog.id.in_(wanted), DishCatalog.restaurant_id == restaurant_id
    ).all()


@catalog_bp.route('/bulk/delete', methods=['POST'])
@editor_required
def bulk_delete_dishes():
    """Supprime les plats fournis, en conservant ceux servis dans un menu."""
    user, restaurant = get_user_and_restaurant()
    if not restaurant:
        return jsonify({'error': 'Restaurant non trouvé'}), 404

    dishes = _owned_dishes((request.get_json(silent=True) or {}).get('ids', []), restaurant.id)
    served = _usage_over([dish.id for dish in dishes], None)

    deleted, kept = [], []
    for dish in dishes:
        if served.get(dish.id):
            kept.append({'id': dish.id, 'name': dish.name, 'usage_count': served[dish.id]})
            continue
        if dish.storage_key:
            storage.delete_file(dish.storage_key)
        AuditLog.log(
            action=AuditLog.ACTION_DISH_DELETE,
            user_id=user.id,
            target_type='dish',
            target_id=dish.id,
            details={'name': dish.name},
            ip_address=get_client_ip(),
        )
        db.session.delete(dish)
        deleted.append(dish.id)

    db.session.commit()
    return jsonify({'deleted': deleted, 'kept': kept}), 200


@catalog_bp.route('/bulk/category', methods=['POST'])
@editor_required
def bulk_move_dishes():
    """Rattache les plats fournis à une même catégorie feuille."""
    user, restaurant = get_user_and_restaurant()
    if not restaurant:
        return jsonify({'error': 'Restaurant non trouvé'}), 404

    payload = request.get_json(silent=True) or {}
    category_id = payload.get('category_id')
    if not isinstance(category_id, int) or not _leaf_category(category_id, restaurant.id):
        return jsonify({'error': 'Catégorie invalide ou porteuse de sous-catégories'}), 400

    moved, kept = [], []
    for dish in _owned_dishes(payload.get('ids', []), restaurant.id):
        # A name already taken in the target category would make two twins there
        if _duplicate_dish(restaurant.id, category_id, dish.name, exclude_id=dish.id):
            kept.append({'id': dish.id, 'name': dish.name})
            continue
        dish.category_id = category_id
        moved.append(dish.id)

    AuditLog.log(
        action=AuditLog.ACTION_DISH_UPDATE,
        user_id=user.id,
        target_type='dish',
        details={'bulk_category': category_id, 'count': len(moved)},
        ip_address=get_client_ip(),
    )
    db.session.commit()
    return jsonify({'moved': moved, 'kept': kept}), 200


@catalog_bp.route('/bulk/labels', methods=['POST'])
@editor_required
def bulk_label_dishes():
    """Ajoute ou retire des labels et certifications sur les plats fournis."""
    user, restaurant = get_user_and_restaurant()
    if not restaurant:
        return jsonify({'error': 'Restaurant non trouvé'}), 404

    payload = request.get_json(silent=True) or {}
    dishes = _owned_dishes(payload.get('ids', []), restaurant.id)

    add_tags = DietaryTag.query.filter(DietaryTag.id.in_(payload.get('add_tag_ids', []))).all()
    drop_tags = {tag.id for tag in
                 DietaryTag.query.filter(
                     DietaryTag.id.in_(payload.get('remove_tag_ids', []))).all()}
    add_certs = Certification.query.filter(
        Certification.id.in_(payload.get('add_certification_ids', []))).all()
    drop_certs = {cert.id for cert in
                  Certification.query.filter(
                      Certification.id.in_(payload.get('remove_certification_ids', []))).all()}

    for dish in dishes:
        dish.tags = [tag for tag in dish.tags if tag.id not in drop_tags] + [
            tag for tag in add_tags if tag not in dish.tags
        ]
        dish.certifications = [
            cert for cert in dish.certifications if cert.id not in drop_certs
        ] + [cert for cert in add_certs if cert not in dish.certifications]

    AuditLog.log(
        action=AuditLog.ACTION_DISH_UPDATE,
        user_id=user.id,
        target_type='dish',
        details={'bulk_labels': True, 'count': len(dishes)},
        ip_address=get_client_ip(),
    )
    db.session.commit()
    return jsonify({'updated': [dish.id for dish in dishes]}), 200


@catalog_bp.route('/export', methods=['GET'])
@jwt_required()
def export_dishes():
    """Exporte une sélection de plats, ou la vue filtrée courante, en CSV."""
    _, restaurant = get_user_and_restaurant()
    if not restaurant:
        return jsonify({'error': 'Restaurant non trouvé'}), 404

    requested = [int(value) for value in _csv(request.args.get('ids')) if value.isdigit()]
    if requested:
        dishes = (
            DishCatalog.query
            .filter(DishCatalog.restaurant_id == restaurant.id, DishCatalog.id.in_(requested))
            .order_by(DishCatalog.name.asc())
            .all()
        )
    else:
        dishes = _filtered_dishes(restaurant.id)

    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=';')
    writer.writerow(catalog_csv.COLUMNS)
    writer.writerows(catalog_csv.serialize(dishes, catalog_csv.category_paths(restaurant.id)))

    return Response(
        # Excel opens a semicolon CSV as text unless the BOM marks it as UTF-8.
        '\ufeff' + buffer.getvalue(),
        mimetype='text/csv; charset=utf-8',
        headers={'Content-Disposition': 'attachment; filename=catalogue.csv'},
    )


@catalog_bp.route('/<int:dish_id>/image', methods=['POST'])
@limiter.limit('30 per minute')
@editor_required
def upload_dish_image(dish_id):
    """Upload ou remplace l'image d'un plat (multipart/form-data, champ 'file')."""
    user, restaurant = get_user_and_restaurant()
    if not restaurant:
        return jsonify({'error': 'Restaurant non trouvé'}), 404

    dish = DishCatalog.query.filter_by(id=dish_id, restaurant_id=restaurant.id).first()
    if not dish:
        return jsonify({'error': 'Plat non trouvé'}), 404

    if not storage.is_configured:
        return jsonify({'error': 'Stockage non configuré'}), 503

    file = request.files.get('file')
    if not file or not file.filename:
        return jsonify({'error': 'Fichier manquant'}), 400

    is_valid, error_msg = storage.validate_image(file.filename)
    if not is_valid:
        return jsonify({'error': error_msg}), 400

    file_data = file.read()
    try:
        file_data, filename, content_type = storage.process_image(
            file_data, file.filename, file.content_type or 'application/octet-stream'
        )
    except ValueError as err:
        return jsonify({'error': str(err)}), 400

    result = storage.upload_file(file_data, filename, prefix='catalog', content_type=content_type)
    if not result:
        return jsonify({'error': "Erreur lors de l'upload"}), 500

    # Supprimer l'ancienne image S3
    if dish.storage_key:
        storage.delete_file(dish.storage_key)

    dish.storage_key = result['key']
    dish.image_url = result['url']

    AuditLog.log(
        action=AuditLog.ACTION_DISH_IMAGE_UPLOAD,
        user_id=user.id,
        target_type='dish',
        target_id=dish.id,
        details={'name': dish.name, 'filename': filename},
        ip_address=get_client_ip(),
    )

    db.session.commit()

    return jsonify({'dish': _build_dish_dict(dish)}), 200


@catalog_bp.route('/<int:dish_id>/image', methods=['DELETE'])
@editor_required
def delete_dish_image(dish_id):
    """Supprime l'image d'un plat."""
    user, restaurant = get_user_and_restaurant()
    if not restaurant:
        return jsonify({'error': 'Restaurant non trouvé'}), 404

    dish = DishCatalog.query.filter_by(id=dish_id, restaurant_id=restaurant.id).first()
    if not dish:
        return jsonify({'error': 'Plat non trouvé'}), 404

    if dish.storage_key:
        storage.delete_file(dish.storage_key)
        dish.storage_key = None
        dish.image_url = None

        AuditLog.log(
            action=AuditLog.ACTION_DISH_IMAGE_DELETE,
            user_id=user.id,
            target_type='dish',
            target_id=dish.id,
            details={'name': dish.name},
            ip_address=get_client_ip(),
        )

        db.session.commit()

    return jsonify({'message': 'Image supprimée'}), 200
