"""A site's page and settings; sites are created and closed from the CLI, never through the API."""
from datetime import UTC, datetime

from flask_jwt_extended import jwt_required
from sqlalchemy.dialects.postgresql import insert

from ..data.site_profile import SERVICES
from ..extensions import db
from ..models import (
    AuditLog,
    Certification,
    DietaryTag,
    Restaurant,
    RestaurantPhoto,
    RestaurantServiceHours,
    ServiceLiveStatus,
)
from ..models.category import MenuCategory
from ..models.restaurant_calendar import RestaurantCalendarSettings
from ..multipart import LOCATION as MULTIPART
from ..problems import Blueprint, Problem
from ..schemas.common import FileUploadSchema
from ..schemas.public import LiveStatusSchema
from ..schemas.sites import (
    CalendarSettingsPatchSchema,
    CalendarSettingsSchema,
    LiveStatusInputSchema,
    PhotoOrderSchema,
    SitePatchSchema,
    SitePhotoAltSchema,
    SitePhotoListSchema,
    SitePhotoSchema,
    SitePhotoUploadSchema,
    SiteSchema,
)
from ..security import limiter, public_limit
from ..services.menu_window import visible_range
from ..services.storage import storage
from ..utils.time import paris_today
from .helpers import audit, editor_required, site_admin_required, store_image
from .scope import SESSION_OPTIONAL, finish_public_read, member_site, readable_site

sites_bp = Blueprint('sites', __name__, description="A site: its public page and its settings")
sites_bp.after_request(finish_public_read)

SITE_FIELDS = (
    'name', 'tagline', 'description', 'address_label', 'address_lat', 'address_lon',
    'address_city', 'address_postcode', 'access_info', 'email', 'phone', 'service_capacity',
    'payment_methods', 'pmr_access', 'vote_enabled', 'vote_icon_preset',
    'menu_days_ahead', 'menu_days_back',
)
# Each one's columns, and the longer side it is stored at.
MEDIA = {
    'logo': ('logo_url', 'logo_storage_key', 512),
    'cover': ('cover_url', 'cover_storage_key', 2400),
}
PHOTO_SIZE = 2000
PHOTOS_MAX = 8


def _photos(restaurant: Restaurant) -> list[RestaurantPhoto]:
    return (
        RestaurantPhoto.query.filter_by(restaurant_id=restaurant.id)
        .order_by(RestaurantPhoto.order).all()
    )


def photo_view(photo: RestaurantPhoto, member: bool) -> dict:
    view = {'url': photo.url, 'alt': photo.alt, 'order': photo.order}
    if member:
        view['id'] = photo.id
    return view


def site_view(restaurant: Restaurant, member: bool) -> dict:
    config = restaurant.get_config()
    start, end = visible_range(restaurant, paris_today())
    view = {
        **restaurant.to_dict(),
        'slug': restaurant.slug,
        'tagline': restaurant.tagline,
        'description': restaurant.description,
        'cover_url': restaurant.cover_url,
        'photos': [photo_view(photo, member) for photo in _photos(restaurant)],
        'address_city': restaurant.address_city,
        'address_postcode': restaurant.address_postcode,
        'access_info': restaurant.access_info,
        'service_capacity': restaurant.service_capacity,
        'services': restaurant.services or [],
        'links': restaurant.links or [],
        'service_days': config['service_days'],
        'vote_enabled': config['vote_enabled'],
        'vote_icon_preset': config['vote_icon_preset'],
        'dietary_tags': config['dietary_tags'],
        'certifications': config['certifications'],
        'menu_window': {'start': start, 'end': end},
    }
    if member:
        view['vote_category_ids'] = restaurant.get_votable_category_ids()
        view['menu_days_ahead'] = restaurant.menu_days_ahead
        view['menu_days_back'] = restaurant.menu_days_back
    return view


def _refuse_unknown(field: str, wanted: list, known: set, code: str, detail: str) -> None:
    unknown = [index for index, value in enumerate(wanted) if value not in known]
    if unknown:
        raise Problem(
            422, code, detail,
            errors=[{'pointer': f'/{field}/{index}', 'detail': detail} for index in unknown],
        )


