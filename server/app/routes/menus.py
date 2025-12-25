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
"""
from datetime import date, datetime, timedelta
from functools import wraps
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..extensions import db
from ..models import User, Restaurant, Menu, MenuItem, AuditLog


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


def get_client_ip():
    """Récupère l'adresse IP du client."""
    if request.headers.get('X-Forwarded-For'):
        return request.headers.get('X-Forwarded-For').split(',')[0].strip()
    return request.remote_addr


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
