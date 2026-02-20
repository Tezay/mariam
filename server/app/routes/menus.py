"""
Routes de gestion des menus MARIAM.

Endpoints (protégés par rôle editor+) :
- GET /api/menus - Liste des menus (filtrable)
- GET /api/menus/week - Menus de la semaine courante
- GET /api/menus/:id - Détails d'un menu
- POST /api/menus - Créer/modifier un menu
- PUT /api/menus/:id - Modifier un menu
- POST /api/menus/:id/publish - Publier un menu
- POST /api/menus/week/publish - Publier toute la semaine
- POST /api/menus/:id/item-images - Lier des images galerie à un menu
- DELETE /api/menus/:id/item-images/:id - Retirer un lien image
"""
from datetime import date, datetime, timedelta
from functools import wraps
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..extensions import db
from ..models import User, Restaurant, Menu, MenuItem, MenuImage, AuditLog
from ..models import GalleryImage, GalleryImageTag, MenuItemImage
from ..services.storage import storage
from ..security import get_client_ip


menus_bp = Blueprint('menus', __name__)


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


def get_week_dates(reference_date=None):
    """Retourne les dates du lundi au dimanche de la semaine."""
    if reference_date is None:
        reference_date = date.today()
    
    # Trouver le lundi de la semaine
    monday = reference_date - timedelta(days=reference_date.weekday())
    
    return [monday + timedelta(days=i) for i in range(7)]


def get_default_restaurant():
    """Retourne le restaurant par défaut (premier de la liste)."""
    return Restaurant.query.filter_by(is_active=True).first()


@menus_bp.route('', methods=['GET'])
@jwt_required()
def list_menus():
    """Liste les menus avec filtres optionnels."""
    # Paramètres de filtrage
    restaurant_id = request.args.get('restaurant_id', type=int)
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    status = request.args.get('status')
    
    # Construction de la requête
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
    
    return jsonify({
        'menus': [menu.to_dict() for menu in menus]
    }), 200


@menus_bp.route('/week', methods=['GET'])
@jwt_required()
def get_week_menus():
    """Récupère les menus de la semaine."""
    # Paramètres
    week_offset = request.args.get('week_offset', 0, type=int)
    restaurant_id = request.args.get('restaurant_id', type=int)
    
    # Calculer les dates de la semaine
    reference_date = date.today() + timedelta(weeks=week_offset)
    week_dates = get_week_dates(reference_date)
    
    # Restaurant par défaut si non spécifié
    restaurant = None
    if not restaurant_id:
        restaurant = get_default_restaurant()
        if restaurant:
            restaurant_id = restaurant.id
    else:
        restaurant = Restaurant.query.get(restaurant_id)
    
    # Récupérer les jours de service
    service_days = restaurant.get_service_days() if restaurant else [0, 1, 2, 3, 4]
    
    # Récupérer les menus
    menus = {}
    for d in week_dates:
        menu = Menu.query.filter_by(restaurant_id=restaurant_id, date=d).first()
        menus[d.isoformat()] = menu.to_dict() if menu else None
    
    return jsonify({
        'week_start': week_dates[0].isoformat(),
        'week_end': week_dates[6].isoformat(),
        'restaurant_id': restaurant_id,
        'service_days': service_days,
        'menus': menus
    }), 200


@menus_bp.route('/<int:menu_id>', methods=['GET'])
@jwt_required()
def get_menu(menu_id):
    """Récupère un menu par ID."""
    menu = Menu.query.get(menu_id)
    
    if not menu:
        return jsonify({'error': 'Menu non trouvé'}), 404
    
    return jsonify({'menu': menu.to_dict()}), 200


@menus_bp.route('/by-date/<date_str>', methods=['GET'])
@jwt_required()
def get_menu_by_date(date_str):
    """Récupère un menu par date."""
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
        'restaurant_id': restaurant_id
    }), 200


