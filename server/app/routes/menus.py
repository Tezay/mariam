"""
Menu routes for MARIAM — Public display and editor management.

Public endpoints (no authentication required):
- GET /v1/menus/today        Today's published menu
- GET /v1/menus/tomorrow     Tomorrow's published menu
- GET /v1/menus/week         This week's menus (published only, or all if editor)

Editor endpoints (JWT required):
- GET  /v1/menus                          List menus with filters
- GET  /v1/menus/week                     All menus including drafts
- GET  /v1/menus/<id>                     Menu details
- GET  /v1/menus/by-date/<d>              Menu by date
- POST /v1/menus                          Create or update a menu
- PUT  /v1/menus/<id>                     Update a menu
- POST /v1/menus/<id>/publish             Publish
- POST /v1/menus/<id>/unpublish           Revert to draft
- DELETE /v1/menus/<id>                   Delete
- POST /v1/menus/week/publish             Publish the entire week
- POST /v1/menus/<id>/images              Upload image
- DELETE /v1/menus/<id>/images/<img_id>   Delete image
- PUT  /v1/menus/<id>/images/reorder      Reorder images
- PUT  /v1/menus/<id>/chef-note           Update chef note
- POST /v1/menus/<id>/item-images         Sync gallery images
- DELETE /v1/menus/<id>/item-images/<id>  Unlink gallery image
"""
from datetime import date, datetime, timedelta
from functools import wraps
from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, verify_jwt_in_request
from flask_smorest import Blueprint
from ..extensions import db
from ..models import User, Restaurant, Menu, MenuItem, MenuImage, AuditLog
from ..models import GalleryImage, MenuItemImage
from ..models import DietaryTag, Certification
from ..services.storage import storage
from ..security import get_client_ip, limiter
from ..schemas.menus import (
    MenuSchema, MenuListSchema, MenuCreateSchema, MenuUpdateSchema,
    WeekMenuSchema, PublicDayMenuSchema,
)
from ..schemas.common import ErrorSchema, MessageSchema


