"""
Gallery routes for MARIAM — Shared dish photo library.

Centralized gallery of dish photos, shared across menus.
Images are tagged and can be searched and reused.

Endpoints (editor role required):
- GET    /v1/gallery                        List with pagination and search
- GET    /v1/gallery/<id>                   Details and usages
- POST   /v1/gallery                        Upload an image
- DELETE /v1/gallery/<id>                   Delete an image
- PUT    /v1/gallery/<id>/tags              Replace tags (dish + manual)
- POST   /v1/gallery/<id>/tags              Add a manual tag
- DELETE /v1/gallery/<id>/tags/<tag_id>     Remove a tag
"""
from functools import wraps
from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from flask_smorest import Blueprint
from sqlalchemy import or_
from ..extensions import db
from ..models import User, Restaurant, GalleryImage, GalleryImageTag, MenuItemImage
from ..services.storage import storage
from ..schemas.gallery import GalleryImageSchema, GalleryListSchema
from ..schemas.common import ErrorSchema, MessageSchema


gallery_bp = Blueprint(
    'gallery', __name__,
    description='Gallery — Shared dish photos across menus'
)


# ============================================================
# HELPERS
# ============================================================

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


def _resolve_restaurant_id():
    """Résout le restaurant_id depuis le query param ou le restaurant par défaut."""
    rid = request.args.get('restaurant_id', type=int)
    if not rid:
        r = Restaurant.query.filter_by(is_active=True).first()
        rid = r.id if r else None
    return rid


# ============================================================
# LISTING & RECHERCHE
# ============================================================

@gallery_bp.route('', methods=['GET'])
@gallery_bp.response(200, GalleryListSchema)
@gallery_bp.alt_response(400, schema=ErrorSchema, description="No restaurant configured")
@editor_required
def list_images():
    """List gallery images with pagination and search.

    Query params:
    - `q` — Keyword search in tags
    - `category` — Filter by category_id
    - `page` — Page number (default 1)
    - `per_page` — Images per page (default 30, max 100)
    - `sort` — Sort order: `recent` (default), `oldest`, `usage`
    - `restaurant_id` — Filter by restaurant (default: first active)
    """
    restaurant_id = _resolve_restaurant_id()
    if not restaurant_id:
        return jsonify({'error': 'Aucun restaurant configuré'}), 400

    q = request.args.get('q', '').strip()
    category = request.args.get('category', '').strip()
    page = max(1, request.args.get('page', 1, type=int))
    per_page = min(100, max(1, request.args.get('per_page', 30, type=int)))
    sort = request.args.get('sort', 'recent')

    query = GalleryImage.query.filter_by(restaurant_id=restaurant_id)

    if q:
        tag_subquery = db.session.query(GalleryImageTag.gallery_image_id).filter(
            GalleryImageTag.name.ilike(f'%{q}%')
        ).subquery()
        query = query.filter(GalleryImage.id.in_(tag_subquery))

    if category:
        cat_subquery = db.session.query(GalleryImageTag.gallery_image_id).filter(
            GalleryImageTag.tag_type == 'category',
            GalleryImageTag.category_id == category,
        ).subquery()
        query = query.filter(GalleryImage.id.in_(cat_subquery))

    if sort == 'oldest':
        query = query.order_by(GalleryImage.created_at.asc())
    elif sort == 'usage':
        usage_count = db.func.count(MenuItemImage.id).label('usage_count')
        query = (
            query
            .outerjoin(MenuItemImage)
            .group_by(GalleryImage.id)
            .order_by(usage_count.desc(), GalleryImage.created_at.desc())
        )
    else:
        query = query.order_by(GalleryImage.created_at.desc())

    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        'images': [img.to_dict(include_tags=True, include_usage_count=True) for img in pagination.items],
        'total': pagination.total,
        'page': page,
        'per_page': per_page,
        'pages': pagination.pages,
    }), 200


