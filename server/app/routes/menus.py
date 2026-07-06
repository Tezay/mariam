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
- GET  /v1/menus/<id>/substitutions                  Substitution dishes by category
- PUT  /v1/menus/<id>/substitutions/<category_id>    Set substitutions for a category
"""
from datetime import UTC, datetime, timedelta

from flask import jsonify, request
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request
from flask_smorest import Blueprint

from ..extensions import db
from ..models import (
    AuditLog,
    DishCatalog,
    Menu,
    MenuImage,
    MenuItem,
    Restaurant,
    User,
)
from ..models.catalog import CategorySubstitution
from ..models.category import MenuCategory
from ..schemas.common import ErrorSchema, MessageSchema
from ..schemas.menus import (
    MenuCreateSchema,
    MenuItemStockSchema,
    MenuListSchema,
    MenuSchema,
    MenuUpdateSchema,
    PublicDayMenuSchema,
    WeekMenuSchema,
)
from ..security import get_client_ip, limiter
from ..services import holidays
from ..services.storage import storage
from ..utils.time import PARIS_TZ, paris_today
from .helpers import (
    editor_required,
    get_default_restaurant,
    get_or_create_dish,
    get_user_and_restaurant,
)

menus_bp = Blueprint(
    'menus', __name__,
    description='Menus — Public display and editor management'
)


# ============================================================
# HELPERS
# ============================================================

def get_week_dates(reference_date=None):
    """Retourne les dates du lundi au dimanche de la semaine."""
    if reference_date is None:
        reference_date = paris_today()
    monday = reference_date - timedelta(days=reference_date.weekday())
    return [monday + timedelta(days=i) for i in range(7)]


def _get_menu_scoped(menu_id):
    """
    Retourne le menu seulement s'il appartient au restaurant de l'utilisateur courant.
    """
    _, restaurant = get_user_and_restaurant()
    if not restaurant:
        return None
    return Menu.query.filter_by(id=menu_id, restaurant_id=restaurant.id).first()


def _sync_menu_items(menu, items_data):
    """Met à jour les items d'un menu avec une logique diff (UPDATE/INSERT/DELETE).

    - Les items existants dont l'id est fourni sont mis à jour en place.
    - Les nouveaux items (sans id ou id inconnu) sont insérés.
    - Les items existants absents du payload sont supprimés.
    """
    restaurant_id = menu.restaurant_id
    existing = {item.id: item for item in menu.items}
    incoming_ids = set()

    for idx, item_data in enumerate(items_data):
        item_id = item_data.get('id')
        category_id = item_data.get('category_id')

        if item_id and item_id in existing:
            item = existing[item_id]
            item.category_id = category_id or item.category_id
            item.order = item_data.get('order', idx)
            item.is_out_of_stock = item_data.get('is_out_of_stock', item.is_out_of_stock)
            # Mise à jour du plat si dish_id fourni
            new_dish_id = item_data.get('dish_id')
            if new_dish_id and new_dish_id != item.dish_id:
                dish = DishCatalog.query.filter_by(
                    id=new_dish_id, restaurant_id=restaurant_id
                ).first()
                if dish:
                    item.dish_id = dish.id
            incoming_ids.add(item_id)
        else:
            dish = get_or_create_dish(restaurant_id, item_data)
            if not dish:
                continue
            item = MenuItem(
                menu_id=menu.id,
                category_id=category_id,
                dish_id=dish.id,
                order=item_data.get('order', idx),
                is_out_of_stock=item_data.get('is_out_of_stock', False),
            )
            db.session.add(item)
            db.session.flush()
            incoming_ids.add(item.id)

    # Supprimer les items retirés du payload
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
            'is_highlighted': cat.is_highlighted,
            'is_protected': cat.is_protected,
            'order': cat.order,
            'color_key': cat.color_key,
        }
        if cat.subcategories:
            subcats = []
            for sub in sorted(cat.subcategories, key=lambda s: s.order):
                subcats.append({
                    'id': sub.id,
                    'label': sub.label,
                    'is_highlighted': sub.is_highlighted,
                    'is_protected': sub.is_protected,
                    'order': sub.order,
                    'color_key': sub.color_key,
                    'items': items_by_cat.get(sub.id, []),
                })
            cat_dict['subcategories'] = subcats
        else:
            cat_dict['items'] = items_by_cat.get(cat.id, [])
        by_category.append(cat_dict)

    images_list = [img.to_dict() for img in menu.images] if hasattr(menu, 'images') else []

    # Plats de substitution par catégorie (affichés si is_out_of_stock)
    category_ids = list({item.category_id for item in menu.items})
    subs_by_cat: dict[int, list] = {}
    if category_ids:
        subs = CategorySubstitution.query.filter(
            CategorySubstitution.menu_id == menu.id,
            CategorySubstitution.category_id.in_(category_ids),
        ).order_by(CategorySubstitution.category_id, CategorySubstitution.order).all()
        for s in subs:
            subs_by_cat.setdefault(s.category_id, []).append(s.to_dict())

    return {
        'date': menu.date.isoformat(),
        'items': [item.to_dict() for item in menu.items],
        'by_category': by_category,
        'images': images_list,
        'chef_note': menu.chef_note,
        'substitutions': subs_by_cat,
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

    today = paris_today()
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

    tomorrow = paris_today() + timedelta(days=1)
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
    user = None
    try:
        verify_jwt_in_request(optional=True)
        identity = get_jwt_identity()
        if identity:
            user = User.query.get(int(identity))
            is_editor = user is not None and user.is_editor()
    except Exception:
        pass

    if is_editor:
        if user.restaurant_id:
            restaurant = Restaurant.query.get(user.restaurant_id)
        else:
            restaurant = get_default_restaurant()
        if not restaurant:
            return jsonify({'error': 'Aucun restaurant configuré', 'menus': {}}), 200
        restaurant_id = restaurant.id
    elif restaurant_id:
        restaurant = Restaurant.query.get(restaurant_id)
    else:
        restaurant = get_default_restaurant()
        if restaurant:
            restaurant_id = restaurant.id
        else:
            return jsonify({'error': 'Aucun restaurant configuré', 'menus': {}}), 200

    reference_date = paris_today() + timedelta(weeks=week_offset)
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
    """List menus of the current user's restaurant, with optional filters.

    Query params: `start_date`, `end_date`, `status`
    """
    _, restaurant = get_user_and_restaurant()
    if not restaurant:
        return jsonify({'menus': []}), 200

    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    status = request.args.get('status')

    query = Menu.query.filter_by(restaurant_id=restaurant.id)

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

    _, restaurant = get_user_and_restaurant()
    if not restaurant:
        return jsonify({'error': 'Aucun restaurant configuré'}), 400
    restaurant_id = restaurant.id

    menu = Menu.query.filter_by(restaurant_id=restaurant_id, date=menu_date).first()
    is_new = menu is None

    if is_new:
        menu = Menu(restaurant_id=restaurant_id, date=menu_date)
        db.session.add(menu)
        db.session.flush()

    if 'chef_note' in data:
        menu.chef_note = data['chef_note'][:300] if data['chef_note'] else None

    items_payload = data.get('items', [])
    _sync_menu_items(menu, items_payload)

    if not items_payload:
        menu.status = 'draft'
        menu.published_at = None
        menu.published_by_id = None

    if is_new or menu.status == 'published':
        AuditLog.log(
            action=AuditLog.ACTION_MENU_CREATE if is_new else AuditLog.ACTION_MENU_UPDATE,
            user_id=current_user_id,
            target_type='menu',
            target_id=menu.id,
            details={'date': date_str, 'items_count': len(items_payload)},
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

    Optional JSON body: `{ "week_offset": 0 }`
    """
    current_user_id = int(get_jwt_identity())

    week_offset = data.get('week_offset', 0)
    _, restaurant = get_user_and_restaurant()
    if not restaurant:
        return jsonify({'error': 'Aucun restaurant configuré'}), 400
    restaurant_id = restaurant.id

    reference_date = paris_today() + timedelta(weeks=week_offset)
    week_dates = get_week_dates(reference_date)

    published_count = 0
    for d in week_dates:
        menu = Menu.query.filter_by(restaurant_id=restaurant_id, date=d).first()
        if menu and menu.status == 'draft':
            menu.status = 'published'
            menu.published_at = datetime.now(UTC)
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

    _, restaurant = get_user_and_restaurant()
    if not restaurant:
        return jsonify({'error': 'Aucun restaurant configuré'}), 400
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
    menu = _get_menu_scoped(menu_id)
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
    menu = _get_menu_scoped(menu_id)
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
@menus_bp.alt_response(400, schema=ErrorSchema)
@menus_bp.alt_response(404, schema=ErrorSchema)
@editor_required
def publish_menu(menu_id):
    """Publish a menu (draft → published)."""
    current_user_id = int(get_jwt_identity())
    menu = _get_menu_scoped(menu_id)
    if not menu:
        return jsonify({'error': 'Menu non trouvé'}), 404

    if menu.items.count() == 0:
        return jsonify({'error': 'Impossible de publier un menu vide'}), 400

    menu.status = 'published'
    menu.published_at = datetime.now(UTC)
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
    menu = _get_menu_scoped(menu_id)
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
    menu = _get_menu_scoped(menu_id)
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
    menu = _get_menu_scoped(menu_id)
    if not menu:
        return jsonify({'error': 'Menu non trouvé'}), 404

    item = MenuItem.query.filter_by(id=item_id, menu_id=menu.id).first()
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
    menu = _get_menu_scoped(menu_id)
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
    menu = _get_menu_scoped(menu_id)
    if not menu:
        return jsonify({'error': 'Menu non trouvé'}), 404

    image = MenuImage.query.filter_by(id=image_id, menu_id=menu.id).first()
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
    menu = _get_menu_scoped(menu_id)
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
    menu = _get_menu_scoped(menu_id)
    if not menu:
        return jsonify({'error': 'Menu non trouvé'}), 404

    data = request.get_json() or {}
    menu.chef_note = data.get('chef_note', '')[:300] if data.get('chef_note') else None
    db.session.commit()

    return jsonify({'message': 'Note du chef mise à jour', 'menu': menu.to_dict()}), 200


