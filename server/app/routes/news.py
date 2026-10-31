import datetime

from flask import url_for
from flask_smorest import Blueprint

from ..extensions import db
from ..models import AuditLog, Event, EventImage, Restaurant
from ..problems import Problem
from ..schemas.common import FileUploadSchema
from ..schemas.images import ImageListSchema, ImageOrderSchema, ImageSchema
from ..schemas.news import (
    NewsDuplicateSchema,
    NewsInputSchema,
    NewsListSchema,
    NewsPatchSchema,
    NewsQuerySchema,
    NewsSchema,
)
from ..security import limiter, public_limit
from ..services.rich_text import sanitize_html
from ..services.storage import storage
from ..utils.time import as_utc
from .helpers import audit, editor_required, get_current_user, store_image
from .scope import SESSION_OPTIONAL, finish_public_read, member_site, readable_site

news_bp = Blueprint(
    'news', __name__,
    description="A site's news: the published items for anyone, drafts too for its editors",
)
news_bp.after_request(finish_public_read)

NEWS_IMAGES_MAX = 6
PUBLIC_NEWS_MAX = 8


def news_view(item, member: bool) -> dict:
    view = {
        'id': item.id,
        'title': item.title,
        'summary': item.subtitle,
        # Sanitised again on the way out: rows written before the write path did
        # it cannot be cleaned by a migration without losing their content.
        'description': sanitize_html(item.description),
        'color': item.color,
        'date': item.event_date,
        'pinned': item.pinned,
        'published_at': item.published_at,
        'images': [
            {'url': image.url, 'order': image.order, **({'id': image.id} if member else {})}
            for image in item.images.order_by(EventImage.order)
        ],
    }
    if member:
        view |= {
            'status': item.status,
            'visibility': item.visibility,
            'created_at': as_utc(item.created_at),
            'updated_at': as_utc(item.updated_at),
        }
    return view


def _visible(restaurant: Restaurant, member: bool):
    items = Event.query.filter(Event.restaurant_id == restaurant.id, Event.is_active)
    if not member:
        items = items.filter(Event.status == 'published')
    return items


def _site_news(restaurant: Restaurant, news_id: int, member: bool = True):
    item = _visible(restaurant, member).filter(Event.id == news_id).first()
    if item is None:
        raise Problem(404, 'news_not_found', 'Actualité introuvable.')
    return item


def _publish(item) -> None:
    if item.status != 'published':
        item.published_at = datetime.datetime.now(datetime.UTC)
    item.status = 'published'


def _created(org: str, site: str, item) -> tuple[dict, int, dict]:
    location = url_for('news.get_news', org=org, site=site, news_id=item.id)
    return news_view(item, True), 201, {'Location': location}


@news_bp.route('', methods=['GET'])
@news_bp.doc(security=SESSION_OPTIONAL)
@limiter.limit(public_limit)
@news_bp.arguments(NewsQuerySchema, location='query')
@news_bp.response(200, NewsListSchema)
def list_news(query, org: str, site: str):
    """News items, pinned first then the latest published, or by their date (`sort=date`).

    Anyone reads the published ones, eight at most. The site's editors read the drafts
    too, first, and as many as they ask.
    """
    restaurant, member = readable_site(org, site)
    items = _visible(restaurant, member)
    if 'start' in query:
        items = items.filter(Event.event_date >= query['start'])
    if 'end' in query:
        items = items.filter(Event.event_date <= query['end'])
    if 'visibility' in query:
        items = items.filter(Event.visibility.in_((query['visibility'], 'all')))
    if query['sort'] == 'date':
        items = items.filter(Event.event_date.isnot(None)).order_by(
            Event.event_date.asc(), Event.id.asc()
        )
    else:
        items = items.order_by(
            Event.pinned.desc(), Event.published_at.desc().nulls_first(), Event.id.desc()
        )
    limit = query.get('limit')
    if not member:
        limit = min(limit or PUBLIC_NEWS_MAX, PUBLIC_NEWS_MAX)
    if limit:
        items = items.limit(limit)
    return {'items': [news_view(item, member) for item in items]}