@menus_bp.route('', methods=['POST'])
@editor_required
def create_or_update_menu():
    """Crée ou met à jour un menu pour une date donnée."""
    current_user_id = int(get_jwt_identity())
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'Données manquantes'}), 400
    
    # Récupérer la date
    date_str = data.get('date')
    if not date_str:
        return jsonify({'error': 'Date requise'}), 400
    
    try:
        menu_date = datetime.strptime(date_str, '%Y-%m-%d').date()
    except ValueError:
        return jsonify({'error': 'Format de date invalide (YYYY-MM-DD)'}), 400
    
    # Restaurant
    restaurant_id = data.get('restaurant_id')
    if not restaurant_id:
        restaurant = get_default_restaurant()
        if restaurant:
            restaurant_id = restaurant.id
        else:
            return jsonify({'error': 'Aucun restaurant configuré'}), 400
    
    # Chercher un menu existant ou en créer un nouveau
    menu = Menu.query.filter_by(restaurant_id=restaurant_id, date=menu_date).first()
    is_new = menu is None
    
    if is_new:
        menu = Menu(restaurant_id=restaurant_id, date=menu_date)
        db.session.add(menu)
        db.session.flush()  # Récupérer l'ID du menu pour les nouveaux menus
    else:
        # Supprimer les anciens items (only for existing menus)
        MenuItem.query.filter_by(menu_id=menu.id).delete()

    # Note du chef
    if 'chef_note' in data:
        menu.chef_note = data['chef_note'][:300] if data['chef_note'] else None
    
    # Mettre à jour les items
    items_data = data.get('items', [])
    
    # Ajouter les nouveaux items
    for idx, item_data in enumerate(items_data):
        item = MenuItem(
            menu_id=menu.id,
            category=item_data.get('category', 'plat'),
            name=item_data.get('name', ''),
            order=item_data.get('order', idx),
            is_vegetarian=item_data.get('is_vegetarian', False),
            is_halal=item_data.get('is_halal', False),
            is_pork_free=item_data.get('is_pork_free', False),
            allergens=item_data.get('allergens'),
            tags=item_data.get('tags'),
            certifications=item_data.get('certifications')
        )
        db.session.add(item)
    
    # Logger
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


@menus_bp.route('/<int:menu_id>', methods=['PUT'])
@editor_required
def update_menu(menu_id):
    """Met à jour un menu existant."""
    current_user_id = int(get_jwt_identity())
    menu = Menu.query.get(menu_id)
    
    if not menu:
        return jsonify({'error': 'Menu non trouvé'}), 404
    
    data = request.get_json()

    # Note du chef
    if 'chef_note' in data:
        menu.chef_note = data['chef_note'][:300] if data['chef_note'] else None
    
    # Mettre à jour les items si fournis
    if 'items' in data:
        # Supprimer les anciens items
        MenuItem.query.filter_by(menu_id=menu.id).delete()
        
        # Ajouter les nouveaux items
        for idx, item_data in enumerate(data['items']):
            item = MenuItem(
                menu_id=menu.id,
                category=item_data.get('category', 'plat'),
                name=item_data.get('name', ''),
                order=item_data.get('order', idx),
                is_vegetarian=item_data.get('is_vegetarian', False),
                is_halal=item_data.get('is_halal', False),
                is_pork_free=item_data.get('is_pork_free', False),
                allergens=item_data.get('allergens'),
                tags=item_data.get('tags'),
                certifications=item_data.get('certifications')
            )
            db.session.add(item)
    
    # Logger
    AuditLog.log(
        action=AuditLog.ACTION_MENU_UPDATE,
        user_id=current_user_id,
        target_type='menu',
        target_id=menu.id,
        details={'date': menu.date.isoformat()},
        ip_address=get_client_ip()
    )
    
    db.session.commit()
    
    return jsonify({
        'message': 'Menu mis à jour',
        'menu': menu.to_dict()
    }), 200


@menus_bp.route('/<int:menu_id>/publish', methods=['POST'])
@editor_required
def publish_menu(menu_id):
    """Publie un menu."""
    current_user_id = int(get_jwt_identity())
    menu = Menu.query.get(menu_id)
    
    if not menu:
        return jsonify({'error': 'Menu non trouvé'}), 404
    
    menu.status = 'published'
    menu.published_at = datetime.utcnow()
    menu.published_by_id = current_user_id
    
    # Logger
    AuditLog.log(
        action=AuditLog.ACTION_MENU_PUBLISH,
        user_id=current_user_id,
        target_type='menu',
        target_id=menu.id,
        details={'date': menu.date.isoformat()},
        ip_address=get_client_ip()
    )
    
    db.session.commit()
    
    return jsonify({
        'message': 'Menu publié',
        'menu': menu.to_dict()
    }), 200


@menus_bp.route('/week/publish', methods=['POST'])
@editor_required
def publish_week():
    """Publie tous les menus de la semaine."""
    current_user_id = int(get_jwt_identity())
    data = request.get_json() or {}
    
    week_offset = data.get('week_offset', 0)
    restaurant_id = data.get('restaurant_id')
    
    if not restaurant_id:
        restaurant = get_default_restaurant()
        if restaurant:
            restaurant_id = restaurant.id
    
    # Calculer les dates de la semaine
    reference_date = date.today() + timedelta(weeks=week_offset)
    week_dates = get_week_dates(reference_date)
    
    # Publier tous les menus de la semaine
    published_count = 0
    for d in week_dates:
        menu = Menu.query.filter_by(restaurant_id=restaurant_id, date=d).first()
        if menu and menu.status == 'draft':
            menu.status = 'published'
            menu.published_at = datetime.utcnow()
            menu.published_by_id = current_user_id
            published_count += 1
    
    # Logger
    AuditLog.log(
        action=AuditLog.ACTION_MENU_PUBLISH,
        user_id=current_user_id,
        details={
            'type': 'week_publish',
            'week_start': week_dates[0].isoformat(),
            'published_count': published_count
        },
        ip_address=get_client_ip()
    )
    
    db.session.commit()
    
    return jsonify({
        'message': f'{published_count} menu(s) publié(s)',
        'week_start': week_dates[0].isoformat(),
        'week_end': week_dates[6].isoformat()
    }), 200