@gallery_bp.route('', methods=['POST'])
@gallery_bp.response(201, GalleryImageSchema)
@gallery_bp.alt_response(400, schema=ErrorSchema, description="Invalid file or missing restaurant")
@gallery_bp.alt_response(503, schema=ErrorSchema, description="S3 storage not configured")
@editor_required
def upload_image():
    """Upload an image to the gallery.

    Multipart/form-data request:
    - `file` — Image file (required)
    - `dish_name` — Dish name for automatic tag (optional)
    - `category_id` — Category ID for automatic tag (optional)
    - `category_label` — Category label (optional, used for tag)
    - `restaurant_id` — Restaurant ID (optional, default: first active)
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

    file_data, filename, content_type = storage.process_image(
        file_data, file.filename, file.content_type
    )

    result = storage.upload_file(
        file_data=file_data,
        filename=filename,
        prefix='gallery',
        content_type=content_type,
    )
    if not result:
        return jsonify({'error': "Erreur lors de l'upload"}), 500

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
    db.session.flush()

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


# ============================================================
# ROUTES PARAMÉTRÉES — après les routes statiques ('' GET/POST)
# ============================================================

@gallery_bp.route('/<int:image_id>', methods=['GET'])
@gallery_bp.response(200, GalleryImageSchema)
@gallery_bp.alt_response(404, schema=ErrorSchema, description="Image not found")
@editor_required
def get_image(image_id):
    """Get image details including tags and recent usages."""
    image = GalleryImage.query.get(image_id)
    if not image:
        return jsonify({'error': 'Image non trouvée'}), 404

    data = image.to_dict(include_tags=True, include_usage_count=True)

    usages = (
        MenuItemImage.query
        .filter_by(gallery_image_id=image_id)
        .order_by(MenuItemImage.created_at.desc())
        .limit(20)
        .all()
    )
    data['usages'] = [u.to_dict() for u in usages]

    return jsonify({'image': data}), 200


@gallery_bp.route('/<int:image_id>', methods=['DELETE'])
@gallery_bp.response(200, MessageSchema)
@gallery_bp.alt_response(404, schema=ErrorSchema, description="Image not found")
@editor_required
def delete_image(image_id):
    """Delete an image from the gallery (S3 and database).

    Also removes all associated MenuItemImage links.
    """
    image = GalleryImage.query.get(image_id)
    if not image:
        return jsonify({'error': 'Image non trouvée'}), 404

    storage.delete_file(image.storage_key)
    db.session.delete(image)
    db.session.commit()

    return jsonify({'message': 'Image supprimée'}), 200


@gallery_bp.route('/<int:image_id>/tags', methods=['PUT'])
@gallery_bp.response(200, GalleryImageSchema)
@gallery_bp.alt_response(404, schema=ErrorSchema, description="Image not found")
@editor_required
def update_tags(image_id):
    """Replace editable tags (dish + manual) on an image.

    Tags of type `category` cannot be modified through this endpoint.

    JSON body:
    ```json
    {
      "tags": [
        { "name": "Ratatouille", "tag_type": "dish" },
        { "name": "spicy", "tag_type": "manual" }
      ]
    }
    ```
    """
    image = GalleryImage.query.get(image_id)
    if not image:
        return jsonify({'error': 'Image non trouvée'}), 404

    data = request.get_json() or {}
    new_tags = data.get('tags', [])

    GalleryImageTag.query.filter(
        GalleryImageTag.gallery_image_id == image_id,
        GalleryImageTag.tag_type.in_(['dish', 'manual']),
    ).delete(synchronize_session='fetch')

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

    return jsonify({'message': 'Tags mis à jour', 'image': image.to_dict(include_tags=True)}), 200


@gallery_bp.route('/<int:image_id>/tags', methods=['POST'])
@gallery_bp.response(201, GalleryImageSchema)
@gallery_bp.alt_response(400, schema=ErrorSchema, description="Tag name required")
@gallery_bp.alt_response(404, schema=ErrorSchema, description="Image not found")
@editor_required
def add_tag(image_id):
    """Add a manual tag to an image.

    JSON body: `{ "name": "spicy" }`
    """
    image = GalleryImage.query.get(image_id)
    if not image:
        return jsonify({'error': 'Image non trouvée'}), 404

    data = request.get_json() or {}
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

    return jsonify({'message': 'Tag ajouté', 'tag': tag.to_dict()}), 201


@gallery_bp.route('/<int:image_id>/tags/<int:tag_id>', methods=['DELETE'])
@gallery_bp.response(200, MessageSchema)
@gallery_bp.alt_response(400, schema=ErrorSchema, description="Category tags cannot be deleted")
@gallery_bp.alt_response(404, schema=ErrorSchema, description="Tag not found")
@editor_required
def delete_tag(image_id, tag_id):
    """Delete a tag (dish or manual only — category tags cannot be removed)."""
    tag = GalleryImageTag.query.filter_by(id=tag_id, gallery_image_id=image_id).first()
    if not tag:
        return jsonify({'error': 'Tag non trouvé'}), 404

    if tag.tag_type == 'category':
        return jsonify({'error': 'Les tags de catégorie ne peuvent pas être supprimés manuellement'}), 400

    db.session.delete(tag)
    db.session.commit()

    return jsonify({'message': 'Tag supprimé'}), 200
