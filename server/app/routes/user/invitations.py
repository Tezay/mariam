from flask_jwt_extended import jwt_required
from sqlalchemy.exc import IntegrityError

from ...extensions import db
from ...models import AuditLog
from ...problems import Problem
from ...schemas.user import AccountSchema, InvitationAcceptSchema
from ...security import get_client_ip, limiter
from ...services.access import grant_invitation, holds_invitation_place, site_is_full
from ..auth._common import invitation_link
from ..helpers import account_view, get_current_user, member_limit
from .blueprint import user_bp


def _already_member() -> Problem:
    return Problem(409, 'already_member', 'Votre compte a déjà cet accès.')


@user_bp.route('/invitations', methods=['POST'])
@limiter.limit('10 per minute')
@jwt_required()
@user_bp.arguments(InvitationAcceptSchema)
@user_bp.response(201, AccountSchema)
@user_bp.problem(404, 'link_unknown')
@user_bp.problem(409, 'already_member', 'member_limit')
@user_bp.problem(410, 'link_expired')
def accept_invitation(body):
    """Accept an invitation with the signed-in account: it gains the invitation's site and
    role, or its supervision.

    The token is the one in the invitation's link, sent in the body to keep it out of
    access logs. As at activation, the account need not have the address it suggested.
    """
    user = get_current_user()
    link = invitation_link(body['token'], lock=True)
    if holds_invitation_place(user, link):
        raise _already_member()
    if link.restaurant_id is not None and site_is_full(link.restaurant_id):
        raise member_limit()
    link.mark_as_used()
    try:
        grant_invitation(user, link)
        db.session.flush()
    except IntegrityError:
        # Another invitation to the same place, accepted at the same moment.
        db.session.rollback()
        raise _already_member() from None
    AuditLog.log(
        action=AuditLog.ACTION_MEMBER_JOIN,
        user_id=user.id,
        restaurant_id=link.restaurant_id,
        organization_id=link.organization_id,
        target_type='user',
        target_id=user.id,
        details={'role': link.role, 'invitation_id': link.id, 'invited_by': link.created_by_id},
        ip_address=get_client_ip(),
    )
    db.session.commit()
    return account_view(user), 201
