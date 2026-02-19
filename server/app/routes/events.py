"""
Routes de gestion des événements MARIAM.

Endpoints (protégés par rôle editor+) :
- GET    /api/events              - Liste des événements
- GET    /api/events/:id          - Détails d'un événement
- POST   /api/events              - Créer un événement
- PUT    /api/events/:id          - Modifier un événement
- DELETE /api/events/:id          - Supprimer un événement
- POST   /api/events/:id/publish  - Publier un événement
- POST   /api/events/:id/unpublish - Dépublier un événement
- POST   /api/events/:id/duplicate - Dupliquer un événement
- POST   /api/events/:id/images   - Ajouter une image
- DELETE /api/events/:id/images/:img_id - Supprimer une image
- PUT    /api/events/:id/images/reorder - Réordonner les images
- GET    /api/events/storage-status - Vérifier si S3 est configuré
"""
from datetime import date, datetime, timedelta
from functools import wraps
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..extensions import db
from ..models import User, Restaurant, Event, EventImage, AuditLog
from ..services.storage import storage


events_bp = Blueprint('events', __name__)


# ========================================
# DÉCORATEURS & UTILITAIRES
# ========================================

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


# ========================================
# ROUTES CRUD ÉVÉNEMENTS
# ========================================

@events_bp.route('', methods=['GET'])
@jwt_required()
def list_events():
    """Liste les événements avec filtres optionnels.

    Query params :
    - upcoming (bool, default true) : filtrer les événements à venir
    - include_inactive (bool, default false) : inclure les inactifs
    - status (string) : filtrer par statut (draft/published)
    - restaurant_id (int) : filtrer par restaurant
    """
    restaurant_id = request.args.get('restaurant_id', type=int)
    upcoming_only = request.args.get('upcoming', 'true').lower() == 'true'
    include_inactive = request.args.get('include_inactive', 'false').lower() == 'true'
    status_filter = request.args.get('status')

    query = Event.query

    if restaurant_id:
        query = query.filter_by(restaurant_id=restaurant_id)

    if upcoming_only:
        query = query.filter(Event.event_date >= date.today())
    
    if not include_inactive:
        query = query.filter_by(is_active=True)

    if status_filter in Event.VALID_STATUS:
        query = query.filter_by(status=status_filter)

    events = query.order_by(Event.event_date.asc()).limit(100).all()

    return jsonify({
        'events': [event.to_dict() for event in events]
    }), 200


