"""
Routes de gestion des événements MARIAM.

Endpoints (protégés par rôle editor+) :
- GET /api/events - Liste des événements
- GET /api/events/:id - Détails d'un événement
- POST /api/events - Créer un événement
- PUT /api/events/:id - Modifier un événement
- DELETE /api/events/:id - Supprimer un événement
"""
from datetime import date, datetime
from functools import wraps
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..extensions import db
from ..models import User, Restaurant, Event, AuditLog


events_bp = Blueprint('events', __name__)


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


def get_default_restaurant():
    """Retourne le restaurant par défaut."""
    return Restaurant.query.filter_by(is_active=True).first()


@events_bp.route('', methods=['GET'])
@jwt_required()
def list_events():
    """Liste les événements."""
    # Paramètres de filtrage
    restaurant_id = request.args.get('restaurant_id', type=int)
    upcoming_only = request.args.get('upcoming', 'true').lower() == 'true'
    include_inactive = request.args.get('include_inactive', 'false').lower() == 'true'
    
    # Construction de la requête
    query = Event.query
    
    if restaurant_id:
        query = query.filter_by(restaurant_id=restaurant_id)
    
    if upcoming_only:
        query = query.filter(Event.event_date >= date.today())
    
    if not include_inactive:
        query = query.filter_by(is_active=True)
    
    events = query.order_by(Event.event_date.asc()).limit(50).all()
    
    return jsonify({
        'events': [event.to_dict() for event in events]
    }), 200


@events_bp.route('/<int:event_id>', methods=['GET'])
@jwt_required()
def get_event(event_id):
    """Récupère un événement par ID."""
    event = Event.query.get(event_id)
    
    if not event:
        return jsonify({'error': 'Événement non trouvé'}), 404
    
    return jsonify({'event': event.to_dict()}), 200


@events_bp.route('', methods=['POST'])
@editor_required
def create_event():
    """Crée un nouvel événement."""
    current_user_id = int(get_jwt_identity())
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'Données manquantes'}), 400
    
    # Validation
    title = data.get('title')
    event_date_str = data.get('event_date')
    
    if not title or not event_date_str:
        return jsonify({'error': 'Titre et date requis'}), 400
    
    try:
        event_date = datetime.strptime(event_date_str, '%Y-%m-%d').date()
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
    
    # Validation de la visibilité
    visibility = data.get('visibility', 'all')
    if visibility not in Event.VALID_VISIBILITY:
        return jsonify({'error': f'Visibilité invalide. Valeurs: {Event.VALID_VISIBILITY}'}), 400
    
    event = Event(
        restaurant_id=restaurant_id,
        title=title,
        description=data.get('description'),
        event_date=event_date,
        visibility=visibility,
        created_by_id=current_user_id
    )
    db.session.add(event)
    
    # Logger
    AuditLog.log(
        action=AuditLog.ACTION_EVENT_CREATE,
        user_id=current_user_id,
        target_type='event',
        details={'title': title, 'date': event_date_str},
        ip_address=get_client_ip()
    )
    
    db.session.commit()
    
    return jsonify({
        'message': 'Événement créé',
        'event': event.to_dict()
    }), 201


@events_bp.route('/<int:event_id>', methods=['PUT'])
@editor_required
def update_event(event_id):
    """Modifie un événement."""
    current_user_id = int(get_jwt_identity())
    event = Event.query.get(event_id)
    
    if not event:
        return jsonify({'error': 'Événement non trouvé'}), 404
    
    data = request.get_json()
    
    if 'title' in data:
        event.title = data['title']
    
    if 'description' in data:
        event.description = data['description']
    
    if 'event_date' in data:
        try:
            event.event_date = datetime.strptime(data['event_date'], '%Y-%m-%d').date()
        except ValueError:
            return jsonify({'error': 'Format de date invalide (YYYY-MM-DD)'}), 400
    
    if 'visibility' in data:
        if data['visibility'] in Event.VALID_VISIBILITY:
            event.visibility = data['visibility']
        else:
            return jsonify({'error': f'Visibilité invalide. Valeurs: {Event.VALID_VISIBILITY}'}), 400
    
    if 'is_active' in data:
        event.is_active = data['is_active']
    
    # Logger
    AuditLog.log(
        action=AuditLog.ACTION_EVENT_UPDATE,
        user_id=current_user_id,
        target_type='event',
        target_id=event.id,
        details={'changes': data},
        ip_address=get_client_ip()
    )
    
    db.session.commit()
    
    return jsonify({
        'message': 'Événement mis à jour',
        'event': event.to_dict()
    }), 200


@events_bp.route('/<int:event_id>', methods=['DELETE'])
@editor_required
def delete_event(event_id):
    """Supprime un événement."""
    current_user_id = int(get_jwt_identity())
    event = Event.query.get(event_id)
    
    if not event:
        return jsonify({'error': 'Événement non trouvé'}), 404
    
    # Logger avant suppression
    AuditLog.log(
        action=AuditLog.ACTION_EVENT_DELETE,
        user_id=current_user_id,
        target_type='event',
        target_id=event.id,
        details={'title': event.title},
        ip_address=get_client_ip()
    )
    
    db.session.delete(event)
    db.session.commit()
    
    return jsonify({'message': 'Événement supprimé'}), 200
