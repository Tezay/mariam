"""
Event routes for MARIAM — Public display and editor management.

Public endpoints (no authentication required):
- GET /v1/events     Upcoming published events (TV/mobile)

Editor endpoints (JWT required):
- GET    /v1/events                        List with filters (drafts included)
- GET    /v1/events/storage-status         S3 storage status
- GET    /v1/events/<id>                   Event details
- POST   /v1/events                        Create an event
- PUT    /v1/events/<id>                   Update an event
- DELETE /v1/events/<id>                   Delete an event
- POST   /v1/events/<id>/publish           Publish
- POST   /v1/events/<id>/unpublish         Revert to draft
- POST   /v1/events/<id>/duplicate         Duplicate
- POST   /v1/events/<id>/images            Upload image
- DELETE /v1/events/<id>/images/<img_id>   Delete image
- PUT    /v1/events/<id>/images/reorder    Reorder images
"""
from datetime import date, datetime, timedelta
from functools import wraps
from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, verify_jwt_in_request
from flask_smorest import Blueprint
from ..extensions import db
from ..models import User, Restaurant, Event, EventImage, AuditLog
from ..services.storage import storage
from ..security import get_client_ip
from ..schemas.events import (
    EventSchema, EventCreateSchema, EventUpdateSchema,
    PublicEventsResponseSchema,
)
from ..schemas.common import ErrorSchema, MessageSchema


