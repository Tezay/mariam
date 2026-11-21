import re
from functools import wraps

from flask import request
from flask_jwt_extended import jwt_required, verify_jwt_in_request
from flask_jwt_extended.exceptions import FreshTokenRequired

from ..extensions import db
from ..models import AuditLog, DishCatalog, Organization, Restaurant, SiteMembership
from ..models.taxonomy import Certification, DietaryTag
from ..problems import Problem
from ..security import get_client_ip
from ..services.access import ADMIN, SUPERVISOR, Reach, first_place, oversees
from ..services.storage import storage
from ..utils.time import as_utc
from .scope import get_current_user, member_org, site_access


def refuse_supervisor(role: str) -> None:
    if role == SUPERVISOR:
        raise Problem(403, 'supervisor_read_only', 'Un superviseur ne peut pas modifier un site.')


def _admin_required() -> Problem:
    return Problem(403, 'admin_required', 'Accès réservé aux administrateurs.')


def _role_on_path_site(kwargs) -> str:
    return site_access(kwargs['org'], kwargs['site'])[1]


def _oversee_path_site(kwargs) -> str:
    site, role = site_access(kwargs['org'], kwargs['site'])
    if not oversees(get_current_user(), site, role):
        raise _admin_required()
    return role


def editor_required(f):
    """Any role on the site; a supervisor reads but never writes."""
    @wraps(f)
    @jwt_required()
    def decorated_function(*args, **kwargs):
        role = _role_on_path_site(kwargs)
        if request.method != 'GET':
            refuse_supervisor(role)
        return f(*args, **kwargs)
    return decorated_function


def site_admin_required(f):
    """Admins of the site; a supervisor reads but never writes."""
    @wraps(f)
    @jwt_required()
    def decorated_function(*args, **kwargs):
        if request.method == 'GET':
            _oversee_path_site(kwargs)
        else:
            role = _role_on_path_site(kwargs)
            if role != ADMIN:
                refuse_supervisor(role)
                raise _admin_required()
        return f(*args, **kwargs)
    return decorated_function


def admin_required(f):
    """Admins of the site and its supervisors."""
    @wraps(f)
    @jwt_required()
    def decorated_function(*args, **kwargs):
        _oversee_path_site(kwargs)
        return f(*args, **kwargs)
    return decorated_function


def org_admin_required(f):
    """Supervisors of the organization; another organization reads as missing."""
    @wraps(f)
    @jwt_required()
    def decorated_function(*args, **kwargs):
        if not get_current_user().supervisions:
            raise Problem(403, 'supervisor_required', 'Réservé aux superviseurs.')
        member_org(kwargs['org'])
        return f(*args, **kwargs)
    return decorated_function


def _confirmation_required() -> Problem:
    # 403, not 401: the client takes a 401 for an expired session and refreshes it.
    return Problem(403, 'step_up_required', 'Confirmation d’identité requise.')


def _identity_confirmed() -> bool:
    try:
        verify_jwt_in_request(fresh=True)
    except FreshTokenRequired:
        return False
    return True


def step_up_required(f):
    """Reserves a route for a confirmed session: one whose account has a second
    factor and presented it within the confirmation window, at sign-in or
    through `/auth/step-up/*` since.

    Goes under the decorator that authenticates the caller.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_current_user()
        if not (user.has_second_factor() and _identity_confirmed()):
            raise _confirmation_required()
        return f(*args, **kwargs)
    return decorated_function


def step_up_once_enrolled(f):
    """`step_up_required` for the routes that give an account a second factor,
    or hand its session to another device.

    An account without a second factor has nothing to confirm with, and goes
    through.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_current_user()
        if user.has_second_factor() and not _identity_confirmed():
            raise _confirmation_required()
        return f(*args, **kwargs)
    return decorated_function


def _ref(place) -> dict:
    return {'slug': place.slug, 'name': place.name}


def _account_fields(user) -> dict:
    return {
        'id': user.id,
        'email': user.email,
        'username': user.username,
        'is_active': user.is_active,
        'mfa_enabled': user.mfa_enabled,
        'passkeys_count': user.passkeys.count(),
        'is_rescue_account': user.is_rescue_account,
        'created_at': as_utc(user.created_at),
        'last_login': as_utc(user.last_login),
    }


