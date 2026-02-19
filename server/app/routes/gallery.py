"""
Routes de la galerie de photos MARIAM.

Galerie centralisée de photos de plats, partagée entre menus.
Les images sont taguées automatiquement (nom du plat, catégorie)
et peuvent être recherchées et réutilisées.

Endpoints (protégés par rôle editor+) :
- GET  /api/gallery             - Lister les images (pagination, recherche)
- GET  /api/gallery/:id         - Détails d'une image
- POST /api/gallery             - Uploader une nouvelle image
- DELETE /api/gallery/:id       - Supprimer une image
- PUT  /api/gallery/:id/tags    - Mettre à jour les tags d'une image
- POST /api/gallery/:id/tags    - Ajouter un tag manuel
- DELETE /api/gallery/:id/tags/:tag_id - Supprimer un tag
"""
from functools import wraps
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import or_
from ..extensions import db
from ..models import User, Restaurant, GalleryImage, GalleryImageTag, MenuItemImage
from ..services.storage import storage


gallery_bp = Blueprint('gallery', __name__)


def editor_required(f):
    """Décorateur pour protéger les routes editor+."""
    @wraps(f)
    @jwt_required()
    def decorated_function(*args, **kwargs):
        current_user_id = int(get_jwt_identity())
        user = User.query.get(current_user_id)
        if not user or not user.is_editor():
            return jsonify({'error': 'Accès réservé aux éditeurs'}), 403
        return f(*args, **kwargs)
    return decorated_function


def _get_restaurant_id():
    """Résout le restaurant_id (paramètre ou défaut)."""
    rid = request.args.get('restaurant_id', type=int)
    if not rid:
        r = Restaurant.query.filter_by(is_active=True).first()
        rid = r.id if r else None
    return rid


# ========================================
# LISTING & RECHERCHE
# ========================================

@gallery_bp.route('', methods=['GET'])
@editor_required
def list_images():
    """Liste les images de la galerie avec pagination et recherche.

    Query params :
        q           - Recherche par mot-clé (tags)
        category    - Filtrer par category_id
        page        - Page (défaut 1)
        per_page    - Images par page (défaut 30, max 100)
        sort        - Tri: 'recent' (défaut), 'oldest', 'usage'
    """
    restaurant_id = _get_restaurant_id()
    if not restaurant_id:
        return jsonify({'error': 'Aucun restaurant configuré'}), 400

    q = request.args.get('q', '').strip()
    category = request.args.get('category', '').strip()
    page = max(1, request.args.get('page', 1, type=int))
    per_page = min(100, max(1, request.args.get('per_page', 30, type=int)))
    sort = request.args.get('sort', 'recent')

    query = GalleryImage.query.filter_by(restaurant_id=restaurant_id)

    # Recherche par mot-clé dans les tags
    if q:
        tag_subquery = db.session.query(GalleryImageTag.gallery_image_id).filter(
            GalleryImageTag.name.ilike(f'%{q}%')
        ).subquery()
        query = query.filter(GalleryImage.id.in_(tag_subquery))

    # Filtre par catégorie
    if category:
        cat_subquery = db.session.query(GalleryImageTag.gallery_image_id).filter(
            GalleryImageTag.tag_type == 'category',
            GalleryImageTag.category_id == category,
        ).subquery()
        query = query.filter(GalleryImage.id.in_(cat_subquery))

    # Tri
    if sort == 'oldest':
        query = query.order_by(GalleryImage.created_at.asc())
    elif sort == 'usage':
        # Trier par nombre d'utilisations décroissant
        usage_count = db.func.count(MenuItemImage.id).label('usage_count')
        query = (
            query
            .outerjoin(MenuItemImage)
            .group_by(GalleryImage.id)
            .order_by(usage_count.desc(), GalleryImage.created_at.desc())
        )
    else:  # 'recent'
        query = query.order_by(GalleryImage.created_at.desc())

    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        'images': [img.to_dict(include_tags=True, include_usage_count=True) for img in pagination.items],
        'total': pagination.total,
        'page': page,
        'per_page': per_page,
        'pages': pagination.pages,
    }), 200


# ========================================
# DÉTAIL
# ========================================

@gallery_bp.route('/<int:image_id>', methods=['GET'])
@editor_required
def get_image(image_id):
    """Détails d'une image avec ses tags et usages."""
    image = GalleryImage.query.get(image_id)
    if not image:
        return jsonify({'error': 'Image non trouvée'}), 404

    data = image.to_dict(include_tags=True, include_usage_count=True)

    # Usages récents (menus liés)
    usages = (
        MenuItemImage.query
        .filter_by(gallery_image_id=image_id)
        .order_by(MenuItemImage.created_at.desc())
        .limit(20)
        .all()
    )
    data['usages'] = [u.to_dict() for u in usages]

    return jsonify({'image': data}), 200


# ========================================
# UPLOAD
# ========================================