menus_bp = Blueprint(
    'menus', __name__,
    description='Menus — Public display and editor management'
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


def get_week_dates(reference_date=None):
    """Retourne les dates du lundi au dimanche de la semaine."""
    if reference_date is None:
        reference_date = date.today()
    monday = reference_date - timedelta(days=reference_date.weekday())
    return [monday + timedelta(days=i) for i in range(7)]


def get_default_restaurant():
    """Retourne le premier restaurant actif."""
    return Restaurant.query.filter_by(is_active=True).first()


def _build_menu_item(menu_id, item_data, idx):
    """Crée un MenuItem avec ses relations N:N tags/certifications."""
    item = MenuItem(
        menu_id=menu_id,
        category=item_data.get('category', 'plat'),
        name=item_data.get('name', ''),
        order=item_data.get('order', idx),
    )
    tag_ids = item_data.get('tags') or []
    if tag_ids:
        if isinstance(tag_ids[0], dict):
            tag_ids = [t['id'] for t in tag_ids]
        item.tags = DietaryTag.query.filter(DietaryTag.id.in_(tag_ids)).all()

    cert_ids = item_data.get('certifications') or []
    if cert_ids:
        if isinstance(cert_ids[0], dict):
            cert_ids = [c['id'] for c in cert_ids]
        item.certifications = Certification.query.filter(Certification.id.in_(cert_ids)).all()

    return item


def _format_menu_for_display(menu):
    """Formate un menu pour l'affichage public (TV, mobile).

    Retourne les items groupés par catégorie + liste complète + images
    fusionnées des deux systèmes (MenuImage + MenuItemImage).
    """
    if not menu:
        return None

    items_by_category = menu.get_items_by_category()
    items_list = [item.to_dict() for item in menu.items]
    images_list = [img.to_dict() for img in menu.images] if hasattr(menu, 'images') else []

    item_images_list = []
    try:
        item_imgs = MenuItemImage.query.filter_by(menu_id=menu.id).order_by(
            MenuItemImage.category, MenuItemImage.item_index, MenuItemImage.display_order
        ).all()
        item_images_list = [img.to_dict() for img in item_imgs]
    except Exception:
        pass

    # Fusionner les deux systèmes d'images pour le carousel TV
    all_display_images = list(images_list)
    for ii in item_images_list:
        if ii.get('url'):
            all_display_images.append({
                'id': ii['id'],
                'url': ii['url'],
                'filename': ii.get('filename'),
                'order': ii.get('display_order', len(all_display_images)),
            })

    return {
        'date': menu.date.isoformat(),
        'items': items_list,
        'by_category': items_by_category,
        'images': all_display_images,
        'item_images': item_images_list,
        'chef_note': menu.chef_note,
        # Rétrocompatibilité
        'entrees': items_by_category.get('entree', []),
        'plat': items_by_category.get('plat', []),
        'vg': items_by_category.get('vg', []),
        'desserts': items_by_category.get('dessert', []),
    }


# ============================================================
# ROUTES PUBLIQUES — today / tomorrow / week
# (définies avant les routes paramétrées /<int:menu_id>)
# ============================================================

@menus_bp.route('/today', methods=['GET'])
@limiter.limit("30 per minute")
@menus_bp.response(200, PublicDayMenuSchema)
@menus_bp.alt_response(200, schema=ErrorSchema, description="No restaurant configured")
def get_today_menu():
    """Today's published menu.

    Returns the published menu for the active restaurant.
    No authentication required.
    """
    restaurant_id = request.args.get('restaurant_id', type=int)
    if not restaurant_id:
        restaurant = get_default_restaurant()
        if restaurant:
            restaurant_id = restaurant.id
        else:
            return jsonify({'error': 'Aucun restaurant configuré', 'menu': None}), 200

    today = date.today()
    menu = Menu.query.filter_by(
        restaurant_id=restaurant_id,
        date=today,
        status='published'
    ).first()

    restaurant = Restaurant.query.get(restaurant_id)
    day_names = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

    return jsonify({
        'date': today.isoformat(),
        'day_name': day_names[today.weekday()],
        'restaurant': restaurant.to_dict(include_config=True) if restaurant else None,
        'menu': _format_menu_for_display(menu),
    }), 200


@menus_bp.route('/tomorrow', methods=['GET'])
@limiter.limit("30 per minute")
@menus_bp.response(200, PublicDayMenuSchema)
def get_tomorrow_menu():
    """Tomorrow's published menu.

    No authentication required.
    """
    restaurant_id = request.args.get('restaurant_id', type=int)
    if not restaurant_id:
        restaurant = get_default_restaurant()
        if restaurant:
            restaurant_id = restaurant.id
        else:
            return jsonify({'error': 'Aucun restaurant configuré', 'menu': None}), 200

    tomorrow = date.today() + timedelta(days=1)
    menu = Menu.query.filter_by(
        restaurant_id=restaurant_id,
        date=tomorrow,
        status='published'
    ).first()

    restaurant = Restaurant.query.get(restaurant_id)
    day_names = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

    return jsonify({
        'date': tomorrow.isoformat(),
        'day_name': day_names[tomorrow.weekday()],
        'restaurant': restaurant.to_dict(include_config=True) if restaurant else None,
        'menu': _format_menu_for_display(menu),
    }), 200


@menus_bp.route('/week', methods=['GET'])
@limiter.limit("30 per minute")
@menus_bp.response(200, WeekMenuSchema)
def get_week_menu():
    """This week's menus.

    - **Without authentication**: returns published menus only, in display format (TV/mobile).
    - **With editor authentication**: returns all menus (drafts included) in management format.

    Query params:
    - `restaurant_id` (int, optional)
    - `week_offset` (int, default 0 = current week)
    """
    restaurant_id = request.args.get('restaurant_id', type=int)
    week_offset = request.args.get('week_offset', 0, type=int)

    # Déterminer si l'appelant est un éditeur authentifié
    is_editor = False
    try:
        verify_jwt_in_request(optional=True)
        identity = get_jwt_identity()
        if identity:
            user = User.query.get(int(identity))
            is_editor = user is not None and user.is_editor()
    except Exception:
        pass

    restaurant = None
    if not restaurant_id:
        restaurant = get_default_restaurant()
        if restaurant:
            restaurant_id = restaurant.id
        else:
            return jsonify({'error': 'Aucun restaurant configuré', 'menus': {}}), 200
    else:
        restaurant = Restaurant.query.get(restaurant_id)

    reference_date = date.today() + timedelta(weeks=week_offset)
    week_dates = get_week_dates(reference_date)
    day_names = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

    menus = {}
    if is_editor:
        # Vue gestion : tous les menus (brouillons inclus)
        service_days = restaurant.get_service_days() if restaurant else [0, 1, 2, 3, 4]
        for d in week_dates:
            menu = Menu.query.filter_by(restaurant_id=restaurant_id, date=d).first()
            menus[d.isoformat()] = menu.to_dict() if menu else None

        return jsonify({
            'week_start': week_dates[0].isoformat(),
            'week_end': week_dates[6].isoformat(),
            'restaurant_id': restaurant_id,
            'service_days': service_days,
            'menus': menus,
        }), 200
    else:
        # Vue publique : menus publiés uniquement, format affichage
        for i, d in enumerate(week_dates):
            menu = Menu.query.filter_by(
                restaurant_id=restaurant_id,
                date=d,
                status='published'
            ).first()
            menus[d.isoformat()] = {
                'day_name': day_names[i],
                'menu': _format_menu_for_display(menu),
            }

        return jsonify({
            'week_start': week_dates[0].isoformat(),
            'week_end': week_dates[6].isoformat(),
            'restaurant': restaurant.to_dict() if restaurant else None,
            'menus': menus,
        }), 200


# ============================================================
# ROUTES ÉDITEUR — gestion des menus
# (liste + création avant les routes paramétrées)
# ============================================================

@menus_bp.route('', methods=['GET'])
@menus_bp.response(200, MenuListSchema)
@editor_required
def list_menus():
    """List menus with optional filters.

    Query params: `restaurant_id`, `start_date`, `end_date`, `status`
    """
    restaurant_id = request.args.get('restaurant_id', type=int)
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    status = request.args.get('status')

    query = Menu.query

    if restaurant_id:
        query = query.filter_by(restaurant_id=restaurant_id)

    if start_date:
        try:
            start = datetime.strptime(start_date, '%Y-%m-%d').date()
            query = query.filter(Menu.date >= start)
        except ValueError:
            pass

    if end_date:
        try:
            end = datetime.strptime(end_date, '%Y-%m-%d').date()
            query = query.filter(Menu.date <= end)
        except ValueError:
            pass

    if status:
        query = query.filter_by(status=status)

    menus = query.order_by(Menu.date.desc()).limit(100).all()

    return jsonify({'menus': [menu.to_dict() for menu in menus]}), 200


@menus_bp.route('', methods=['POST'])
@menus_bp.arguments(MenuCreateSchema)
@menus_bp.response(201, MenuSchema)
@menus_bp.alt_response(200, schema=MenuSchema, description="Menu updated (already existed)")
@menus_bp.alt_response(400, schema=ErrorSchema, description="Invalid data")
@editor_required
def create_or_update_menu(data):
    """Create or update a menu for a given date.

    If a menu already exists for this date and restaurant, it is updated
    (items are replaced). Otherwise a new menu is created.
    """
    current_user_id = int(get_jwt_identity())

    date_str = data.get('date')
    if not date_str:
        return jsonify({'error': 'Date requise'}), 400

    try:
        menu_date = datetime.strptime(date_str, '%Y-%m-%d').date()
    except ValueError:
        return jsonify({'error': 'Format de date invalide (YYYY-MM-DD)'}), 400

    restaurant_id = data.get('restaurant_id')
    if not restaurant_id:
        restaurant = get_default_restaurant()
        if restaurant:
            restaurant_id = restaurant.id
        else:
            return jsonify({'error': 'Aucun restaurant configuré'}), 400

    menu = Menu.query.filter_by(restaurant_id=restaurant_id, date=menu_date).first()
    is_new = menu is None

    if is_new:
        menu = Menu(restaurant_id=restaurant_id, date=menu_date)
        db.session.add(menu)
        db.session.flush()
    else:
        MenuItem.query.filter_by(menu_id=menu.id).delete()

    if 'chef_note' in data:
        menu.chef_note = data['chef_note'][:300] if data['chef_note'] else None

    items_data = data.get('items', [])
    for idx, item_data in enumerate(items_data):
        item = _build_menu_item(menu.id, item_data, idx)
        db.session.add(item)

    AuditLog.log(
        action=AuditLog.ACTION_MENU_CREATE if is_new else AuditLog.ACTION_MENU_UPDATE,
        user_id=current_user_id,
        target_type='menu',
        target_id=menu.id,
        details={'date': date_str, 'items_count': len(items_data)},
        ip_address=get_client_ip()
    )

    db.session.commit()

    return jsonify({
        'message': 'Menu créé' if is_new else 'Menu mis à jour',
        'menu': menu.to_dict()
    }), 201 if is_new else 200


@menus_bp.route('/week/publish', methods=['POST'])
@menus_bp.arguments(MenuCreateSchema(partial=True))
@menus_bp.response(200, MessageSchema)
@editor_required
def publish_week(data):
    """Publish all draft menus for the week.

    Optional JSON body: `{ "week_offset": 0, "restaurant_id": 1 }`
    """
    current_user_id = int(get_jwt_identity())

    week_offset = data.get('week_offset', 0)
    restaurant_id = data.get('restaurant_id')

    if not restaurant_id:
        restaurant = get_default_restaurant()
        if restaurant:
            restaurant_id = restaurant.id

    reference_date = date.today() + timedelta(weeks=week_offset)
    week_dates = get_week_dates(reference_date)

    published_count = 0
    for d in week_dates:
        menu = Menu.query.filter_by(restaurant_id=restaurant_id, date=d).first()
        if menu and menu.status == 'draft':
            menu.status = 'published'
            menu.published_at = datetime.utcnow()
            menu.published_by_id = current_user_id
            published_count += 1

    AuditLog.log(
        action=AuditLog.ACTION_MENU_PUBLISH,
        user_id=current_user_id,
        details={
            'type': 'week_publish',
            'week_start': week_dates[0].isoformat(),
            'published_count': published_count,
        },
        ip_address=get_client_ip()
    )

    db.session.commit()

    return jsonify({
        'message': f'{published_count} menu(s) publié(s)',
        'week_start': week_dates[0].isoformat(),
        'week_end': week_dates[6].isoformat(),
    }), 200


# ============================================================
# ROUTES PARAMÉTRÉES — après toutes les routes statiques
# ============================================================

@menus_bp.route('/by-date/<date_str>', methods=['GET'])
@menus_bp.response(200, MenuSchema)
@menus_bp.alt_response(400, schema=ErrorSchema, description="Format de date invalide")
@editor_required
def get_menu_by_date(date_str):
    """Get a menu by date (YYYY-MM-DD format)."""
    try:
        menu_date = datetime.strptime(date_str, '%Y-%m-%d').date()
    except ValueError:
        return jsonify({'error': 'Format de date invalide (YYYY-MM-DD)'}), 400

    restaurant_id = request.args.get('restaurant_id', type=int)
    if not restaurant_id:
        restaurant = get_default_restaurant()
        if restaurant:
            restaurant_id = restaurant.id

    menu = Menu.query.filter_by(restaurant_id=restaurant_id, date=menu_date).first()

    return jsonify({
        'menu': menu.to_dict() if menu else None,
        'date': date_str,
        'restaurant_id': restaurant_id,
    }), 200


@menus_bp.route('/<int:menu_id>', methods=['GET'])
@menus_bp.response(200, MenuSchema)
@menus_bp.alt_response(404, schema=ErrorSchema, description="Menu not found")
@editor_required
def get_menu(menu_id):
    """Get a menu by ID."""
    menu = Menu.query.get(menu_id)
    if not menu:
        return jsonify({'error': 'Menu non trouvé'}), 404
    return jsonify({'menu': menu.to_dict()}), 200


@menus_bp.route('/<int:menu_id>', methods=['PUT'])
@menus_bp.arguments(MenuUpdateSchema)
@menus_bp.response(200, MenuSchema)
@menus_bp.alt_response(404, schema=ErrorSchema, description="Menu not found")
@editor_required
def update_menu(data, menu_id):
    """Update an existing menu (items and/or chef note)."""
    current_user_id = int(get_jwt_identity())
    menu = Menu.query.get(menu_id)
    if not menu:
        return jsonify({'error': 'Menu non trouvé'}), 404

    if 'chef_note' in data:
        menu.chef_note = data['chef_note'][:300] if data['chef_note'] else None

    if 'items' in data:
        MenuItem.query.filter_by(menu_id=menu.id).delete()
        for idx, item_data in enumerate(data['items']):
            item = _build_menu_item(menu.id, item_data, idx)
            db.session.add(item)

    AuditLog.log(
        action=AuditLog.ACTION_MENU_UPDATE,
        user_id=current_user_id,
        target_type='menu',
        target_id=menu.id,
        details={'date': menu.date.isoformat()},
        ip_address=get_client_ip()
    )

    db.session.commit()

    return jsonify({'message': 'Menu mis à jour', 'menu': menu.to_dict()}), 200


@menus_bp.route('/<int:menu_id>/publish', methods=['POST'])
@menus_bp.response(200, MenuSchema)
@menus_bp.alt_response(404, schema=ErrorSchema, description="Menu not found")
@editor_required
def publish_menu(menu_id):
    """Publish a menu (draft to published)."""
    current_user_id = int(get_jwt_identity())
    menu = Menu.query.get(menu_id)
    if not menu:
        return jsonify({'error': 'Menu non trouvé'}), 404

    menu.status = 'published'
    menu.published_at = datetime.utcnow()
    menu.published_by_id = current_user_id

    AuditLog.log(
        action=AuditLog.ACTION_MENU_PUBLISH,
        user_id=current_user_id,
        target_type='menu',
        target_id=menu.id,
        details={'date': menu.date.isoformat()},
        ip_address=get_client_ip()
    )

    db.session.commit()

    return jsonify({'message': 'Menu publié', 'menu': menu.to_dict()}), 200


@menus_bp.route('/<int:menu_id>/unpublish', methods=['POST'])
@menus_bp.response(200, MenuSchema)
@menus_bp.alt_response(400, schema=ErrorSchema, description="Menu is not published")
@menus_bp.alt_response(404, schema=ErrorSchema, description="Menu not found")
@editor_required
def unpublish_menu(menu_id):
    """Revert a published menu to draft."""
    current_user_id = int(get_jwt_identity())
    menu = Menu.query.get(menu_id)
    if not menu:
        return jsonify({'error': 'Menu non trouvé'}), 404

    if menu.status != 'published':
        return jsonify({'error': "Le menu n'est pas publié"}), 400

    menu.status = 'draft'

    AuditLog.log(
        action=AuditLog.ACTION_MENU_UPDATE,
        user_id=current_user_id,
        target_type='menu',
        target_id=menu.id,
        details={'action': 'unpublish', 'date': menu.date.isoformat()},
        ip_address=get_client_ip()
    )

    db.session.commit()

    return jsonify({'message': 'Menu repassé en brouillon', 'menu': menu.to_dict()}), 200


@menus_bp.route('/<int:menu_id>', methods=['DELETE'])
@menus_bp.response(200, MessageSchema)
@menus_bp.alt_response(404, schema=ErrorSchema, description="Menu not found")
@editor_required
def delete_menu(menu_id):
    """Delete a menu and all associated data (items, S3 images)."""
    current_user_id = int(get_jwt_identity())
    menu = Menu.query.get(menu_id)
    if not menu:
        return jsonify({'error': 'Menu non trouvé'}), 404

    menu_date = menu.date.isoformat()

    for image in list(menu.images):
        storage.delete_file(image.storage_key)

    MenuItemImage.query.filter_by(menu_id=menu_id).delete()
    MenuItem.query.filter_by(menu_id=menu_id).delete()
    db.session.delete(menu)

    AuditLog.log(
        action=AuditLog.ACTION_MENU_UPDATE,
        user_id=current_user_id,
        target_type='menu',
        target_id=menu_id,
        details={'action': 'delete', 'date': menu_date},
        ip_address=get_client_ip()
    )

    db.session.commit()

    return jsonify({'message': 'Menu supprimé'}), 200


# ============================================================
# IMAGES DU MENU (photos uploadées directement)
# ============================================================

@menus_bp.route('/<int:menu_id>/images', methods=['POST'])
@menus_bp.response(201, MenuSchema)
@menus_bp.alt_response(400, schema=ErrorSchema, description="Invalid file or quota exceeded")
@menus_bp.alt_response(404, schema=ErrorSchema, description="Menu not found")
@menus_bp.alt_response(503, schema=ErrorSchema, description="S3 storage not configured")
@editor_required
def upload_menu_image(menu_id):
    """Upload an image for a menu (max 6, 5 MB each).

    Accepts JPEG, PNG, WebP, HEIC formats (converted to JPEG).
    Multipart/form-data request with `file` field.
    """
    menu = Menu.query.get(menu_id)
    if not menu:
        return jsonify({'error': 'Menu non trouvé'}), 404

    if not storage.is_configured:
        return jsonify({'error': 'Stockage S3 non configuré'}), 503

    current_count = MenuImage.query.filter_by(menu_id=menu_id).count()
    if current_count >= 6:
        return jsonify({'error': 'Maximum 6 images par menu'}), 400

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
        prefix=f'menus/{menu_id}',
        content_type=content_type,
    )

    if not result:
        return jsonify({'error': "Erreur lors de l'upload"}), 500

    image = MenuImage(
        menu_id=menu_id,
        storage_key=result['key'],
        url=result['url'],
        filename=filename,
        order=current_count,
    )
    db.session.add(image)
    db.session.commit()

    return jsonify({'message': 'Image uploadée', 'image': image.to_dict()}), 201