# ========================================
# IMAGES DU MENU (photos du jour)
# ========================================

@menus_bp.route('/<int:menu_id>/images', methods=['POST'])
@editor_required
def upload_menu_image(menu_id):
    """Upload une image pour un menu. Max 6, 5 MB chacune."""
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

    # Conversion HEIC/HEIF -> JPEG si nécessaire
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

    return jsonify({
        'message': 'Image uploadée',
        'image': image.to_dict()
    }), 201


@menus_bp.route('/<int:menu_id>/images/<int:image_id>', methods=['DELETE'])
@editor_required
def delete_menu_image(menu_id, image_id):
    """Supprime une image d'un menu."""
    image = MenuImage.query.filter_by(id=image_id, menu_id=menu_id).first()
    if not image:
        return jsonify({'error': 'Image non trouvée'}), 404

    storage.delete_file(image.storage_key)
    db.session.delete(image)
    db.session.commit()

    return jsonify({'message': 'Image supprimée'}), 200


@menus_bp.route('/<int:menu_id>/images/reorder', methods=['PUT'])
@editor_required
def reorder_menu_images(menu_id):
    """Réordonne les images d'un menu. Body: { "image_ids": [3, 1, 2] }"""
    menu = Menu.query.get(menu_id)
    if not menu:
        return jsonify({'error': 'Menu non trouvé'}), 404

    data = request.get_json()
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
        'images': [img.to_dict() for img in menu.images.order_by(MenuImage.order)]
    }), 200


@menus_bp.route('/<int:menu_id>/chef-note', methods=['PUT'])
@editor_required
def update_chef_note(menu_id):
    """Met à jour la note du chef pour un menu."""
    menu = Menu.query.get(menu_id)
    if not menu:
        return jsonify({'error': 'Menu non trouvé'}), 404

    data = request.get_json()
    menu.chef_note = data.get('chef_note', '')[:300] if data.get('chef_note') else None
    db.session.commit()

    return jsonify({
        'message': 'Note du chef mise à jour',
        'menu': menu.to_dict()
    }), 200


# ========================================
# IMAGES PAR CATÉGORIE (galerie)
# ========================================

@menus_bp.route('/<int:menu_id>/item-images', methods=['POST'])
@editor_required
def sync_item_images(menu_id):
    """Synchronise les images par catégorie d'un menu.

    Remplace toutes les associations MenuItemImage existantes.

    Body JSON :
        item_images: [
            {
                gallery_image_id: int,
                category: str,       # 'entree', 'plat', etc.
                item_index: int,     # index dans la catégorie
                display_order: int   # ordre d'affichage
            }
        ]
    """
    menu = Menu.query.get(menu_id)
    if not menu:
        return jsonify({'error': 'Menu non trouvé'}), 404

    data = request.get_json()
    new_links = data.get('item_images', [])

    # Supprimer les anciennes associations
    MenuItemImage.query.filter_by(menu_id=menu_id).delete()

    # Créer les nouvelles
    for idx, link in enumerate(new_links):
        gid = link.get('gallery_image_id')
        if not gid:
            continue
        # Vérifier que l'image existe
        if not GalleryImage.query.get(gid):
            continue
        db.session.add(MenuItemImage(
            menu_id=menu_id,
            gallery_image_id=gid,
            category=link.get('category', ''),
            item_index=link.get('item_index', 0),
            display_order=link.get('display_order', idx),
        ))

    db.session.commit()

    # Retourner les nouvelles associations
    item_imgs = MenuItemImage.query.filter_by(menu_id=menu_id).order_by(
        MenuItemImage.category, MenuItemImage.item_index, MenuItemImage.display_order
    ).all()

    return jsonify({
        'message': 'Images par catégorie mises à jour',
        'item_images': [img.to_dict() for img in item_imgs],
    }), 200


@menus_bp.route('/<int:menu_id>/item-images/<int:link_id>', methods=['DELETE'])
@editor_required
def remove_item_image(menu_id, link_id):
    """Retire un lien image-menu (ne supprime pas la photo de la galerie)."""
    link = MenuItemImage.query.filter_by(id=link_id, menu_id=menu_id).first()
    if not link:
        return jsonify({'error': 'Lien non trouvé'}), 404

    db.session.delete(link)
    db.session.commit()

    return jsonify({'message': 'Image retirée du menu'}), 200