def _set_service_hours(restaurant, hours: dict) -> None:
    existing = {str(row.day_of_week): row for row in restaurant.service_hours}
    for day, times in hours.items():
        row = existing.pop(day, None)
        if row is None:
            db.session.add(RestaurantServiceHours(
                restaurant_id=restaurant.id, day_of_week=int(day),
                open_time=times['open'], close_time=times['close'],
            ))
        else:
            row.open_time, row.close_time = times['open'], times['close']
    for row in existing.values():
        db.session.delete(row)


@sites_bp.route('/<site>', methods=['GET'])
@sites_bp.doc(security=SESSION_OPTIONAL)
@limiter.limit(public_limit)
@sites_bp.response(200, SiteSchema)
def get_site(org: str, site: str):
    """A site, with what a visitor needs to read its menus.

    Anyone reads an active site; its editors read it while it is closed too.
    """
    restaurant, member = readable_site(org, site)
    return site_view(restaurant, member)


@sites_bp.route('/<site>', methods=['PATCH'])
@site_admin_required
@sites_bp.arguments(SitePatchSchema)
@sites_bp.response(200, SiteSchema)
def patch_site(body, org: str, site: str):
    """Change a site's details, hours, vote and labels.

    `tag_ids` and `certification_ids` name the labels the site uses, in place of
    the defaults.
    """
    restaurant = member_site(org, site)
    if 'vote_category_ids' in body:
        own = {category.id for category in MenuCategory.query.filter_by(restaurant_id=restaurant.id)}
        _refuse_unknown(
            'vote_category_ids', body['vote_category_ids'], own,
            'category_invalid', "Catégorie inconnue sur ce site.",
        )
    tags, certifications = None, None
    if 'tag_ids' in body:
        tags = DietaryTag.query.filter(DietaryTag.id.in_(body['tag_ids'])).all()
        _refuse_unknown(
            'tag_ids', body['tag_ids'], {tag.id for tag in tags},
            'tag_invalid', 'Étiquette inconnue.',
        )
    if 'certification_ids' in body:
        certifications = Certification.query.filter(
            Certification.id.in_(body['certification_ids'])
        ).all()
        _refuse_unknown(
            'certification_ids', body['certification_ids'], {cert.id for cert in certifications},
            'certification_invalid', 'Label inconnu.',
        )

    for field in SITE_FIELDS:
        if field in body:
            setattr(restaurant, field, body[field])
    if 'services' in body:
        restaurant.services = [service for service in SERVICES if service in body['services']]
    if 'links' in body:
        restaurant.links = [
            {'kind': link['kind'], 'url': link['url'], 'label': link.get('label')}
            for link in body['links']
        ]
    if 'service_days' in body:
        restaurant.service_days = sorted(set(body['service_days']))
    if 'service_hours' in body:
        _set_service_hours(restaurant, body['service_hours'])
    if 'vote_category_ids' in body:
        restaurant.vote_category_ids = body['vote_category_ids']
    if tags is not None or certifications is not None:
        restaurant.tags_customized = True
    if tags is not None:
        restaurant.enabled_tags = tags
    if certifications is not None:
        restaurant.enabled_certifications = certifications

    audit(
        'settings_update', restaurant,
        target_type='restaurant', target_id=restaurant.id,
        details={'updated_fields': sorted(body)},
    )
    db.session.commit()
    return site_view(restaurant, True)


def _put_media(org: str, site: str, kind: str, upload) -> dict:
    restaurant = member_site(org, site)
    url_column, key_column, size = MEDIA[kind]
    stored, filename = store_image(upload, f'sites/{restaurant.id}', size)
    previous = getattr(restaurant, key_column)
    setattr(restaurant, url_column, stored['url'])
    setattr(restaurant, key_column, stored['key'])
    audit(
        AuditLog.ACTION_SITE_MEDIA_UPLOAD, restaurant,
        target_type='restaurant', target_id=restaurant.id,
        details={'kind': kind, 'filename': filename},
    )
    db.session.commit()
    storage.delete_file(previous)
    return site_view(restaurant, True)


def _delete_media(org: str, site: str, kind: str) -> None:
    restaurant = member_site(org, site)
    url_column, key_column, _ = MEDIA[kind]
    if getattr(restaurant, url_column) is None:
        return
    previous = getattr(restaurant, key_column)
    setattr(restaurant, url_column, None)
    setattr(restaurant, key_column, None)
    audit(
        AuditLog.ACTION_SITE_MEDIA_DELETE, restaurant,
        target_type='restaurant', target_id=restaurant.id, details={'kind': kind},
    )
    db.session.commit()
    storage.delete_file(previous)


