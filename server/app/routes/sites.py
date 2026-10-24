"""A site's page and settings; sites are created and closed from the CLI, never through the API."""
from flask_jwt_extended import jwt_required
from flask_smorest import Blueprint

from ..extensions import db
from ..models import AuditLog, Certification, DietaryTag, Restaurant, RestaurantServiceHours
from ..models.category import MenuCategory
from ..models.restaurant_calendar import RestaurantCalendarSettings
from ..problems import Problem
from ..schemas.sites import (
    CalendarSettingsPatchSchema,
    CalendarSettingsSchema,
    SitePatchSchema,
    SiteSchema,
)
from ..security import limiter, public_limit
from ..services.menu_window import visible_range
from ..utils.time import paris_today
from .helpers import audit, site_admin_required
from .scope import SESSION_OPTIONAL, finish_public_read, member_site, readable_site

sites_bp = Blueprint('sites', __name__, description="A site: its public page and its settings")
sites_bp.after_request(finish_public_read)

SITE_FIELDS = (
    'name', 'address_label', 'address_lat', 'address_lon', 'email', 'phone', 'capacity',
    'payment_methods', 'pmr_access', 'vote_enabled', 'vote_icon_preset',
)


def site_view(restaurant: Restaurant, member: bool) -> dict:
    config = restaurant.get_config()
    start, end = visible_range(paris_today())
    view = {
        **restaurant.to_dict(),
        'slug': restaurant.slug,
        'service_days': config['service_days'],
        'vote_enabled': config['vote_enabled'],
        'vote_icon_preset': config['vote_icon_preset'],
        'dietary_tags': config['dietary_tags'],
        'certifications': config['certifications'],
        'menu_window': {'start': start, 'end': end},
    }
    if member:
        view['vote_category_ids'] = restaurant.get_votable_category_ids()
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