# ============================================================
# SUBSTITUTIONS PAR CATÉGORIE (per-menu)
# ============================================================

@menus_bp.route('/<int:menu_id>/substitutions', methods=['GET'])
@editor_required
def get_menu_substitutions(menu_id):
    """Retourne les substituts de toutes les catégories pour ce menu.

    Response: { "substitutions": { "<category_id>": [{"dish": {...}, "order": 0}, ...] } }
    """
    menu = _get_menu_scoped(menu_id)
    if not menu:
        return jsonify({'error': 'Menu non trouvé'}), 404

    subs: dict[str, list] = {}
    for s in CategorySubstitution.query.filter_by(menu_id=menu_id).order_by(CategorySubstitution.order).all():
        key = str(s.category_id)
        if key not in subs:
            subs[key] = []
        subs[key].append({'dish': s.dish.to_dict() if s.dish else None, 'order': s.order})

    return jsonify({'substitutions': subs}), 200


@menus_bp.route('/<int:menu_id>/substitutions/<int:category_id>', methods=['PUT'])
@editor_required
def set_menu_category_substitutions(menu_id, category_id):
    """Définit les substituts pour une catégorie dans ce menu.

    Body: { "dish_ids": [1, 2, 3] }  (ordonnés par priorité, max 3)
    Remplace la liste existante pour cette catégorie.
    """
    menu = _get_menu_scoped(menu_id)
    if not menu:
        return jsonify({'error': 'Menu non trouvé'}), 404

    data = request.get_json(silent=True) or {}
    dish_ids = data.get('dish_ids', [])[:3]  # max 3 substituts

    # Supprimer les substitutions existantes pour ce menu + catégorie
    CategorySubstitution.query.filter_by(menu_id=menu_id, category_id=category_id).delete()

    for order, dish_id in enumerate(dish_ids):
        dish = DishCatalog.query.filter_by(id=dish_id, restaurant_id=menu.restaurant_id).first()
        if not dish:
            continue
        sub = CategorySubstitution(
            menu_id=menu_id,
            category_id=category_id,
            dish_id=dish_id,
            order=order,
        )
        db.session.add(sub)

    db.session.commit()

    result = CategorySubstitution.query.filter_by(
        menu_id=menu_id, category_id=category_id
    ).order_by(CategorySubstitution.order).all()
    return jsonify({
        'substitutions': [{'dish': s.dish.to_dict() if s.dish else None, 'order': s.order} for s in result]
    }), 200


