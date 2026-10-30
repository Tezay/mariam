import re
from functools import wraps

from flask import request
from flask_jwt_extended import get_jwt_identity, jwt_required, verify_jwt_in_request
from flask_jwt_extended.exceptions import FreshTokenRequired

from ..extensions import db
from ..models import AuditLog, DishCatalog, Organization, Restaurant, User
from ..models.taxonomy import Certification, DietaryTag
from ..problems import Problem
from ..security import get_client_ip
from ..services.storage import storage
from ..utils.time import as_utc


def refuse_supervisor(user) -> None:
    if user.is_org_admin():
        raise Problem(403, 'supervisor_read_only', 'Un superviseur ne peut pas modifier un site.')


def _refuse_supervisor_writes(user) -> None:
    if request.method != 'GET':
        refuse_supervisor(user)


def editor_required(f):
    """Any account of the site; a supervisor reads but never writes."""
    @wraps(f)
    @jwt_required()
    def decorated_function(*args, **kwargs):
        _refuse_supervisor_writes(get_current_user())
        return f(*args, **kwargs)
    return decorated_function


def site_admin_required(f):
    """Admins of the site; a supervisor reads but never writes."""
    @wraps(f)
    @jwt_required()
    def decorated_function(*args, **kwargs):
        current_user_id = int(get_jwt_identity())
        user = db.session.get(User, current_user_id)
        if not user.is_admin():
            raise Problem(403, 'admin_required', 'Accès réservé aux administrateurs.')
        _refuse_supervisor_writes(user)
        return f(*args, **kwargs)
    return decorated_function


def admin_required(f):
    """Site admins and supervisors."""
    @wraps(f)
    @jwt_required()
    def decorated_function(*args, **kwargs):
        current_user_id = int(get_jwt_identity())
        user = db.session.get(User, current_user_id)
        if not user.is_admin():
            raise Problem(403, 'admin_required', 'Accès réservé aux administrateurs.')
        return f(*args, **kwargs)
    return decorated_function


def org_admin_required(f):
    """Supervisors only; one without an organization resolves to an empty scope."""
    @wraps(f)
    @jwt_required()
    def decorated_function(*args, **kwargs):
        current_user_id = int(get_jwt_identity())
        user = db.session.get(User, current_user_id)
        if not user.is_org_admin() or not user.organization_id:
            raise Problem(403, 'supervisor_required', 'Réservé aux superviseurs.')
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


def get_current_user():
    """The account of the session, on a route that asks for one.

    Never None: the token loader has already refused a token whose account is gone.
    """
    return db.session.get(User, int(get_jwt_identity()))


def member_view(user) -> dict:
    site = user.restaurant
    return {
        'id': user.id,
        'email': user.email,
        'username': user.username,
        'role': user.role,
        'is_active': user.is_active,
        'mfa_enabled': user.mfa_enabled,
        'passkeys_count': user.passkeys.count(),
        'is_rescue_account': user.is_rescue_account,
        'site': {'slug': site.slug, 'name': site.name} if site else None,
        'created_at': as_utc(user.created_at),
        'last_login': as_utc(user.last_login),
    }


def account_view(user) -> dict:
    """The signed-in account; a site's team takes its organization from the site."""
    organization = (
        db.session.get(Organization, user.organization_id) if user.organization_id
        else user.restaurant.organization if user.restaurant else None
    )
    return {
        **member_view(user),
        'organization': (
            {'slug': organization.slug, 'name': organization.name} if organization else None
        ),
    }


def audit(action: str, restaurant: Restaurant | None, **fields) -> None:
    """An audit entry of the session's account, on one site or on none."""
    AuditLog.log(
        action=action,
        user_id=get_current_user().id,
        restaurant_id=restaurant.id if restaurant else None,
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
