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
from ..models.gallery import MenuItemImage


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
    Inclut les images du menu et la note du chef.
    """
    if not menu:
        return None
    
    items_by_category = menu.get_items_by_category()
    items_list = [item.to_dict() for item in menu.items]
    images_list = [img.to_dict() for img in menu.images] if hasattr(menu, 'images') else []

    # Images galerie par catégorie (nouveau système)
    item_images_list = []
    try:
        item_imgs = MenuItemImage.query.filter_by(menu_id=menu.id).order_by(
            MenuItemImage.category, MenuItemImage.item_index, MenuItemImage.display_order
        ).all()
        item_images_list = [img.to_dict() for img in item_imgs]
    except Exception:
        pass

    # Fusionner les images des deux systèmes pour l'affichage
    # (ancien MenuImage + nouveau MenuItemImage → liste unifiée pour le carousel TV)
    all_display_images = list(images_list)
    for ii in item_images_list:
        if ii.get('url'):
            all_display_images.append({
                'id': ii['id'],
                'url': ii['url'],
                'filename': ii.get('filename'),
                'order': ii.get('display_order', len(all_display_images)),
            })
    
    # Retourne les catégories dynamiques + items complets + rétrocompatibilité
    result = {
        'date': menu.date.isoformat(),
        'items': items_list,  # Liste complète pour l'itération
        'by_category': items_by_category,  # Groupé par catégorie dynamique
        'images': all_display_images,  # Photos du menu (tous systèmes fusionnés)
        'item_images': item_images_list,  # Détail par catégorie (nouveau système)
        'chef_note': menu.chef_note,  # Note du chef
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
    """Récupère les événements publiés à venir (avec images).

    Retourne séparément l'événement du jour et les événements à venir
    pour permettre un affichage différencié côté frontend.
    """
    restaurant_id = request.args.get('restaurant_id', type=int)
    visibility = request.args.get('visibility')  # 'tv', 'mobile', ou rien pour tous
    limit = request.args.get('limit', 5, type=int)

    if not restaurant_id:
        restaurant = get_default_restaurant()
        if restaurant:
            restaurant_id = restaurant.id
        else:
            return jsonify({'today_event': None, 'upcoming_events': [], 'events': []}), 200

    # Requête de base : événements publiés et actifs, aujourd'hui et à venir
    query = Event.query.filter(
        Event.restaurant_id == restaurant_id,
        Event.is_active == True,
        Event.status == 'published',
        Event.event_date >= date.today(),
    )

    # Filtrer par visibilité
    if visibility in ['tv', 'mobile']:
        query = query.filter(
            (Event.visibility == visibility) | (Event.visibility == 'all')
        )

    events = query.order_by(Event.event_date.asc()).limit(limit).all()

    # Séparer l'événement du jour des événements à venir
    today = date.today()
    today_event = None
    upcoming_events = []

    for event in events:
        if event.event_date == today:
            today_event = event.to_dict(include_images=True)
        else:
            upcoming_events.append(event.to_dict(include_images=True))

    return jsonify({
        'today_event': today_event,
        'upcoming_events': upcoming_events,
        # Rétrocompatibilité
        'events': [event.to_dict(include_images=True) for event in events],
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

