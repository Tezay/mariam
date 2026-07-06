"""
Catalog routes for MARIAM — CRUD pour le catalogue de plats par restaurant.

Endpoints en lecture (JWT required) :
- GET    /v1/catalog              Lister les plats (filtres: category_id, q, sort)
- GET    /v1/catalog/<id>         Détail d'un plat
- GET    /v1/catalog/<id>/stats   Statistiques d'utilisation du plat

Endpoints en écriture (editor ou admin) :
- POST   /v1/catalog              Créer un plat
- PUT    /v1/catalog/<id>         Mettre à jour un plat
- DELETE /v1/catalog/<id>         Supprimer un plat
- POST   /v1/catalog/<id>/image   Uploader l'image du plat
- DELETE /v1/catalog/<id>/image   Supprimer l'image du plat
"""
import re

from flask import jsonify, request
from flask_jwt_extended import jwt_required
from flask_smorest import Blueprint
from marshmallow import ValidationError
from sqlalchemy.orm import selectinload

from ..extensions import db
from ..models import AuditLog, DishCatalog, Menu, MenuItem
from ..models.taxonomy import Certification, DietaryTag
from ..schemas.catalog import (
    DishCatalogCreateSchema,
    DishCatalogUpdateSchema,
)
from ..security import get_client_ip, limiter
from ..services.storage import storage
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


def _normalize(text: str) -> str:
    """Normalise un texte pour la comparaison (lowercase, sans accents)."""
    import unicodedata
    nfkd = unicodedata.normalize('NFKD', text.lower())
    return ''.join(c for c in nfkd if not unicodedata.combining(c))


def _capitalize_name(name: str) -> str:
    """Première lettre en majuscule, trim des espaces superflus."""
    cleaned = re.sub(r'\s+', ' ', name.strip())
    return cleaned[0].upper() + cleaned[1:] if cleaned else cleaned


# ============================================================
# ROUTES — CATALOGUE
# ============================================================