@menus_bp.route('/<int:menu_id>/images/<int:image_id>', methods=['DELETE'])
@menus_bp.response(200, MessageSchema)
@menus_bp.alt_response(404, schema=ErrorSchema, description="Image not found")
@editor_required
def delete_menu_image(menu_id, image_id):
    """Delete a menu image from S3 storage and database."""
    image = MenuImage.query.filter_by(id=image_id, menu_id=menu_id).first()
    if not image:
        return jsonify({'error': 'Image non trouvée'}), 404

    storage.delete_file(image.storage_key)
    db.session.delete(image)
    db.session.commit()

    return jsonify({'message': 'Image supprimée'}), 200


@menus_bp.route('/<int:menu_id>/images/reorder', methods=['PUT'])
@menus_bp.response(200, MenuSchema)
@menus_bp.alt_response(400, schema=ErrorSchema, description="image_ids list required")
@menus_bp.alt_response(404, schema=ErrorSchema, description="Menu not found")
@editor_required
def reorder_menu_images(menu_id):
    """Reorder menu images.

    JSON body: `{ "image_ids": [3, 1, 2] }`
    """
    menu = Menu.query.get(menu_id)
    if not menu:
        return jsonify({'error': 'Menu non trouvé'}), 404

    data = request.get_json() or {}
    image_ids = data.get('image_ids', [])
    if not image_ids:
        return jsonify({'error': 'Liste image_ids requise'}), 400

    for order, img_id in enumerate(image_ids):
        image = MenuImage.query.filter_by(id=img_id, menu_id=menu_id).first()
        if image:
            image.order = order

    db.session.commit()

    return jsonify({
        'message': 'Images réordonnées',
        'images': [img.to_dict() for img in menu.images.order_by(MenuImage.order)],
    }), 200