@news_bp.route('/<int:news_id>', methods=['GET'])
@news_bp.doc(security=SESSION_OPTIONAL)
@limiter.limit(public_limit)
@news_bp.response(200, NewsSchema)
def get_news(org: str, site: str, news_id: int):
    """A news item: published for anyone, drafts too for the site's editors."""
    restaurant, member = readable_site(org, site)
    return news_view(_site_news(restaurant, news_id, member), member)


@news_bp.route('', methods=['POST'])
@editor_required
@news_bp.arguments(NewsInputSchema)
@news_bp.response(201, NewsSchema)
def create_news(body, org: str, site: str):
    """Add a news item, a draft unless `status` says otherwise."""
    restaurant = member_site(org, site)
    item = Event(
        restaurant_id=restaurant.id,
        title=body['title'],
        subtitle=body.get('summary'),
        description=sanitize_html(body.get('description')),
        color=body['color'],
        event_date=body['date'],
        pinned=body['pinned'],
        status='draft',
        visibility=body['visibility'],
        created_by_id=get_current_user().id,
    )
    if body['status'] == 'published':
        _publish(item)
    db.session.add(item)
    db.session.flush()
    audit(
        AuditLog.ACTION_EVENT_CREATE, restaurant,
        target_type='event', target_id=item.id,
        details={
            'title': item.title,
            'date': item.event_date.isoformat() if item.event_date else None,
        },
    )
    db.session.commit()
    return _created(org, site, item)


@news_bp.route('/<int:news_id>', methods=['PATCH'])
@editor_required
@news_bp.arguments(NewsPatchSchema)
@news_bp.response(200, NewsSchema)
def patch_news(body, org: str, site: str, news_id: int):
    """Change a news item; a new date sends its reminders again."""
    restaurant = member_site(org, site)
    item = _site_news(restaurant, news_id)
    for field in ('title', 'color', 'visibility', 'pinned'):
        if field in body:
            setattr(item, field, body[field])
    if 'summary' in body:
        item.subtitle = body['summary']
    if 'description' in body:
        item.description = sanitize_html(body['description'])
    if 'date' in body and body['date'] != item.event_date:
        item.event_date = body['date']
        item.notified_7d = item.notified_1d = False
    audit(
        AuditLog.ACTION_EVENT_UPDATE, restaurant,
        target_type='event', target_id=item.id, details={'updated_fields': sorted(body)},
    )
    db.session.commit()
    return news_view(item, True)


@news_bp.route('/<int:news_id>', methods=['DELETE'])
@editor_required
@news_bp.response(204)
def delete_news(org: str, site: str, news_id: int):
    """Delete a news item and its images."""
    restaurant = member_site(org, site)
    item = _site_news(restaurant, news_id)
    keys = [image.storage_key for image in item.images if image.storage_key]
    if keys:
        storage.delete_files(keys)
    audit(
        AuditLog.ACTION_EVENT_DELETE, restaurant,
        target_type='event', target_id=item.id, details={'title': item.title},
    )
    db.session.delete(item)
    db.session.commit()


@news_bp.route('/<int:news_id>/publish', methods=['POST'])
@editor_required
@news_bp.response(200, NewsSchema)
def publish_news(org: str, site: str, news_id: int):
    """Publish a news item."""
    restaurant = member_site(org, site)
    item = _site_news(restaurant, news_id)
    _publish(item)
    audit(
        AuditLog.ACTION_EVENT_UPDATE, restaurant,
        target_type='event', target_id=item.id, details={'action': 'publish'},
    )
    db.session.commit()
    return news_view(item, True)