@catalog_bp.route('', methods=['GET'])
@jwt_required()
def list_dishes():
    """Liste les plats du catalogue pour le restaurant de l'utilisateur.

    Query params:
        category_id (int, optional) — filtrer par catégorie
        q (str, optional) — recherche par nom (fuzzy substring)
        sort (str) — 'usage' (défaut) | 'name' | 'recent'
    """
    _, restaurant = get_user_and_restaurant()
    if not restaurant:
        return jsonify({'error': 'Restaurant non trouvé'}), 404

    query = DishCatalog.query.filter_by(restaurant_id=restaurant.id).options(
        selectinload(DishCatalog.tags),
        selectinload(DishCatalog.certifications),
    )

    category_id = request.args.get('category_id', type=int)
    if category_id:
        query = query.filter_by(category_id=category_id)

    q = request.args.get('q', '').strip()

    sort = request.args.get('sort', 'usage')
    if sort == 'name':
        query = query.order_by(DishCatalog.name.asc())
    elif sort == 'recent':
        query = query.order_by(DishCatalog.created_at.desc())
    else:
        query = query.order_by(DishCatalog.name.asc())

    dishes = query.all()

    if q:
        q_norm = _normalize(q)
        dishes = [d for d in dishes if q_norm in _normalize(d.name)]

    # Calcul usage_count via une seule requête groupée
    dish_ids = [d.id for d in dishes]
    usage_map: dict[int, int] = {}
    if dish_ids:
        rows = (
            db.session.query(MenuItem.dish_id, db.func.count(MenuItem.id))
            .filter(MenuItem.dish_id.in_(dish_ids))
            .group_by(MenuItem.dish_id)
            .all()
        )
        usage_map = {row[0]: row[1] for row in rows}

    if sort == 'usage':
        dishes.sort(key=lambda d: usage_map.get(d.id, 0), reverse=True)

    serialized = [d.to_dict(usage_count=usage_map.get(d.id, 0)) for d in dishes]

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

    dish = DishCatalog(
        restaurant_id=restaurant.id,
        category_id=validated.get('category_id'),
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


@catalog_bp.route('/<int:dish_id>/stats', methods=['GET'])
@jwt_required()
def get_dish_stats(dish_id):
    """Retourne les statistiques d'utilisation d'un plat.

    Réponse:
        week, month, semester, year — nombre d'utilisations sur ces périodes
        history — 52 dernières semaines [{week, count}]
        category_rank — rang parmi les plats de la même catégorie (dernier mois)
        similar_dishes — top 3 plats de la même catégorie [{id, name, month}]
    """
    from datetime import date, timedelta

    _, restaurant = get_user_and_restaurant()
    if not restaurant:
        return jsonify({'error': 'Restaurant non trouvé'}), 404

    dish = DishCatalog.query.filter_by(id=dish_id, restaurant_id=restaurant.id).first()
    if not dish:
        return jsonify({'error': 'Plat non trouvé'}), 404

    today = date.today()

    def _count_since(days: int) -> int:
        since = today - timedelta(days=days)
        return (
            db.session.query(db.func.count(MenuItem.id))
            .join(Menu, Menu.id == MenuItem.menu_id)
            .filter(MenuItem.dish_id == dish_id, Menu.date >= since)
            .scalar() or 0
        )

    week_count = _count_since(7)
    month_count = _count_since(30)
    semester_count = _count_since(182)
    year_count = _count_since(365)

    # Historique hebdomadaire : 52 semaines en une seule requête groupée
    history_since = today - timedelta(weeks=52)
    raw_history = (
        db.session.query(
            db.func.date_trunc('week', Menu.date).label('week_start'),
            db.func.count(MenuItem.id).label('cnt'),
        )
        .join(Menu, Menu.id == MenuItem.menu_id)
        .filter(MenuItem.dish_id == dish_id, Menu.date >= history_since)
        .group_by(db.func.date_trunc('week', Menu.date))
        .order_by(db.func.date_trunc('week', Menu.date))
        .all()
    )
    history = [
        {'week': row.week_start.strftime('%Y-%m-%d'), 'count': row.cnt}
        for row in raw_history
    ]

    # Rang dans la catégorie (dernier mois)
    category_rank = None
    if dish.category_id:
        since_30 = today - timedelta(days=30)
        cat_usage = (
            db.session.query(MenuItem.dish_id, db.func.count(MenuItem.id).label('cnt'))
            .join(Menu, Menu.id == MenuItem.menu_id)
            .join(DishCatalog, DishCatalog.id == MenuItem.dish_id)
            .filter(
                DishCatalog.category_id == dish.category_id,
                DishCatalog.restaurant_id == restaurant.id,
                Menu.date >= since_30,
            )
            .group_by(MenuItem.dish_id)
            .order_by(db.desc('cnt'))
            .all()
        )
        ranked_ids = [row[0] for row in cat_usage]
        if dish_id in ranked_ids:
            category_rank = ranked_ids.index(dish_id) + 1

    # Top 3 plats similaires (même catégorie, dernier mois)
    similar_dishes = []
    if dish.category_id:
        since_30 = today - timedelta(days=30)
        similar_rows = (
            db.session.query(
                DishCatalog.id,
                DishCatalog.name,
                db.func.count(MenuItem.id).label('cnt'),
            )
            .outerjoin(MenuItem, MenuItem.dish_id == DishCatalog.id)
            .outerjoin(Menu, Menu.id == MenuItem.menu_id)
            .filter(
                DishCatalog.category_id == dish.category_id,
                DishCatalog.restaurant_id == restaurant.id,
                DishCatalog.id != dish_id,
                db.or_(Menu.date.is_(None), Menu.date >= since_30),
            )
            .group_by(DishCatalog.id, DishCatalog.name)
            .order_by(db.desc('cnt'))
            .limit(3)
            .all()
        )
        similar_dishes = [{'id': r.id, 'name': r.name, 'month_count': r.cnt} for r in similar_rows]

    return jsonify({
        'week': week_count,
        'month': month_count,
        'semester': semester_count,
        'year': year_count,
        'history': history,
        'category_rank': category_rank,
        'similar_dishes': similar_dishes,
    }), 200


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

    if 'name' in validated:
        dish.name = _capitalize_name(validated['name'])
    if 'category_id' in validated:
        dish.category_id = validated['category_id']
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
    file_data, filename, content_type = storage.process_image(
        file_data, file.filename, file.content_type or 'application/octet-stream'
    )

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