@menus_bp.route('/<int:menu_id>/chef-note', methods=['PUT'])
@menus_bp.response(200, MenuSchema)
@menus_bp.alt_response(404, schema=ErrorSchema, description="Menu not found")
@editor_required
def update_chef_note(menu_id):
    """Update the chef note for a menu (max 300 characters)."""
    menu = Menu.query.get(menu_id)
    if not menu:
        return jsonify({'error': 'Menu non trouvé'}), 404

    data = request.get_json() or {}
    menu.chef_note = data.get('chef_note', '')[:300] if data.get('chef_note') else None
    db.session.commit()

    return jsonify({'message': 'Note du chef mise à jour', 'menu': menu.to_dict()}), 200


# ============================================================
# IMAGES PAR CATÉGORIE (liens vers galerie)
# ============================================================

@menus_bp.route('/<int:menu_id>/item-images', methods=['POST'])
@menus_bp.response(200, MenuSchema)
@menus_bp.alt_response(404, schema=ErrorSchema, description="Menu not found")
@editor_required
def sync_item_images(menu_id):
    """Sync gallery images by menu item category.

    Replaces all existing MenuItemImage associations.

    JSON body:
    ```json
    {
      "item_images": [
        {
          "gallery_image_id": 12,
          "category": "plat",
          "item_index": 0,
          "display_order": 0
        }
      ]
    }
    ```
    """
    menu = Menu.query.get(menu_id)
    if not menu:
        return jsonify({'error': 'Menu non trouvé'}), 404

    data = request.get_json() or {}
    new_links = data.get('item_images', [])

    MenuItemImage.query.filter_by(menu_id=menu_id).delete()

    for idx, link in enumerate(new_links):
        gid = link.get('gallery_image_id')
        if not gid or not GalleryImage.query.get(gid):
            continue
        db.session.add(MenuItemImage(
            menu_id=menu_id,
            gallery_image_id=gid,
            category=link.get('category', ''),
            item_index=link.get('item_index', 0),
            display_order=link.get('display_order', idx),
        ))

    db.session.commit()

    item_imgs = MenuItemImage.query.filter_by(menu_id=menu_id).order_by(
        MenuItemImage.category, MenuItemImage.item_index, MenuItemImage.display_order
    ).all()

    return jsonify({
        'message': 'Images par catégorie mises à jour',
        'item_images': [img.to_dict() for img in item_imgs],
    }), 200


@menus_bp.route('/<int:menu_id>/item-images/<int:link_id>', methods=['DELETE'])
@menus_bp.response(200, MessageSchema)
@menus_bp.alt_response(404, schema=ErrorSchema, description="Link not found")
@editor_required
def remove_item_image(menu_id, link_id):
    """Remove a gallery image link from a menu item (does not delete the photo)."""
    link = MenuItemImage.query.filter_by(id=link_id, menu_id=menu_id).first()
    if not link:
        return jsonify({'error': 'Lien non trouvé'}), 404

    db.session.delete(link)
    db.session.commit()

    return jsonify({'message': 'Image retirée du menu'}), 200