@news_bp.route('/<int:news_id>/unpublish', methods=['POST'])
@editor_required
@news_bp.response(200, NewsSchema)
def unpublish_news(org: str, site: str, news_id: int):
    """Take a published news item back to draft."""
    restaurant = member_site(org, site)
    item = _site_news(restaurant, news_id)
    if item.status != 'published':
        raise Problem(409, 'news_not_published', "L'actualité n'est pas publiée.")
    item.status = 'draft'
    item.published_at = None
    audit(
        AuditLog.ACTION_EVENT_UPDATE, restaurant,
        target_type='event', target_id=item.id, details={'action': 'unpublish'},
    )
    db.session.commit()
    return news_view(item, True)


@news_bp.route('/<int:news_id>/duplicate', methods=['POST'])
@editor_required
@news_bp.arguments(NewsDuplicateSchema)
@news_bp.response(201, NewsSchema)
def duplicate_news(body, org: str, site: str, news_id: int):
    """Copy a news item, without its images, as a draft."""
    restaurant = member_site(org, site)
    item = _site_news(restaurant, news_id)
    week_later = item.event_date and item.event_date + datetime.timedelta(days=7)
    copy = Event(
        restaurant_id=restaurant.id,
        title=f'{item.title} (copie)'[:100],
        subtitle=item.subtitle,
        description=item.description,
        color=item.color,
        event_date=body.get('date', week_later),
        status='draft',
        visibility=item.visibility,
        created_by_id=get_current_user().id,
    )
    db.session.add(copy)
    db.session.flush()
    audit(
        AuditLog.ACTION_EVENT_CREATE, restaurant,
        target_type='event', target_id=copy.id,
        details={'title': copy.title, 'duplicated_from': item.id},
    )
    db.session.commit()
    return _created(org, site, copy)


@news_bp.route('/<int:news_id>/images', methods=['POST'])
@editor_required
@news_bp.arguments(FileUploadSchema, location='files')
@news_bp.response(201, ImageSchema)
def add_news_image(files, org: str, site: str, news_id: int):
    """Add an image to a news item: JPEG, PNG, WebP or HEIC, stored as JPEG."""
    restaurant = member_site(org, site)
    item = _site_news(restaurant, news_id)
    count = item.images.count()
    if count >= NEWS_IMAGES_MAX:
        raise Problem(
            409, 'news_image_limit', f'Une actualité porte {NEWS_IMAGES_MAX} images au plus.'
        )
    stored, filename = store_image(files['file'], f'events/{item.id}')
    image = EventImage(
        event_id=item.id,
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


@news_bp.route('/<int:news_id>/images/<int:image_id>', methods=['DELETE'])
@editor_required
@news_bp.response(204)
def delete_news_image(org: str, site: str, news_id: int, image_id: int):
    """Remove an image from a news item."""
    restaurant = member_site(org, site)
    item = _site_news(restaurant, news_id)
    image = EventImage.query.filter_by(id=image_id, event_id=item.id).first()
    if image is None:
        raise Problem(404, 'news_image_not_found', 'Image introuvable.')
    storage.delete_file(image.storage_key)
    db.session.delete(image)
    audit(
        AuditLog.ACTION_EVENT_IMAGE_DELETE, restaurant,
        target_type='event_image', target_id=image_id,
    )
    db.session.commit()


@news_bp.route('/<int:news_id>/images/order', methods=['PUT'])
@editor_required
@news_bp.arguments(ImageOrderSchema)
@news_bp.response(200, ImageListSchema)
def order_news_images(body, org: str, site: str, news_id: int):
    """Put a news item's images in a new order."""
    item = _site_news(member_site(org, site), news_id)
    images = {image.id: image for image in item.images}
    if sorted(body['image_ids']) != sorted(images):
        raise Problem(
            422, 'image_order_invalid', "La liste doit reprendre chaque image de l'actualité, une fois."
        )
    for order, image_id in enumerate(body['image_ids']):
        images[image_id].order = order
    db.session.commit()
    return {'items': list(item.images.order_by(EventImage.order))}
