"""
Routes publiques MARIAM - Affichage sans authentification.

Ces routes sont accessibles publiquement pour :
- Les écrans TV dans les restaurants
- Les étudiants sur mobile
- Toute personne souhaitant consulter le menu

Endpoints :
- GET /api/public/menu/today - Menu du jour
- GET /api/public/menu/tomorrow - Menu de demain
- GET /api/public/menu/week - Menus de la semaine
- GET /api/public/events - Événements à venir
- GET /api/public/restaurant - Infos du restaurant
"""
from datetime import date, timedelta
from flask import Blueprint, request, jsonify
from ..models import Restaurant, Menu, Event


public_bp = Blueprint('public', __name__)


def get_default_restaurant():
    """Retourne le restaurant par défaut."""
    return Restaurant.query.filter_by(is_active=True).first()


def get_week_dates(reference_date=None):
    """Retourne les dates du lundi au dimanche de la semaine."""
    if reference_date is None:
        reference_date = date.today()
    
    monday = reference_date - timedelta(days=reference_date.weekday())
    return [monday + timedelta(days=i) for i in range(7)]


def format_menu_for_display(menu):
    """Formate un menu pour l'affichage public.
    
    Retourne les items groupés par catégorie de façon dynamique,
    plus une liste complète des items pour l'affichage flexible.
    """
    if not menu:
        return None
    
    items_by_category = menu.get_items_by_category()
    items_list = [item.to_dict() for item in menu.items]
    
    # Retourne les catégories dynamiques + items complets + rétrocompatibilité
    result = {
        'date': menu.date.isoformat(),
        'items': items_list,  # Liste complète pour l'itération
        'by_category': items_by_category,  # Groupé par catégorie dynamique
        # Rétrocompatibilité avec anciens clefs (si présentes)
        'entrees': items_by_category.get('entree', []),
        'plat': items_by_category.get('plat', []),
        'vg': items_by_category.get('vg', []),
        'desserts': items_by_category.get('dessert', [])
    }
    
    return result


@public_bp.route('/menu/today', methods=['GET'])
def get_today_menu():
    """Récupère le menu du jour."""
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
    
    return jsonify({
        'date': today.isoformat(),
        'day_name': ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'][today.weekday()],
        'restaurant': restaurant.to_dict(include_config=True) if restaurant else None,
        'menu': format_menu_for_display(menu)
    }), 200


@public_bp.route('/menu/tomorrow', methods=['GET'])
def get_tomorrow_menu():
    """Récupère le menu de demain."""
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
    
    return jsonify({
        'date': tomorrow.isoformat(),
        'day_name': ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'][tomorrow.weekday()],
        'restaurant': restaurant.to_dict(include_config=True) if restaurant else None,
        'menu': format_menu_for_display(menu)
    }), 200


@public_bp.route('/menu/week', methods=['GET'])
def get_week_menu():
    """Récupère les menus de la semaine courante."""
    restaurant_id = request.args.get('restaurant_id', type=int)
    week_offset = request.args.get('week_offset', 0, type=int)
    
    if not restaurant_id:
        restaurant = get_default_restaurant()
        if restaurant:
            restaurant_id = restaurant.id
        else:
            return jsonify({'error': 'Aucun restaurant configuré', 'menus': {}}), 200
    
    # Calculer les dates de la semaine
    reference_date = date.today() + timedelta(weeks=week_offset)
    week_dates = get_week_dates(reference_date)
    
    day_names = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
    
    # Récupérer les menus publiés
    menus = {}
    for i, d in enumerate(week_dates):
        menu = Menu.query.filter_by(
            restaurant_id=restaurant_id,
            date=d,
            status='published'
        ).first()
        
        menus[d.isoformat()] = {
            'day_name': day_names[i],
            'menu': format_menu_for_display(menu)
        }
    
    restaurant = Restaurant.query.get(restaurant_id)
    
    return jsonify({
        'week_start': week_dates[0].isoformat(),
        'week_end': week_dates[6].isoformat(),
        'restaurant': restaurant.to_dict() if restaurant else None,
        'menus': menus
    }), 200


@public_bp.route('/events', methods=['GET'])
def get_public_events():
    """Récupère les événements à venir."""
    restaurant_id = request.args.get('restaurant_id', type=int)
    visibility = request.args.get('visibility')  # 'tv', 'mobile', ou rien pour tous
    limit = request.args.get('limit', 5, type=int)
    
    if not restaurant_id:
        restaurant = get_default_restaurant()
        if restaurant:
            restaurant_id = restaurant.id
        else:
            return jsonify({'events': []}), 200
    
    # Requête de base : événements actifs à venir
    query = Event.query.filter(
        Event.restaurant_id == restaurant_id,
        Event.is_active == True,
        Event.event_date >= date.today()
    )
    
    # Filtrer par visibilité
    if visibility in ['tv', 'mobile']:
        query = query.filter(
            (Event.visibility == visibility) | (Event.visibility == 'all')
        )
    
    events = query.order_by(Event.event_date.asc()).limit(limit).all()
    
    return jsonify({
        'events': [event.to_dict() for event in events]
    }), 200


@public_bp.route('/restaurant', methods=['GET'])
def get_restaurant_info():
    """Récupère les informations du restaurant avec sa configuration."""
    restaurant_id = request.args.get('restaurant_id', type=int)
    
    if restaurant_id:
        restaurant = Restaurant.query.get(restaurant_id)
    else:
        restaurant = get_default_restaurant()
    
    if not restaurant:
        return jsonify({'error': 'Restaurant non trouvé', 'restaurant': None}), 200
    
    return jsonify({
        'restaurant': restaurant.to_dict(include_config=True)
    }), 200