events_bp = Blueprint(
    'events', __name__,
    description='Events — Public display and editor management'
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


def get_default_restaurant():
    """Retourne le premier restaurant actif."""
    return Restaurant.query.filter_by(is_active=True).first()


# ============================================================
# LISTE DES ÉVÉNEMENTS — route unifiée public/éditeur
# (définie AVANT les routes paramétrées /<int:event_id>)
# ============================================================

@events_bp.route('', methods=['GET'])
@events_bp.response(200, PublicEventsResponseSchema)
def list_events():
    """List events.

    - **Without authentication**: returns published, active events from today onward,
      in display format (TV/mobile). Separates today's event from upcoming events.
    - **With editor authentication**: returns all events (drafts included) with advanced filters.

    Public query params: `restaurant_id`, `visibility` (tv|mobile|all), `limit`

    Editor query params (ignored without auth):
    `upcoming` (bool), `include_inactive` (bool), `status`
    """
    restaurant_id = request.args.get('restaurant_id', type=int)

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

    if not restaurant_id:
        restaurant = get_default_restaurant()
        if restaurant:
            restaurant_id = restaurant.id
        else:
            return jsonify({
                'today_event': None,
                'upcoming_events': [],
                'events': [],
            }), 200

    if is_editor:
        # Vue gestion : tous les événements avec filtres
        upcoming_only = request.args.get('upcoming', 'true').lower() == 'true'
        include_inactive = request.args.get('include_inactive', 'false').lower() == 'true'
        status_filter = request.args.get('status')

        query = Event.query.filter_by(restaurant_id=restaurant_id)

        if upcoming_only:
            query = query.filter(Event.event_date >= date.today())

        if not include_inactive:
            query = query.filter_by(is_active=True)

        if status_filter in Event.VALID_STATUS:
            query = query.filter_by(status=status_filter)

        events = query.order_by(Event.event_date.asc()).limit(100).all()

        return jsonify({'events': [event.to_dict() for event in events]}), 200

    else:
        # Vue publique : publiés, actifs, à partir d'aujourd'hui
        visibility = request.args.get('visibility')
        limit = request.args.get('limit', 5, type=int)

        query = Event.query.filter(
            Event.restaurant_id == restaurant_id,
            Event.is_active == True,
            Event.status == 'published',
            Event.event_date >= date.today(),
        )

        if visibility in ['tv', 'mobile']:
            query = query.filter(
                (Event.visibility == visibility) | (Event.visibility == 'all')
            )

        events = query.order_by(Event.event_date.asc()).limit(limit).all()

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


@events_bp.route('', methods=['POST'])
@events_bp.arguments(EventCreateSchema)
@events_bp.response(201, EventSchema)
@events_bp.alt_response(400, schema=ErrorSchema, description="Invalid data")
@editor_required
def create_event(data):
    """Create a new event."""
    current_user_id = int(get_jwt_identity())

    title = data.get('title')
    event_date_str = data.get('event_date')

    if not title or not event_date_str:
        return jsonify({'error': 'Titre et date requis'}), 400

    try:
        event_date = datetime.strptime(event_date_str, '%Y-%m-%d').date()
    except ValueError:
        return jsonify({'error': 'Format de date invalide (YYYY-MM-DD)'}), 400

    restaurant_id = data.get('restaurant_id')
    if not restaurant_id:
        restaurant = get_default_restaurant()
        if restaurant:
            restaurant_id = restaurant.id
        else:
            return jsonify({'error': 'Aucun restaurant configuré'}), 400

    visibility = data.get('visibility', 'all')
    if visibility not in Event.VALID_VISIBILITY:
        return jsonify({'error': f'Visibilité invalide. Valeurs: {Event.VALID_VISIBILITY}'}), 400

    status = data.get('status', 'draft')
    if status not in Event.VALID_STATUS:
        return jsonify({'error': f'Statut invalide. Valeurs: {Event.VALID_STATUS}'}), 400

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

    AuditLog.log(
        action=AuditLog.ACTION_EVENT_CREATE,
        user_id=current_user_id,
        target_type='event',
        details={'title': title, 'date': event_date_str},
        ip_address=get_client_ip(),
    )

    db.session.commit()

    return jsonify({'message': 'Événement créé', 'event': event.to_dict()}), 201


# ============================================================
# ROUTE STATIQUE — doit précéder /<int:event_id>
# ============================================================

@events_bp.route('/storage-status', methods=['GET'])
@events_bp.response(200, MessageSchema)
@jwt_required()
def storage_status():
    """Check whether S3 storage is configured."""
    return jsonify({'configured': storage.is_configured}), 200


# ============================================================
# ROUTES PARAMÉTRÉES — après toutes les routes statiques
# ============================================================

@events_bp.route('/<int:event_id>', methods=['GET'])
@events_bp.response(200, EventSchema)
@events_bp.alt_response(404, schema=ErrorSchema, description="Event not found")
@editor_required
def get_event(event_id):
    """Get an event by ID with its images."""
    event = Event.query.get(event_id)
    if not event:
        return jsonify({'error': 'Événement non trouvé'}), 404
    return jsonify({'event': event.to_dict()}), 200


@events_bp.route('/<int:event_id>', methods=['PUT'])
@events_bp.arguments(EventUpdateSchema)
@events_bp.response(200, EventSchema)
@events_bp.alt_response(400, schema=ErrorSchema, description="Invalid data")
@events_bp.alt_response(404, schema=ErrorSchema, description="Event not found")
@editor_required
def update_event(data, event_id):
    """Update an existing event."""
    current_user_id = int(get_jwt_identity())
    event = Event.query.get(event_id)
    if not event:
        return jsonify({'error': 'Événement non trouvé'}), 404

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
            new_date = datetime.strptime(data['event_date'], '%Y-%m-%d').date()
            if new_date != event.event_date:
                event.event_date = new_date
                event.notified_7d = False
                event.notified_1d = False
        except ValueError:
            return jsonify({'error': 'Format de date invalide (YYYY-MM-DD)'}), 400

    if 'visibility' in data:
        if data['visibility'] in Event.VALID_VISIBILITY:
            event.visibility = data['visibility']
        else:
            return jsonify({'error': f'Visibilité invalide. Valeurs: {Event.VALID_VISIBILITY}'}), 400

    if 'status' in data and data['status'] in Event.VALID_STATUS:
        event.status = data['status']

    if 'is_active' in data:
        event.is_active = data['is_active']

    AuditLog.log(
        action=AuditLog.ACTION_EVENT_UPDATE,
        user_id=current_user_id,
        target_type='event',
        target_id=event.id,
        details={'changes': data},
        ip_address=get_client_ip(),
    )

    db.session.commit()

    return jsonify({'message': 'Événement mis à jour', 'event': event.to_dict()}), 200


@events_bp.route('/<int:event_id>', methods=['DELETE'])
@events_bp.response(200, MessageSchema)
@events_bp.alt_response(404, schema=ErrorSchema, description="Event not found")
@editor_required
def delete_event(event_id):
    """Delete an event and its S3 images."""
    current_user_id = int(get_jwt_identity())
    event = Event.query.get(event_id)
    if not event:
        return jsonify({'error': 'Événement non trouvé'}), 404

    image_keys = [img.storage_key for img in event.images if img.storage_key]
    if image_keys:
        storage.delete_files(image_keys)

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


@events_bp.route('/<int:event_id>/publish', methods=['POST'])
@events_bp.response(200, EventSchema)
@events_bp.alt_response(404, schema=ErrorSchema, description="Event not found")
@editor_required
def publish_event(event_id):
    """Publish an event (draft to published)."""
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

    return jsonify({'message': 'Événement publié', 'event': event.to_dict()}), 200


@events_bp.route('/<int:event_id>/unpublish', methods=['POST'])
@events_bp.response(200, EventSchema)
@events_bp.alt_response(404, schema=ErrorSchema, description="Event not found")
@editor_required
def unpublish_event(event_id):
    """Revert a published event to draft."""
    event = Event.query.get(event_id)
    if not event:
        return jsonify({'error': 'Événement non trouvé'}), 404

    event.status = 'draft'
    db.session.commit()

    return jsonify({'message': 'Événement dépublié', 'event': event.to_dict()}), 200


@events_bp.route('/<int:event_id>/duplicate', methods=['POST'])
@events_bp.response(201, EventSchema)
@events_bp.alt_response(404, schema=ErrorSchema, description="Event not found")
@editor_required
def duplicate_event(event_id):
    """Duplicate an event (no images, draft status).

    Optional JSON body: `{ "event_date": "YYYY-MM-DD" }`
    If omitted, the date is shifted 7 days from the original.
    """
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
        event_date=(
            datetime.strptime(new_date_str, '%Y-%m-%d').date()
            if new_date_str
            else event.event_date + timedelta(days=7)
        ),
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

    return jsonify({'message': 'Événement dupliqué', 'event': new_event.to_dict()}), 201


# ============================================================
# IMAGES D'ÉVÉNEMENTS
# ============================================================

@events_bp.route('/<int:event_id>/images', methods=['POST'])
@events_bp.response(201, EventSchema)
@events_bp.alt_response(400, schema=ErrorSchema, description="Invalid file or quota exceeded")
@events_bp.alt_response(404, schema=ErrorSchema, description="Event not found")
@events_bp.alt_response(503, schema=ErrorSchema, description="S3 storage not configured")
@editor_required
def upload_event_image(event_id):
    """Upload an image for an event.

    Multipart/form-data request with `file` field.
    Limit: 6 images per event, 5 MB per image.
    Accepted formats: JPEG, PNG, WebP, HEIC (converted to JPEG).
    """
    event = Event.query.get(event_id)
    if not event:
        return jsonify({'error': 'Événement non trouvé'}), 404

    if not storage.is_configured:
        return jsonify({'error': 'Stockage S3 non configuré'}), 503

    current_count = EventImage.query.filter_by(event_id=event_id).count()
    if current_count >= 6:
        return jsonify({'error': 'Maximum 6 images par événement'}), 400

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
        prefix=f'events/{event_id}',
        content_type=content_type,
    )

    if not result:
        return jsonify({'error': "Erreur lors de l'upload"}), 500

    image = EventImage(
        event_id=event_id,
        storage_key=result['key'],
        url=result['url'],
        filename=filename,
        order=current_count,
    )
    db.session.add(image)
    db.session.commit()

    return jsonify({'message': 'Image uploadée', 'image': image.to_dict()}), 201


@events_bp.route('/<int:event_id>/images/<int:image_id>', methods=['DELETE'])
@events_bp.response(200, MessageSchema)
@events_bp.alt_response(404, schema=ErrorSchema, description="Image not found")
@editor_required
def delete_event_image(event_id, image_id):
    """Delete an event image from S3 storage and database."""
    image = EventImage.query.filter_by(id=image_id, event_id=event_id).first()
    if not image:
        return jsonify({'error': 'Image non trouvée'}), 404

    storage.delete_file(image.storage_key)
    db.session.delete(image)
    db.session.commit()

    return jsonify({'message': 'Image supprimée'}), 200


@events_bp.route('/<int:event_id>/images/reorder', methods=['PUT'])
@events_bp.response(200, EventSchema)
@events_bp.alt_response(400, schema=ErrorSchema, description="image_ids list required")
@events_bp.alt_response(404, schema=ErrorSchema, description="Event not found")
@editor_required
def reorder_event_images(event_id):
    """Reorder event images.

    JSON body: `{ "image_ids": [3, 1, 2] }`
    Array order defines the new display order.
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
        'images': [img.to_dict() for img in event.images.order_by(EventImage.order)],
    }), 200