# ============================================================
# JOURS FÉRIÉS (public, proxy data.gouv.fr + cache Redis)
# ============================================================

@menus_bp.route('/jours-feries/<int:year>', methods=['GET'])
@limiter.limit('30 per minute')
def get_jours_feries(year):
    """Retourne les jours fériés français pour une année donnée.

    Source : https://calendrier.api.gouv.fr/jours-feries/metropole/<year>.json
    Cache Redis 24h (voir services/holidays.py).
    Response: [ { "date": "2026-01-01", "description": "Jour de l'An" }, ... ]
    """
    if year < 2020 or year > 2040:
        return jsonify({'error': 'Année hors plage (2020-2040)'}), 400

    result = holidays.get_jours_feries(year)
    if result is None:
        return jsonify({'error': 'Impossible de charger les jours fériés'}), 502

    return jsonify({'jours_feries': result}), 200


# ============================================================
# VACANCES SCOLAIRES (proxy education.gouv.fr + cache Redis)
# ============================================================

@menus_bp.route('/vacances-scolaires/<int:year>', methods=['GET'])
@editor_required
def get_vacances_scolaires(year):
    """Retourne les vacances scolaires françaises pour une année donnée.

    Source : API data.education.gouv.fr (calendrier scolaire).
    Cache Redis 24h. Zone : A, B ou C.
    Response: { vacances: [{ start_date, end_date, description }] }
    """
    import json as _json

    import requests as http_requests

    from ..security import _get_blacklist_redis

    if year < 2020 or year > 2040:
        return jsonify({'error': 'Année hors plage (2020-2040)'}), 400

    zone = request.args.get('zone', '').upper()
    if zone not in ('A', 'B', 'C'):
        zone = 'A'

    cache_key = f'vacances_scolaires:{year}:{zone}'
    r = _get_blacklist_redis()

    if r:
        try:
            cached = r.get(cache_key)
            if cached:
                return jsonify({'vacances': _json.loads(cached)}), 200
        except Exception:
            pass

    # API data.education.gouv.fr
    try:
        zones_map = {'A': 'Zone A', 'B': 'Zone B', 'C': 'Zone C'}
        zone_name = zones_map.get(zone, 'Zone A')

        resp = http_requests.get(
            'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/'
            'fr-en-calendrier-scolaire/records',
            params={
                'where': (
                    f'(zones="{zone_name}" AND annee_scolaire="{year-1}-{year}") OR '
                    f'(zones="{zone_name}" AND annee_scolaire="{year}-{year+1}")'
                ),
                'limit': 100,
                'order_by': 'start_date',
            },
            timeout=8,
        )
        resp.raise_for_status()
        records = resp.json().get('results', [])

        # L'API renvoie un enregistrement par académie, on déduplique par description + dates
        def _to_paris_date(value: str) -> str:
            dt = datetime.fromisoformat(value)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=UTC)
            return dt.astimezone(PARIS_TZ).date().isoformat()

        deduped: dict[tuple[str, str, str], dict] = {}
        for rec in records:
            raw_start = rec.get('start_date')
            raw_end = rec.get('end_date')
            if not raw_start or not raw_end:
                continue
            start = _to_paris_date(raw_start)
            end = _to_paris_date(raw_end)
            desc = rec.get('description', '')
            deduped[(desc, start, end)] = {
                'start_date': start,
                'end_date': end,
                'description': desc,
            }

        result = sorted(deduped.values(), key=lambda v: v['start_date'])

    except Exception:
        return jsonify({'error': 'Impossible de charger les vacances scolaires'}), 502

    if r and result:
        try:
            r.setex(cache_key, 86400, _json.dumps(result))
        except Exception:
            pass

    return jsonify({'vacances': result}), 200


