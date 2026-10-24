import datetime

from flask import url_for
from flask_smorest import Blueprint

from ..extensions import db
from ..models import AuditLog, Event, EventImage, Restaurant
from ..problems import Problem
from ..schemas.common import FileUploadSchema
from ..schemas.events import (
    EventDuplicateSchema,
    EventInputSchema,
    EventListSchema,
    EventPatchSchema,
    EventQuerySchema,
    EventSchema,
)
from ..schemas.images import ImageListSchema, ImageOrderSchema, ImageSchema
from ..security import limiter, public_limit
from ..services.rich_text import sanitize_html
from ..services.storage import storage
from ..utils.time import as_utc, paris_today
from .helpers import audit, editor_required, get_current_user, store_image
from .scope import SESSION_OPTIONAL, finish_public_read, member_site, readable_site

events_bp = Blueprint(
    'events', __name__,
    description="A site's events: the published ones for anyone, drafts too for its editors",
)
events_bp.after_request(finish_public_read)

EVENT_IMAGES_MAX = 6


def event_view(event, member: bool) -> dict:
    view = {
        'id': event.id,
        'title': event.title,
        'subtitle': event.subtitle,
        # Sanitised again on the way out: rows written before the write path did
        # it cannot be cleaned by a migration without losing their content.
        'description': sanitize_html(event.description),
        'color': event.color,
        'event_date': event.event_date,
        'images': [
            {'url': image.url, 'order': image.order, **({'id': image.id} if member else {})}
            for image in event.images.order_by(EventImage.order)
        ],
    }
    if member:
        view |= {
            'status': event.status,
            'visibility': event.visibility,
            'created_at': as_utc(event.created_at),
            'updated_at': as_utc(event.updated_at),
        }
    return view


def _visible(restaurant: Restaurant, member: bool):
    events = Event.query.filter(Event.restaurant_id == restaurant.id, Event.is_active)
    if not member:
        events = events.filter(Event.status == 'published')
    return events


def _site_event(restaurant: Restaurant, event_id: int, member: bool = True):
    event = _visible(restaurant, member).filter(Event.id == event_id).first()
    if event is None:
        raise Problem(404, 'event_not_found', 'Événement introuvable.')
    return event


def _created(org: str, site: str, event) -> tuple[dict, int, dict]:
    location = url_for('events.get_event', org=org, site=site, event_id=event.id)
    return event_view(event, True), 201, {'Location': location}


@events_bp.route('', methods=['GET'])
@events_bp.doc(security=SESSION_OPTIONAL)
@limiter.limit(public_limit)
@events_bp.arguments(EventQuerySchema, location='query')
@events_bp.response(200, EventListSchema)
def list_events(query, org: str, site: str):
    """Events in date order, soonest first.

    Anyone reads the published ones from today on. The site's editors read the
    drafts too, and any range: without `from`, past events as well.
    """
    restaurant, member = readable_site(org, site)
    events = _visible(restaurant, member)
    start = query.get('start')
    if not member:
        start = max(start or paris_today(), paris_today())
    if start:
        events = events.filter(Event.event_date >= start)
    if 'end' in query:
        events = events.filter(Event.event_date <= query['end'])
    if 'visibility' in query:
        events = events.filter(Event.visibility.in_((query['visibility'], 'all')))
    events = events.order_by(Event.event_date.asc(), Event.id.asc())
    if 'limit' in query:
        events = events.limit(query['limit'])
    return {'items': [event_view(event, member) for event in events]}


@events_bp.route('/<int:event_id>', methods=['GET'])
@events_bp.doc(security=SESSION_OPTIONAL)
@limiter.limit(public_limit)
@events_bp.response(200, EventSchema)
def get_event(org: str, site: str, event_id: int):
    """One event: published for anyone, any for the site's editors."""
    restaurant, member = readable_site(org, site)
    return event_view(_site_event(restaurant, event_id, member), member)


@events_bp.route('', methods=['POST'])
@editor_required
@events_bp.arguments(EventInputSchema)
@events_bp.response(201, EventSchema)
def create_event(body, org: str, site: str):
    """Add an event, a draft unless `status` says otherwise."""
    restaurant = member_site(org, site)
    event = Event(
        restaurant_id=restaurant.id,
        title=body['title'],
        subtitle=body.get('subtitle'),
        description=sanitize_html(body.get('description')),
        color=body['color'],
        event_date=body['date'],
        status=body['status'],
        visibility=body['visibility'],
        created_by_id=get_current_user().id,
    )
    db.session.add(event)
    db.session.flush()
    audit(
        AuditLog.ACTION_EVENT_CREATE, restaurant,
        target_type='event', target_id=event.id,
        details={'title': event.title, 'date': event.event_date.isoformat()},
    )
    db.session.commit()
    return _created(org, site, event)


@events_bp.route('/<int:event_id>', methods=['PATCH'])
@editor_required
@events_bp.arguments(EventPatchSchema)
@events_bp.response(200, EventSchema)
def patch_event(body, org: str, site: str, event_id: int):
    """Change an event; a new date sends its reminders again."""
    restaurant = member_site(org, site)
    event = _site_event(restaurant, event_id)
    for field in ('title', 'subtitle', 'color', 'visibility'):
        if field in body:
            setattr(event, field, body[field])
    if 'description' in body:
        event.description = sanitize_html(body['description'])
    if 'date' in body and body['date'] != event.event_date:
        event.event_date = body['date']
        event.notified_7d = event.notified_1d = False
    audit(
        AuditLog.ACTION_EVENT_UPDATE, restaurant,
        target_type='event', target_id=event.id, details={'updated_fields': sorted(body)},
    )
    db.session.commit()
    return event_view(event, True)