@events_bp.route('/<int:event_id>', methods=['GET'])
@jwt_required()
def get_event(event_id):
    """Récupère un événement par ID avec ses images."""
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

    # Validation du statut
    status = data.get('status', 'draft')
    if status not in Event.VALID_STATUS:
        return jsonify({'error': f'Statut invalide. Valeurs: {Event.VALID_STATUS}'}), 400

    # Validation de la couleur (hex)
    color = data.get('color', '#3498DB')
    if color and (not color.startswith('#') or len(color) != 7):
        color = '#3498DB'

    event = Event(
        restaurant_id=restaurant_id,
        title=title,
        subtitle=data.get('subtitle'),
        description=data.get('description'),
        color=color,
        event_date=event_date,
        status=status,
        visibility=visibility,
        created_by_id=current_user_id,
    )
    db.session.add(event)

    # Logger
    AuditLog.log(
        action=AuditLog.ACTION_EVENT_CREATE,
        user_id=current_user_id,
        target_type='event',
        details={'title': title, 'date': event_date_str},
        ip_address=get_client_ip(),
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

    if 'subtitle' in data:
        event.subtitle = data['subtitle']

    if 'description' in data:
        event.description = data['description']

    if 'color' in data:
        color = data['color']
        if color and color.startswith('#') and len(color) == 7:
            event.color = color

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

    if 'status' in data:
        if data['status'] in Event.VALID_STATUS:
            event.status = data['status']

    if 'is_active' in data:
        event.is_active = data['is_active']

    # Logger
    AuditLog.log(
        action=AuditLog.ACTION_EVENT_UPDATE,
        user_id=current_user_id,
        target_type='event',
        target_id=event.id,
        details={'changes': data},
        ip_address=get_client_ip(),
    )

    db.session.commit()

    return jsonify({
        'message': 'Événement mis à jour',
        'event': event.to_dict()
    }), 200


@events_bp.route('/<int:event_id>', methods=['DELETE'])
@editor_required
def delete_event(event_id):
    """Supprime un événement et ses images S3."""
    current_user_id = int(get_jwt_identity())
    event = Event.query.get(event_id)

    if not event:
        return jsonify({'error': 'Événement non trouvé'}), 404

    # Supprimer les images de S3
    image_keys = [img.storage_key for img in event.images if img.storage_key]
    if image_keys:
        storage.delete_files(image_keys)

    # Logger avant suppression
    AuditLog.log(
        action=AuditLog.ACTION_EVENT_DELETE,
        user_id=current_user_id,
        target_type='event',
        target_id=event.id,
        details={'title': event.title},
        ip_address=get_client_ip(),
    )

    db.session.delete(event)
    db.session.commit()

    return jsonify({'message': 'Événement supprimé'}), 200


# ========================================
# PUBLICATION
# ========================================

@events_bp.route('/<int:event_id>/publish', methods=['POST'])
@editor_required
def publish_event(event_id):
    """Publie un événement (draft -> published)."""
    current_user_id = int(get_jwt_identity())
    event = Event.query.get(event_id)

    if not event:
        return jsonify({'error': 'Événement non trouvé'}), 404

    event.status = 'published'

    AuditLog.log(
        action=AuditLog.ACTION_EVENT_UPDATE,
        user_id=current_user_id,
        target_type='event',
        target_id=event.id,
        details={'action': 'publish'},
        ip_address=get_client_ip(),
    )

    db.session.commit()

    return jsonify({
        'message': 'Événement publié',
        'event': event.to_dict()
    }), 200


@events_bp.route('/<int:event_id>/unpublish', methods=['POST'])
@editor_required
def unpublish_event(event_id):
    """Dépublie un événement (published -> draft)."""
    current_user_id = int(get_jwt_identity())
    event = Event.query.get(event_id)

    if not event:
        return jsonify({'error': 'Événement non trouvé'}), 404

    event.status = 'draft'
    db.session.commit()

    return jsonify({
        'message': 'Événement dépublié',
        'event': event.to_dict()
    }), 200


# ========================================
# DUPLICATION
# ========================================

@events_bp.route('/<int:event_id>/duplicate', methods=['POST'])
@editor_required
def duplicate_event(event_id):
    """Duplique un événement (sans images, statut draft)."""
    current_user_id = int(get_jwt_identity())
    event = Event.query.get(event_id)

    if not event:
        return jsonify({'error': 'Événement non trouvé'}), 404

    data = request.get_json() or {}
    new_date_str = data.get('event_date')

    new_event = Event(
        restaurant_id=event.restaurant_id,
        title=f"{event.title} (copie)",
        subtitle=event.subtitle,
        description=event.description,
        color=event.color,
        event_date=datetime.strptime(new_date_str, '%Y-%m-%d').date() if new_date_str else event.event_date + timedelta(days=7),
        status='draft',
        visibility=event.visibility,
        created_by_id=current_user_id,
    )
    db.session.add(new_event)

    AuditLog.log(
        action=AuditLog.ACTION_EVENT_CREATE,
        user_id=current_user_id,
        target_type='event',
        details={'title': new_event.title, 'duplicated_from': event.id},
        ip_address=get_client_ip(),
    )

    db.session.commit()

    return jsonify({
        'message': 'Événement dupliqué',
        'event': new_event.to_dict()
    }), 201


# ========================================
# GESTION DES IMAGES S3
# ========================================

@events_bp.route('/storage-status', methods=['GET'])
@jwt_required()
def storage_status():
    """Vérifie si le stockage S3 est configuré."""
    return jsonify({'configured': storage.is_configured}), 200


@events_bp.route('/<int:event_id>/images', methods=['POST'])
@editor_required
def upload_event_image(event_id):
    """Upload une image pour un événement.

    Envoyer en multipart/form-data avec champ 'file'.
    Limite : 6 images par événement, 5 MB par image.
    """
    event = Event.query.get(event_id)
    if not event:
        return jsonify({'error': 'Événement non trouvé'}), 404

    if not storage.is_configured:
        return jsonify({'error': 'Stockage S3 non configuré'}), 503

    # Vérifier la limite d'images
    current_count = EventImage.query.filter_by(event_id=event_id).count()
    if current_count >= 6:
        return jsonify({'error': 'Maximum 6 images par événement'}), 400

    file = request.files.get('file')
    if not file:
        return jsonify({'error': 'Aucun fichier envoyé'}), 400

    # Validation
    is_valid, error_msg = storage.validate_image(file.filename, file.content_length)
    if not is_valid:
        return jsonify({'error': error_msg}), 400

    # Lire le contenu
    file_data = file.read()
    if len(file_data) > storage.MAX_FILE_SIZE:
        return jsonify({'error': 'Fichier trop volumineux (max 5 MB)'}), 400

    # Conversion HEIC/HEIF -> JPEG si nécessaire
    file_data, filename, content_type = storage.process_image(
        file_data, file.filename, file.content_type
    )

    # Upload vers S3
    result = storage.upload_file(
        file_data=file_data,
        filename=filename,
        prefix=f'events/{event_id}',
        content_type=content_type,
    )

    if not result:
        return jsonify({'error': "Erreur lors de l'upload"}), 500

    # Créer l'entrée en base
    image = EventImage(
        event_id=event_id,
        storage_key=result['key'],
        url=result['url'],
        filename=filename,
        order=current_count,  # Ajouté en dernier
    )
    db.session.add(image)
    db.session.commit()

    return jsonify({
        'message': 'Image uploadée',
        'image': image.to_dict()
    }), 201


@events_bp.route('/<int:event_id>/images/<int:image_id>', methods=['DELETE'])
@editor_required
def delete_event_image(event_id, image_id):
    """Supprime une image d'un événement."""
    image = EventImage.query.filter_by(id=image_id, event_id=event_id).first()

    if not image:
        return jsonify({'error': 'Image non trouvée'}), 404

    # Supprimer de S3
    storage.delete_file(image.storage_key)

    db.session.delete(image)
    db.session.commit()

    return jsonify({'message': 'Image supprimée'}), 200


@events_bp.route('/<int:event_id>/images/reorder', methods=['PUT'])
@editor_required
def reorder_event_images(event_id):
    """Réordonne les images d'un événement.

    Body JSON : { "image_ids": [3, 1, 2] }
    L'ordre du tableau définit le nouvel ordre d'affichage.
    """
    event = Event.query.get(event_id)
    if not event:
        return jsonify({'error': 'Événement non trouvé'}), 404

    data = request.get_json()
    image_ids = data.get('image_ids', [])

    if not image_ids:
        return jsonify({'error': 'Liste image_ids requise'}), 400

    for order, img_id in enumerate(image_ids):
        image = EventImage.query.filter_by(id=img_id, event_id=event_id).first()
        if image:
            image.order = order

    db.session.commit()

    return jsonify({
        'message': 'Images réordonnées',
        'images': [img.to_dict() for img in event.images.order_by(EventImage.order)]
    }), 200
