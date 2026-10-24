from flask_smorest import Blueprint

from ..extensions import db
from ..models import AuditLog, ExceptionalClosure, Restaurant
from ..problems import Problem
from ..schemas.closures import (
    ClosureInputSchema,
    ClosureListSchema,
    ClosurePatchSchema,
    ClosureQuerySchema,
    ClosureSchema,
)
from ..security import limiter, public_limit
from ..utils.time import paris_today
from .helpers import audit, editor_required, get_current_user
from .scope import SESSION_OPTIONAL, finish_public_read, member_site, readable_site

closures_bp = Blueprint('closures', __name__, description="A site's exceptional closures")
closures_bp.after_request(finish_public_read)


def _site_closure(restaurant: Restaurant, closure_id: int) -> ExceptionalClosure:
    closure = ExceptionalClosure.query.filter_by(
        id=closure_id, restaurant_id=restaurant.id, is_active=True
    ).first()
    if closure is None:
        raise Problem(404, 'closure_not_found', 'Fermeture introuvable.')
    return closure


@closures_bp.route('', methods=['GET'])
@closures_bp.doc(security=SESSION_OPTIONAL)
@limiter.limit(public_limit)
@closures_bp.arguments(ClosureQuerySchema, location='query')
@closures_bp.response(200, ClosureListSchema)
def list_closures(query, org: str, site: str):
    """Closures that overlap the range, soonest first.

    Anyone reads those under way or to come. The site's editors read any range:
    without `from`, past closures as well.
    """
    restaurant, member = readable_site(org, site)
    closures = ExceptionalClosure.query.filter(
        ExceptionalClosure.restaurant_id == restaurant.id, ExceptionalClosure.is_active
    )
    start = query.get('start')
    if not member:
        start = max(start or paris_today(), paris_today())
    if start:
        closures = closures.filter(ExceptionalClosure.end_date >= start)
    if 'end' in query:
        closures = closures.filter(ExceptionalClosure.start_date <= query['end'])
    return {'items': closures.order_by(ExceptionalClosure.start_date.asc()).all()}


@closures_bp.route('', methods=['POST'])
@editor_required
@closures_bp.arguments(ClosureInputSchema)
@closures_bp.response(201, ClosureSchema)
def create_closure(body, org: str, site: str):
    """Close the site from one day to another, both included."""
    restaurant = member_site(org, site)
    closure = ExceptionalClosure(
        restaurant_id=restaurant.id,
        start_date=body['start_date'],
        end_date=body['end_date'],
        reason=body.get('reason'),
        description=body.get('description'),
        created_by_id=get_current_user().id,
    )
    db.session.add(closure)
    db.session.flush()
    audit(
        AuditLog.ACTION_CLOSURE_CREATE, restaurant,
        target_type='closure', target_id=closure.id,
        details={
            'start_date': closure.start_date.isoformat(),
            'end_date': closure.end_date.isoformat(),
            'reason': closure.reason,
        },
    )
    db.session.commit()
    return closure


@closures_bp.route('/<int:closure_id>', methods=['PATCH'])
@editor_required
@closures_bp.arguments(ClosurePatchSchema)
@closures_bp.response(200, ClosureSchema)
def patch_closure(body, org: str, site: str, closure_id: int):
    """Change a closure; a new start date sends its reminders again."""
    restaurant = member_site(org, site)
    closure = _site_closure(restaurant, closure_id)
    start = body.get('start_date', closure.start_date)
    end = body.get('end_date', closure.end_date)
    if end < start:
        raise Problem(
            422, 'range_invalid', 'La fin précède le début.',
            errors=[{'pointer': '/end_date', 'detail': 'La fin précède le début.'}],
        )
    if start != closure.start_date:
        closure.notified_7d = closure.notified_1d = False
    closure.start_date, closure.end_date = start, end
    for field in ('reason', 'description'):
        if field in body:
            setattr(closure, field, body[field])
    audit(
        AuditLog.ACTION_CLOSURE_UPDATE, restaurant,
        target_type='closure', target_id=closure.id, details={'updated_fields': sorted(body)},
    )
    db.session.commit()
    return closure


@closures_bp.route('/<int:closure_id>', methods=['DELETE'])
@editor_required
@closures_bp.response(204)
def delete_closure(org: str, site: str, closure_id: int):
    """Delete a closure."""
    restaurant = member_site(org, site)
    closure = _site_closure(restaurant, closure_id)
    audit(
        AuditLog.ACTION_CLOSURE_DELETE, restaurant,
        target_type='closure', target_id=closure.id,
        details={'start_date': closure.start_date.isoformat(), 'reason': closure.reason},
    )
    db.session.delete(closure)
    db.session.commit()