@gallery_bp.route('', methods=['POST'])
@editor_required
def upload_image():
    """Upload une image vers la galerie.

    Form data :
        file         - Fichier image (requis)
        dish_name    - Nom du plat pour le tag automatique (optionnel)
        category_id  - ID de catégorie pour le tag automatique (optionnel)
        category_label - Libellé de catégorie (optionnel, pour le tag)
    """
    current_user_id = int(get_jwt_identity())

    restaurant_id = request.form.get('restaurant_id', type=int)
    if not restaurant_id:
        r = Restaurant.query.filter_by(is_active=True).first()
        restaurant_id = r.id if r else None
    if not restaurant_id:
        return jsonify({'error': 'Aucun restaurant configuré'}), 400

    if not storage.is_configured:
        return jsonify({'error': 'Stockage S3 non configuré'}), 503

    file = request.files.get('file')
    if not file:
        return jsonify({'error': 'Aucun fichier envoyé'}), 400

    is_valid, error_msg = storage.validate_image(file.filename, file.content_length)
    if not is_valid:
        return jsonify({'error': error_msg}), 400

    file_data = file.read()
    if len(file_data) > storage.MAX_FILE_SIZE:
        return jsonify({'error': 'Fichier trop volumineux (max 5 MB)'}), 400

    # Conversion HEIC/HEIF -> JPEG si nécessaire
    file_data, filename, content_type = storage.process_image(
        file_data, file.filename, file.content_type
    )

    # Upload vers S3 avec préfixe galerie
    result = storage.upload_file(
        file_data=file_data,
        filename=filename,
        prefix='gallery',
        content_type=content_type,
    )
    if not result:
        return jsonify({'error': "Erreur lors de l'upload"}), 500

    # Créer l'enregistrement
    image = GalleryImage(
        restaurant_id=restaurant_id,
        storage_key=result['key'],
        url=result['url'],
        filename=filename,
        file_size=len(file_data),
        mime_type=content_type,
        uploaded_by_id=current_user_id,
    )
    db.session.add(image)
    db.session.flush()  # Obtenir l'ID pour les tags

    # Tags automatiques
    dish_name = request.form.get('dish_name', '').strip()
    category_id = request.form.get('category_id', '').strip()
    category_label = request.form.get('category_label', '').strip()

    if dish_name:
        db.session.add(GalleryImageTag(
            gallery_image_id=image.id,
            name=dish_name,
            tag_type='dish',
        ))

    if category_id:
        db.session.add(GalleryImageTag(
            gallery_image_id=image.id,
            name=category_label or category_id,
            tag_type='category',
            category_id=category_id,
        ))

    db.session.commit()

    return jsonify({
        'message': 'Image ajoutée à la galerie',
        'image': image.to_dict(include_tags=True),
    }), 201


# ========================================
# SUPPRESSION
# ========================================

@gallery_bp.route('/<int:image_id>', methods=['DELETE'])
@editor_required
def delete_image(image_id):
    """Supprime une image de la galerie et de S3.

    Supprime aussi toutes les associations MenuItemImage.
    """
    image = GalleryImage.query.get(image_id)
    if not image:
        return jsonify({'error': 'Image non trouvée'}), 404

    # Supprimer de S3
    storage.delete_file(image.storage_key)

    # Cascade supprime tags + menu_usages
    db.session.delete(image)
    db.session.commit()

    return jsonify({'message': 'Image supprimée'}), 200


# ========================================
# GESTION DES TAGS
# ========================================

@gallery_bp.route('/<int:image_id>/tags', methods=['PUT'])
@editor_required
def update_tags(image_id):
    """Met à jour les tags manuels et dish d'une image.

    Body JSON :
        tags: [{ name: str, tag_type: 'dish'|'manual', id?: int }]

    Les tags de type 'category' ne sont pas modifiables ici.
    """
    image = GalleryImage.query.get(image_id)
    if not image:
        return jsonify({'error': 'Image non trouvée'}), 404

    data = request.get_json()
    new_tags = data.get('tags', [])

    # Supprimer les tags modifiables existants (dish + manual, pas category)
    GalleryImageTag.query.filter(
        GalleryImageTag.gallery_image_id == image_id,
        GalleryImageTag.tag_type.in_(['dish', 'manual']),
    ).delete(synchronize_session='fetch')

    # Recréer
    for tag_data in new_tags:
        tag_type = tag_data.get('tag_type', 'manual')
        if tag_type not in ('dish', 'manual'):
            continue
        name = tag_data.get('name', '').strip()
        if not name:
            continue
        db.session.add(GalleryImageTag(
            gallery_image_id=image_id,
            name=name,
            tag_type=tag_type,
        ))

    db.session.commit()

    return jsonify({
        'message': 'Tags mis à jour',
        'image': image.to_dict(include_tags=True),
    }), 200


@gallery_bp.route('/<int:image_id>/tags', methods=['POST'])
@editor_required
def add_tag(image_id):
    """Ajoute un tag manuel à une image.

    Body JSON : { name: str }
    """
    image = GalleryImage.query.get(image_id)
    if not image:
        return jsonify({'error': 'Image non trouvée'}), 404

    data = request.get_json()
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'error': 'Nom de tag requis'}), 400

    tag = GalleryImageTag(
        gallery_image_id=image_id,
        name=name,
        tag_type='manual',
    )
    db.session.add(tag)
    db.session.commit()

    return jsonify({
        'message': 'Tag ajouté',
        'tag': tag.to_dict(),
    }), 201


@gallery_bp.route('/<int:image_id>/tags/<int:tag_id>', methods=['DELETE'])
@editor_required
def delete_tag(image_id, tag_id):
    """Supprime un tag (dish ou manual uniquement)."""
    tag = GalleryImageTag.query.filter_by(id=tag_id, gallery_image_id=image_id).first()
    if not tag:
        return jsonify({'error': 'Tag non trouvé'}), 404

    if tag.tag_type == 'category':
        return jsonify({'error': 'Les tags de catégorie ne peuvent pas être supprimés manuellement'}), 400

    db.session.delete(tag)
    db.session.commit()

    return jsonify({'message': 'Tag supprimé'}), 200
