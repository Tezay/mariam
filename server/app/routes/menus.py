"""
Menu routes for MARIAM — Public display and editor management.

Public endpoints (no authentication required):
- GET /v1/menus/today        Today's published menu
- GET /v1/menus/tomorrow     Tomorrow's published menu
- GET /v1/menus/week         This week's menus (published only, or all if editor)

Editor endpoints (JWT required):
- GET  /v1/menus                                     List menus with filters
- GET  /v1/menus/week                                All menus including drafts
- GET  /v1/menus/<id>                                Menu details
- GET  /v1/menus/by-date/<d>                         Menu by date
- POST /v1/menus                                     Create or update a menu
- PUT  /v1/menus/<id>                                Update a menu
- POST /v1/menus/<id>/publish                        Publish
- POST /v1/menus/<id>/unpublish                      Revert to draft
- DELETE /v1/menus/<id>                              Delete
- POST /v1/menus/week/publish                        Publish the entire week
- POST /v1/menus/<id>/images                         Upload image
- DELETE /v1/menus/<id>/images/<img_id>              Delete image
- PUT  /v1/menus/<id>/images/reorder                 Reorder images
- PUT  /v1/menus/<id>/chef-note                      Update chef note
- PATCH /v1/menus/<id>/items/<item_id>/stock         Toggle item out-of-stock
- POST /v1/menus/<id>/items/<item_id>/images         Link gallery image to item
- DELETE /v1/menus/<id>/items/<item_id>/images/<lid> Unlink gallery image from item
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
from ..models.category import MenuCategory
from ..services.storage import storage
from ..security import get_client_ip, limiter
from ..schemas.menus import (
    MenuSchema, MenuListSchema, MenuCreateSchema, MenuUpdateSchema,
    WeekMenuSchema, PublicDayMenuSchema, MenuItemStockSchema,
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


def _sync_menu_items(menu, items_data):
    """Met à jour les items d'un menu avec une logique diff (UPDATE/INSERT/DELETE).

    - Les items existants dont l'id est fourni sont mis à jour en place.
    - Les nouveaux items (sans id ou id inconnu) sont insérés.
    - Les items existants absents du payload sont supprimés.
    - Les images liées (MenuItemImage) sont conservées pour les items maintenus.
    """
    existing = {item.id: item for item in menu.items}
    incoming_ids = set()

    for idx, item_data in enumerate(items_data):
        item_id = item_data.get('id')
        category_id = item_data.get('category_id')

        if item_id and item_id in existing:
            # Mise à jour en place
            item = existing[item_id]
            item.category_id = category_id or item.category_id
            item.name = item_data.get('name', item.name)
            item.order = item_data.get('order', idx)
            item.replacement_label = item_data.get('replacement_label')
            # is_out_of_stock n'est PAS réinitialisé ici (géré par l'endpoint /stock)
            incoming_ids.add(item_id)
        else:
            # Nouvel item
            item = MenuItem(
                menu_id=menu.id,
                category_id=category_id,
                name=item_data.get('name', ''),
                order=item_data.get('order', idx),
                replacement_label=item_data.get('replacement_label'),
            )
            db.session.add(item)
            db.session.flush()  # Obtenir l'id immédiatement
            incoming_ids.add(item.id)

        # Sync tags
        tag_ids = item_data.get('tags') or []
        if isinstance(tag_ids, list):
            if tag_ids and isinstance(tag_ids[0], dict):
                tag_ids = [t['id'] for t in tag_ids]
            item.tags = DietaryTag.query.filter(DietaryTag.id.in_(tag_ids)).all()

        # Sync certifications
        cert_ids = item_data.get('certifications') or []
        if isinstance(cert_ids, list):
            if cert_ids and isinstance(cert_ids[0], dict):
                cert_ids = [c['id'] for c in cert_ids]
            item.certifications = Certification.query.filter(
                Certification.id.in_(cert_ids)
            ).all()

    # Supprimer les items retirés du payload (CASCADE supprime aussi leurs images)
    for item_id, item in existing.items():
        if item_id not in incoming_ids:
            db.session.delete(item)


def _format_menu_for_display(menu):
    """Formate un menu pour l'affichage public (TV, mobile).

    Structure de retour :
    - by_category : liste ordonnée de catégories principales avec leurs items
      (et leurs sous-catégories pour Plat principal)
    - images : photos du jour (MenuImage legacy)
    """
    if not menu:
        return None

    restaurant = menu.restaurant
    # Charger catégories du restaurant triées
    top_level_cats = MenuCategory.query.filter_by(
        restaurant_id=restaurant.id, parent_id=None
    ).order_by(MenuCategory.order).all()

    # Construire un index items par category_id
    items_by_cat = {}
    for item in menu.items:
        cid = item.category_id
        if cid not in items_by_cat:
            items_by_cat[cid] = []
        items_by_cat[cid].append(item.to_dict())

    by_category = []
    for cat in top_level_cats:
        cat_dict = {
            'id': cat.id,
            'label': cat.label,
            'icon': cat.icon,
            'is_highlighted': cat.is_highlighted,
            'is_protected': cat.is_protected,
            'order': cat.order,
        }
        if cat.subcategories:
            subcats = []
            for sub in sorted(cat.subcategories, key=lambda s: s.order):
                subcats.append({
                    'id': sub.id,
                    'label': sub.label,
                    'icon': sub.icon,
                    'is_highlighted': sub.is_highlighted,
                    'is_protected': sub.is_protected,
                    'order': sub.order,
                    'items': items_by_cat.get(sub.id, []),
                })
            cat_dict['subcategories'] = subcats
        else:
            cat_dict['items'] = items_by_cat.get(cat.id, [])
        by_category.append(cat_dict)

    images_list = [img.to_dict() for img in menu.images] if hasattr(menu, 'images') else []

    return {
        'date': menu.date.isoformat(),
        'items': [item.to_dict() for item in menu.items],
        'by_category': by_category,
        'images': images_list,
        'chef_note': menu.chef_note,
    }


# ============================================================
# ROUTES PUBLIQUES — today / tomorrow / week
# ============================================================

@menus_bp.route('/today', methods=['GET'])
@limiter.limit("30 per minute")
@menus_bp.response(200, PublicDayMenuSchema)
@menus_bp.alt_response(200, schema=ErrorSchema, description="No restaurant configured")
def get_today_menu():
    """Today's published menu. No authentication required."""
    restaurant_id = request.args.get('restaurant_id', type=int)
    if not restaurant_id:
        restaurant = get_default_restaurant()
        if restaurant:
            restaurant_id = restaurant.id
        else:
            return jsonify({'error': 'Aucun restaurant configuré', 'menu': None}), 200

    today = date.today()
    menu = Menu.query.filter_by(
        restaurant_id=restaurant_id, date=today, status='published'
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
    """Tomorrow's published menu. No authentication required."""
    restaurant_id = request.args.get('restaurant_id', type=int)
    if not restaurant_id:
        restaurant = get_default_restaurant()
        if restaurant:
            restaurant_id = restaurant.id
        else:
            return jsonify({'error': 'Aucun restaurant configuré', 'menu': None}), 200

    tomorrow = date.today() + timedelta(days=1)
    menu = Menu.query.filter_by(
        restaurant_id=restaurant_id, date=tomorrow, status='published'
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

    - Without authentication: published only, display format.
    - With editor authentication: all menus (drafts included), management format.

    Query params: `restaurant_id` (int, optional), `week_offset` (int, default 0)
    """
    restaurant_id = request.args.get('restaurant_id', type=int)
    week_offset = request.args.get('week_offset', 0, type=int)

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
        for i, d in enumerate(week_dates):
            menu = Menu.query.filter_by(
                restaurant_id=restaurant_id, date=d, status='published'
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
            query = query.filter(Menu.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
        except ValueError:
            pass
    if end_date:
        try:
            query = query.filter(Menu.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
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
@menus_bp.alt_response(400, schema=ErrorSchema)
@editor_required
def create_or_update_menu(data):
    """Create or update a menu for a given date.

    If a menu already exists for this date, items are diff-synced
    (stable IDs preserved, linked images kept).
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

    if 'chef_note' in data:
        menu.chef_note = data['chef_note'][:300] if data['chef_note'] else None

    _sync_menu_items(menu, data.get('items', []))

    AuditLog.log(
        action=AuditLog.ACTION_MENU_CREATE if is_new else AuditLog.ACTION_MENU_UPDATE,
        user_id=current_user_id,
        target_type='menu',
        target_id=menu.id,
        details={'date': date_str, 'items_count': len(data.get('items', []))},
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
# ROUTES PARAMÉTRÉES
# ============================================================

@menus_bp.route('/by-date/<date_str>', methods=['GET'])
@menus_bp.response(200, MenuSchema)
@menus_bp.alt_response(400, schema=ErrorSchema)
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
@menus_bp.alt_response(404, schema=ErrorSchema)
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
@menus_bp.alt_response(404, schema=ErrorSchema)
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
        _sync_menu_items(menu, data['items'])

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
@menus_bp.alt_response(404, schema=ErrorSchema)
@editor_required
def publish_menu(menu_id):
    """Publish a menu (draft → published)."""
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
@menus_bp.alt_response(400, schema=ErrorSchema)
@menus_bp.alt_response(404, schema=ErrorSchema)
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
@menus_bp.alt_response(404, schema=ErrorSchema)
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

    db.session.delete(menu)  # CASCADE supprime items + images liées

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
# RUPTURE / STOCK (Mode Service)
# ============================================================

@menus_bp.route('/<int:menu_id>/items/<int:item_id>/stock', methods=['PATCH'])
@menus_bp.arguments(MenuItemStockSchema)
@menus_bp.response(200, MessageSchema)
@menus_bp.alt_response(404, schema=ErrorSchema)
@editor_required
def update_item_stock(data, menu_id, item_id):
    """Toggle out-of-stock status for a menu item (service mode).

    JSON body: `{ "is_out_of_stock": true }`
    """
    item = MenuItem.query.filter_by(id=item_id, menu_id=menu_id).first()
    if not item:
        return jsonify({'error': 'Item introuvable'}), 404

    item.is_out_of_stock = data['is_out_of_stock']
    db.session.commit()

    return jsonify({
        'message': 'Statut mis à jour',
        'item': item.to_dict(),
    }), 200


# ============================================================
# IMAGES DU MENU (photos uploadées directement)
# ============================================================

@menus_bp.route('/<int:menu_id>/images', methods=['POST'])
@menus_bp.response(201, MenuSchema)
@menus_bp.alt_response(400, schema=ErrorSchema)
@menus_bp.alt_response(404, schema=ErrorSchema)
@menus_bp.alt_response(503, schema=ErrorSchema)
@editor_required
def upload_menu_image(menu_id):
    """Upload an image for a menu (max 6, 5 MB each).

    Accepts JPEG, PNG, WebP, HEIC formats (converted to JPEG).
    Multipart/form-data with `file` field.
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
@menus_bp.alt_response(404, schema=ErrorSchema)
@editor_required
def delete_menu_image(menu_id, image_id):
    """Delete a menu image from S3 and database."""
    image = MenuImage.query.filter_by(id=image_id, menu_id=menu_id).first()
    if not image:
        return jsonify({'error': 'Image non trouvée'}), 404

    storage.delete_file(image.storage_key)
    db.session.delete(image)
    db.session.commit()

    return jsonify({'message': 'Image supprimée'}), 200


@menus_bp.route('/<int:menu_id>/images/reorder', methods=['PUT'])
@menus_bp.response(200, MenuSchema)
@menus_bp.alt_response(400, schema=ErrorSchema)
@menus_bp.alt_response(404, schema=ErrorSchema)
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
@menus_bp.alt_response(404, schema=ErrorSchema)
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
# IMAGES PAR ITEM (liens vers galerie)
# ============================================================

@menus_bp.route('/<int:menu_id>/items/<int:item_id>/images', methods=['POST'])
@menus_bp.response(200, MessageSchema)
@menus_bp.alt_response(400, schema=ErrorSchema)
@menus_bp.alt_response(404, schema=ErrorSchema)
@editor_required
def add_item_image(menu_id, item_id):
    """Link a gallery image to a specific menu item.

    JSON body: `{ "gallery_image_id": 12, "display_order": 0 }`
    Max 3 images per item.
    """
    item = MenuItem.query.filter_by(id=item_id, menu_id=menu_id).first()
    if not item:
        return jsonify({'error': 'Item introuvable'}), 404

    data = request.get_json() or {}
    gallery_image_id = data.get('gallery_image_id')
    if not gallery_image_id or not GalleryImage.query.get(gallery_image_id):
        return jsonify({'error': 'Image de galerie introuvable'}), 404

    existing_count = MenuItemImage.query.filter_by(menu_item_id=item_id).count()
    if existing_count >= 3:
        return jsonify({'error': 'Maximum 3 images par item'}), 400

    link = MenuItemImage(
        menu_item_id=item_id,
        gallery_image_id=gallery_image_id,
        display_order=data.get('display_order', existing_count),
    )
    db.session.add(link)
    db.session.commit()

    return jsonify({'message': 'Image liée', 'link': link.to_dict()}), 200


@menus_bp.route('/<int:menu_id>/items/<int:item_id>/images/<int:link_id>', methods=['DELETE'])
@menus_bp.response(200, MessageSchema)
@menus_bp.alt_response(404, schema=ErrorSchema)
@editor_required
def remove_item_image(menu_id, item_id, link_id):
    """Remove a gallery image link from a menu item (does not delete the photo)."""
    link = MenuItemImage.query.filter_by(
        id=link_id, menu_item_id=item_id
    ).first()
    if not link:
        return jsonify({'error': 'Lien non trouvé'}), 404

    # Vérifier que l'item appartient bien au menu
    item = MenuItem.query.filter_by(id=item_id, menu_id=menu_id).first()
    if not item:
        return jsonify({'error': 'Item introuvable'}), 404

    db.session.delete(link)
    db.session.commit()

    return jsonify({'message': 'Image retirée de l\'item'}), 200