@events_bp.route('/<int:event_id>', methods=['DELETE'])
@editor_required
@events_bp.response(204)
def delete_event(org: str, site: str, event_id: int):
    """Delete an event and its images."""
    restaurant = member_site(org, site)
    event = _site_event(restaurant, event_id)
    keys = [image.storage_key for image in event.images if image.storage_key]
    if keys:
        storage.delete_files(keys)
    audit(
        AuditLog.ACTION_EVENT_DELETE, restaurant,
        target_type='event', target_id=event.id, details={'title': event.title},
    )
    db.session.delete(event)
    db.session.commit()


@events_bp.route('/<int:event_id>/publish', methods=['POST'])
@editor_required
@events_bp.response(200, EventSchema)
def publish_event(org: str, site: str, event_id: int):
    """Publish an event."""
    restaurant = member_site(org, site)
    event = _site_event(restaurant, event_id)
    event.status = 'published'
    audit(
        AuditLog.ACTION_EVENT_UPDATE, restaurant,
        target_type='event', target_id=event.id, details={'action': 'publish'},
    )
    db.session.commit()
    return event_view(event, True)


@events_bp.route('/<int:event_id>/unpublish', methods=['POST'])
@editor_required
@events_bp.response(200, EventSchema)
def unpublish_event(org: str, site: str, event_id: int):
    """Take a published event back to draft."""
    restaurant = member_site(org, site)
    event = _site_event(restaurant, event_id)
    if event.status != 'published':
        raise Problem(409, 'event_not_published', "L'événement n'est pas publié.")
    event.status = 'draft'
    audit(
        AuditLog.ACTION_EVENT_UPDATE, restaurant,
        target_type='event', target_id=event.id, details={'action': 'unpublish'},
    )
    db.session.commit()
    return event_view(event, True)


@events_bp.route('/<int:event_id>/duplicate', methods=['POST'])
@editor_required
@events_bp.arguments(EventDuplicateSchema)
@events_bp.response(201, EventSchema)
def duplicate_event(body, org: str, site: str, event_id: int):
    """Copy an event, without its images, as a draft."""
    restaurant = member_site(org, site)
    event = _site_event(restaurant, event_id)
    copy = Event(
        restaurant_id=restaurant.id,
        title=f'{event.title} (copie)'[:100],
        subtitle=event.subtitle,
        description=event.description,
        color=event.color,
        event_date=body.get('date', event.event_date + datetime.timedelta(days=7)),
        status='draft',
        visibility=event.visibility,
        created_by_id=get_current_user().id,
    )
    db.session.add(copy)
    db.session.flush()
    audit(
        AuditLog.ACTION_EVENT_CREATE, restaurant,
        target_type='event', target_id=copy.id,
        details={'title': copy.title, 'duplicated_from': event.id},
    )
    db.session.commit()
    return _created(org, site, copy)


@events_bp.route('/<int:event_id>/images', methods=['POST'])
@editor_required
@events_bp.arguments(FileUploadSchema, location='files')
@events_bp.response(201, ImageSchema)
def add_event_image(files, org: str, site: str, event_id: int):
    """Add an image to an event: JPEG, PNG, WebP or HEIC, stored as JPEG."""
    restaurant = member_site(org, site)
    event = _site_event(restaurant, event_id)
    count = event.images.count()
    if count >= EVENT_IMAGES_MAX:
        raise Problem(
            409, 'event_image_limit', f'Un événement porte {EVENT_IMAGES_MAX} images au plus.'
        )
    stored, filename = store_image(files['file'], f'events/{event.id}')
    image = EventImage(
        event_id=event.id,
        storage_key=stored['key'],
        url=stored['url'],
        filename=filename,
        order=count,
    )
    db.session.add(image)
    db.session.flush()
    audit(
        AuditLog.ACTION_EVENT_IMAGE_UPLOAD, restaurant,
        target_type='event_image', target_id=image.id,
    )
    db.session.commit()
    return image


@events_bp.route('/<int:event_id>/images/<int:image_id>', methods=['DELETE'])
@editor_required
@events_bp.response(204)
def delete_event_image(org: str, site: str, event_id: int, image_id: int):
    """Remove an image from an event."""
    restaurant = member_site(org, site)
    event = _site_event(restaurant, event_id)
    image = EventImage.query.filter_by(id=image_id, event_id=event.id).first()
    if image is None:
        raise Problem(404, 'event_image_not_found', 'Image introuvable.')
    storage.delete_file(image.storage_key)
    db.session.delete(image)
    audit(
        AuditLog.ACTION_EVENT_IMAGE_DELETE, restaurant,
        target_type='event_image', target_id=image_id,
    )
    db.session.commit()


@events_bp.route('/<int:event_id>/images/order', methods=['PUT'])
@editor_required
@events_bp.arguments(ImageOrderSchema)
@events_bp.response(200, ImageListSchema)
def order_event_images(body, org: str, site: str, event_id: int):
    """Put an event's images in a new order."""
    event = _site_event(member_site(org, site), event_id)
    images = {image.id: image for image in event.images}
    if sorted(body['image_ids']) != sorted(images):
        raise Problem(
            422, 'image_order_invalid', "La liste doit reprendre chaque image de l'événement, une fois."
        )
    for order, image_id in enumerate(body['image_ids']):
        images[image_id].order = order
    db.session.commit()
    return {'items': list(event.images.order_by(EventImage.order))}