@sites_bp.route('/<site>/logo', methods=['PUT'])
@limiter.limit('30 per minute')
@site_admin_required
@sites_bp.arguments(FileUploadSchema, location='files')
@sites_bp.response(200, SiteSchema)
def put_logo(files, org: str, site: str):
    """Set or replace the site's logo, kept within 512 pixels; one with transparency stays PNG."""
    return _put_media(org, site, 'logo', files['file'])


@sites_bp.route('/<site>/logo', methods=['DELETE'])
@site_admin_required
@sites_bp.response(204)
def delete_logo(org: str, site: str):
    """Remove the site's logo."""
    _delete_media(org, site, 'logo')


@sites_bp.route('/<site>/cover', methods=['PUT'])
@limiter.limit('30 per minute')
@site_admin_required
@sites_bp.arguments(FileUploadSchema, location='files')
@sites_bp.response(200, SiteSchema)
def put_cover(files, org: str, site: str):
    """Set or replace the photo at the top of the site's page, kept within 2400 pixels."""
    return _put_media(org, site, 'cover', files['file'])


@sites_bp.route('/<site>/cover', methods=['DELETE'])
@site_admin_required
@sites_bp.response(204)
def delete_cover(org: str, site: str):
    """Remove the site's cover photo."""
    _delete_media(org, site, 'cover')


def _site_photo(restaurant: Restaurant, photo_id: int) -> RestaurantPhoto:
    photo = RestaurantPhoto.query.filter_by(id=photo_id, restaurant_id=restaurant.id).first()
    if photo is None:
        raise Problem(404, 'site_photo_not_found', 'Photo introuvable.')
    return photo


@sites_bp.route('/<site>/photos', methods=['POST'])
@limiter.limit('30 per minute')
@site_admin_required
@sites_bp.arguments(SitePhotoUploadSchema, location=MULTIPART)
@sites_bp.response(201, SitePhotoSchema)
def add_photo(body, org: str, site: str):
    """Add a photo to the site's gallery, kept within 2000 pixels; eight at most."""
    restaurant = member_site(org, site)
    gallery = _photos(restaurant)
    if len(gallery) >= PHOTOS_MAX:
        raise Problem(409, 'site_photo_limit', f'La galerie compte {PHOTOS_MAX} photos au plus.')
    stored, filename = store_image(body['file'], f'sites/{restaurant.id}/photos', PHOTO_SIZE)
    photo = RestaurantPhoto(
        restaurant_id=restaurant.id,
        storage_key=stored['key'],
        url=stored['url'],
        alt=body['alt'],
        order=max((photo.order for photo in gallery), default=-1) + 1,
    )
    db.session.add(photo)
    db.session.flush()
    audit(
        AuditLog.ACTION_SITE_MEDIA_UPLOAD, restaurant,
        target_type='site_photo', target_id=photo.id,
        details={'kind': 'photo', 'filename': filename},
    )
    db.session.commit()
    return photo_view(photo, True)


@sites_bp.route('/<site>/photos/<int:photo_id>', methods=['PATCH'])
@site_admin_required
@sites_bp.arguments(SitePhotoAltSchema)
@sites_bp.response(200, SitePhotoSchema)
def patch_photo(body, org: str, site: str, photo_id: int):
    """Change what a photo's text says to screen readers."""
    restaurant = member_site(org, site)
    photo = _site_photo(restaurant, photo_id)
    photo.alt = body['alt']
    audit(
        AuditLog.ACTION_SITE_MEDIA_UPDATE, restaurant,
        target_type='site_photo', target_id=photo.id, details={'kind': 'photo'},
    )
    db.session.commit()
    return photo_view(photo, True)