def member_view(
    user, organization: Organization, reach: Reach, site: Restaurant | None = None
) -> dict:
    """An account in a site's or an organization's list, with its places in that
    organization only: the others are another organization's business.
    """
    memberships = [
        m for m in user.memberships
        if m.restaurant.organization_id == organization.id
        and (site is None or m.restaurant_id == site.id)
    ]
    supervisor = site is None and any(
        place.organization_id == organization.id for place in user.supervisions
    )
    return {
        **_account_fields(user),
        'role': user.ROLE_ORG_ADMIN if supervisor else memberships[0].role,
        'site': None if supervisor else _ref(memberships[0].restaurant),
        'sites': [{**_ref(m.restaurant), 'role': m.role} for m in memberships],
        'shared': not reach.covers(user),
    }


def account_view(user) -> dict:
    """The signed-in account. `role`, `site` and `organization` are its oldest place."""
    place = first_place(user)
    if isinstance(place, SiteMembership):
        role, site, organization = place.role, place.restaurant, place.restaurant.organization
    elif place is not None:
        role, site, organization = user.ROLE_ORG_ADMIN, None, place.organization
    else:
        role, site, organization = user.role, None, None
    return {
        **_account_fields(user),
        'role': role,
        'site': _ref(site) if site else None,
        'organization': _ref(organization) if organization else None,
        'sites': [
            {**_ref(m.restaurant), 'role': m.role, 'organization': _ref(m.restaurant.organization)}
            for m in user.memberships
        ],
        'organizations': [_ref(place.organization) for place in user.supervisions],
    }


def audit(
    action: str, restaurant: Restaurant | None,
    organization: Organization | None = None, **fields,
) -> None:
    """An audit entry of the session's account, on a site, on an organization or on neither."""
    AuditLog.log(
        action=action,
        user_id=get_current_user().id,
        restaurant_id=restaurant.id if restaurant else None,
        organization_id=(
            restaurant.organization_id if restaurant else organization.id if organization else None
        ),
        ip_address=get_client_ip(),
        **fields,
    )


def store_image(upload, prefix: str, max_size: int | None = None) -> tuple[dict, str]:
    """Check, convert and store an uploaded image: its stored `key` and `url`, and
    the name it was stored under. `max_size` bounds its longer side, in pixels.
    """
    if not storage.is_configured:
        raise Problem(503, 'storage_unavailable', "Le stockage des images n'est pas configuré.")
    is_valid, error = storage.validate_image(upload.filename, upload.content_length)
    if not is_valid:
        raise Problem(422, 'image_invalid', error)
    data = upload.read()
    if len(data) > storage.MAX_FILE_SIZE:
        raise Problem(422, 'image_invalid', 'Fichier trop volumineux (5 Mo au plus).')
    try:
        data, filename, content_type = storage.process_image(
            data, upload.filename, upload.content_type or 'application/octet-stream', max_size
        )
    except ValueError as err:
        raise Problem(422, 'image_invalid', str(err)) from None
    stored = storage.upload_file(data, filename, prefix=prefix, content_type=content_type)
    if not stored:
        raise Problem(502, 'storage_failed', "L'image n'a pas pu être enregistrée.")
    return stored, filename


def normalize_dish_name(name: str) -> str:
    name = re.sub(r'\s+', ' ', name.strip())
    return name[0].upper() + name[1:] if name else name


def get_or_create_dish(restaurant_id: int, item_data: dict) -> 'DishCatalog | None':
    """The dish of `dish_id`, else the one of that name in its category, else a new
    one from `name`, `category_id`, `tag_ids` and `certification_ids`, flushed but
    not committed.

    None for a blank name, or for a `dish_id` that belongs to another site.
    """
    dish_id = item_data.get('dish_id')
    if dish_id:
        return DishCatalog.query.filter_by(id=dish_id, restaurant_id=restaurant_id).first()

    name = normalize_dish_name(item_data.get('name', ''))
    if not name:
        return None

    existing = DishCatalog.query.filter(
        DishCatalog.restaurant_id == restaurant_id,
        DishCatalog.category_id == item_data.get('category_id'),
        db.func.lower(DishCatalog.name) == name.lower(),
    ).first()
    if existing:
        return existing

    dish = DishCatalog(
        restaurant_id=restaurant_id,
        category_id=item_data.get('category_id'),
        name=name,
    )
    tag_ids = item_data.get('tag_ids', [])
    if tag_ids:
        dish.tags = DietaryTag.query.filter(DietaryTag.id.in_(tag_ids)).all()
    cert_ids = item_data.get('certification_ids', [])
    if cert_ids:
        dish.certifications = Certification.query.filter(Certification.id.in_(cert_ids)).all()

    db.session.add(dish)
    db.session.flush()
    return dish