@sites_bp.route('/<site>/photos/<int:photo_id>', methods=['DELETE'])
@site_admin_required
@sites_bp.response(204)
def delete_photo(org: str, site: str, photo_id: int):
    """Remove a photo from the site's gallery."""
    restaurant = member_site(org, site)
    photo = _site_photo(restaurant, photo_id)
    key = photo.storage_key
    db.session.delete(photo)
    audit(
        AuditLog.ACTION_SITE_MEDIA_DELETE, restaurant,
        target_type='site_photo', target_id=photo_id, details={'kind': 'photo'},
    )
    db.session.commit()
    storage.delete_file(key)


@sites_bp.route('/<site>/photos/order', methods=['PUT'])
@site_admin_required
@sites_bp.arguments(PhotoOrderSchema)
@sites_bp.response(200, SitePhotoListSchema)
def order_photos(body, org: str, site: str):
    """Put the site's gallery in a new order."""
    restaurant = member_site(org, site)
    photos = {photo.id: photo for photo in _photos(restaurant)}
    if sorted(body['photo_ids']) != sorted(photos):
        raise Problem(
            422, 'image_order_invalid',
            'La liste doit reprendre chaque photo de la galerie, une fois.',
        )
    for order, photo_id in enumerate(body['photo_ids']):
        photos[photo_id].order = order
    db.session.commit()
    return {'items': [photo_view(photos[photo_id], True) for photo_id in body['photo_ids']]}


def _calendar_settings(restaurant: Restaurant) -> RestaurantCalendarSettings:
    settings = RestaurantCalendarSettings.query.filter_by(restaurant_id=restaurant.id).first()
    if settings is None:
        settings = RestaurantCalendarSettings(
            restaurant_id=restaurant.id, show_public_holidays=True, show_school_vacations=False,
        )
    return settings


@sites_bp.route('/<site>/calendar-settings', methods=['GET'])
@jwt_required()
@sites_bp.response(200, CalendarSettingsSchema)
def get_calendar_settings(org: str, site: str):
    """What the site's calendar shows besides its menus: public and school holidays."""
    return _calendar_settings(member_site(org, site))


@sites_bp.route('/<site>/calendar-settings', methods=['PATCH'])
@site_admin_required
@sites_bp.arguments(CalendarSettingsPatchSchema)
@sites_bp.response(200, CalendarSettingsSchema)
def patch_calendar_settings(body, org: str, site: str):
    """Change what the site's calendar shows."""
    restaurant = member_site(org, site)
    settings = _calendar_settings(restaurant)
    for field, value in body.items():
        setattr(settings, field, value)
    db.session.add(settings)
    audit(AuditLog.ACTION_CALENDAR_SETTINGS_UPDATE, restaurant, details=settings.to_dict())
    db.session.commit()
    return settings


def _live_status(restaurant: Restaurant) -> dict:
    status = ServiceLiveStatus.query.filter_by(restaurant_id=restaurant.id, day=paris_today()).first()
    reached_at = status.capacity_reached_at if status else None
    return {'capacity_reached': reached_at is not None, 'reached_at': reached_at}


@sites_bp.route('/<site>/live-status', methods=['GET'])
@sites_bp.doc(security=SESSION_OPTIONAL)
@limiter.limit(public_limit)
@sites_bp.response(200, LiveStatusSchema)
def get_live_status(org: str, site: str):
    """Whether the team says today's service has reached its capacity."""
    restaurant, _ = readable_site(org, site)
    return _live_status(restaurant)


@sites_bp.route('/<site>/live-status', methods=['PUT'])
@editor_required
@sites_bp.arguments(LiveStatusInputSchema)
@sites_bp.response(200, LiveStatusSchema)
def put_live_status(body, org: str, site: str):
    """Say whether today's service has reached its capacity; it lapses with the day."""
    restaurant = member_site(org, site)
    now = datetime.now(UTC)
    reached = body['capacity_reached']
    statement = insert(ServiceLiveStatus).values(
        restaurant_id=restaurant.id,
        day=paris_today(),
        capacity_reached_at=now if reached else None,
        updated_at=now,
    )
    # An upsert, so two declarations at once share the day's row; the first hour it filled stays.
    first = db.func.coalesce(
        ServiceLiveStatus.capacity_reached_at, statement.excluded.capacity_reached_at
    )
    db.session.execute(statement.on_conflict_do_update(
        constraint='uq_service_live_status_day',
        set_={'capacity_reached_at': first if reached else None, 'updated_at': now},
    ))
    db.session.commit()
    return _live_status(restaurant)
