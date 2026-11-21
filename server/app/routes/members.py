"""Accounts and invitations: a site's under the site, its supervisors' under the organization.

A site admin manages the accounts of its site, a supervisor those of the other
supervisors; a supervisor reads a site's accounts but never changes them.
"""
from flask_smorest import Blueprint
from limits import parse
from sqlalchemy.orm import joinedload, selectinload

from ..extensions import db
from ..models import (
    ActivationLink,
    AuditLog,
    Organization,
    OrgSupervision,
    Restaurant,
    SiteMembership,
    User,
)
from ..pagination import paginate
from ..problems import Problem
from ..schemas.common import PageQuerySchema
from ..schemas.members import (
    InvitationListSchema,
    InvitationSchema,
    MemberListSchema,
    MemberPatchSchema,
    MemberSchema,
    PasswordResetSchema,
    SiteInvitationInputSchema,
    SupervisorInvitationInputSchema,
    SupervisorPatchSchema,
)
from ..security import spend
from ..services.access import ADMIN, SUPERVISOR, mirror_first_place, reach_of, supervises
from ..services.account import (
    SecurityEvent,
    notify_invitation,
    notify_password_reset,
    notify_security_event,
    reset_second_factor,
)
from ..utils.time import as_utc
from ..utils.urls import frontend_base_url
from .helpers import (
    admin_required,
    audit,
    get_current_user,
    member_view,
    org_admin_required,
    refuse_supervisor,
    site_admin_required,
    step_up_required,
)
from .scope import member_org, member_site, site_access

# The limit by recipient does not bound an account that writes to many addresses.
INVITATION_EMAILS = parse('20 per day')
PENDING_SHOWN = 50

members_bp = Blueprint(
    'members', __name__,
    description="Accounts and invitations, of a site or of the organization's supervisors",
)


def invitation_view(link) -> dict:
    author = link.created_by
    return {
        'id': link.id,
        'token': link.token,
        'email': link.email,
        'role': link.role,
        'expires_at': as_utc(link.expires_at),
        'emailed': link.emailed,
        'created_by_name': (author.username or author.email) if author else None,
    }


def _site_accounts(restaurant: Restaurant):
    members = db.session.query(SiteMembership.user_id).filter(
        SiteMembership.restaurant_id == restaurant.id
    )
    return User.query.filter(User.id.in_(members))


def org_accounts(org: Organization):
    sites = db.session.query(Restaurant.id).filter(Restaurant.organization_id == org.id)
    members = db.session.query(SiteMembership.user_id).filter(
        SiteMembership.restaurant_id.in_(sites)
    )
    supervisors = db.session.query(OrgSupervision.user_id).filter(
        OrgSupervision.organization_id == org.id
    )
    return User.query.filter(db.or_(User.id.in_(members), User.id.in_(supervisors)))


def _found(accounts, user_id: int):
    user = accounts.filter(User.id == user_id).first()
    if user is None:
        raise Problem(404, 'member_not_found', 'Compte introuvable.')
    return user


def _site_member(restaurant: Restaurant, user_id: int):
    return _found(_site_accounts(restaurant), user_id)


def _supervisor(org: Organization, user_id: int):
    user = _found(org_accounts(org), user_id)
    if not supervises(user, org.id):
        refuse_supervisor(SUPERVISOR)
    return user


def _place(user, restaurant: Restaurant | None, org: Organization):
    if restaurant is not None:
        return next((m for m in user.memberships if m.restaurant_id == restaurant.id), None)
    return next((s for s in user.supervisions if s.organization_id == org.id), None)


def _changeable(user, detail: str) -> None:
    if user.is_rescue_account:
        raise Problem(403, 'rescue_account', 'Le compte de secours ne peut pas être modifié.')
    if user.id == get_current_user().id:
        raise Problem(403, 'own_account', detail)


def _in_reach(user) -> None:
    # An admin's reset hands back the link when it cannot be emailed: on an account
    # that opens other sites too, it would open them to this admin.
    if not reach_of(get_current_user()).covers(user):
        raise Problem(
            403, 'account_shared',
            "Ce compte a aussi accès à des restaurants que vous ne gérez pas : "
            "vous pouvez seulement le retirer d'ici.",
        )


def _list(accounts, query, org: Organization, restaurant: Restaurant | None = None):
    body, headers = paginate(
        accounts.options(
            selectinload(User.memberships).joinedload(SiteMembership.restaurant),  # type: ignore[arg-type]
            selectinload(User.supervisions),  # type: ignore[arg-type]
        ).order_by(User.created_at.desc(), User.id),
        query['page'], query['per_page'],
    )
    reach = reach_of(get_current_user())
    body['items'] = [member_view(user, org, reach, restaurant) for user in body['items']]
    return body, headers


def _patch(user, body: dict, restaurant: Restaurant | None, org: Organization) -> dict:
    if user.is_rescue_account:
        raise Problem(403, 'rescue_account', 'Le compte de secours ne peut pas être modifié.')
    membership = _place(user, restaurant, org) if restaurant else None
    if user.id == get_current_user().id:
        if body.get('is_active') is False:
            raise Problem(403, 'own_account', 'Vous ne pouvez pas désactiver votre propre compte.')
        if membership and body.get('role', membership.role) != membership.role:
            raise Problem(403, 'own_account', 'Vous ne pouvez pas changer votre propre rôle.')
    if 'is_active' in body and body['is_active'] != user.is_active:
        _in_reach(user)
        # A disabled account's tokens are refused as long as it stays disabled;
        # revoking them keeps its old sessions from returning with it.
        if not body['is_active']:
            user.revoke_tokens()
        user.is_active = body['is_active']
    if membership and 'role' in body:
        membership.role = body['role']
        mirror_first_place(user)
    audit(
        AuditLog.ACTION_USER_UPDATE, restaurant, org,
        target_type='user', target_id=user.id, details={'changes': body},
    )
    db.session.commit()
    return member_view(user, org, reach_of(get_current_user()), restaurant)


def _remove(user, restaurant: Restaurant | None, org: Organization) -> None:
    _changeable(user, 'Vous ne pouvez pas vous retirer vous-même.')
    place = _place(user, restaurant, org)
    if len(user.memberships) + len(user.supervisions) > 1:
        (user.memberships if restaurant else user.supervisions).remove(place)
        mirror_first_place(user)
        audit(
            AuditLog.ACTION_MEMBER_REMOVE, restaurant, org,
            target_type='user', target_id=user.id, details={'email': user.email},
        )
    else:
        audit(
            AuditLog.ACTION_USER_DELETE, restaurant, org,
            target_type='user', target_id=user.id, details={'email': user.email},
        )
        db.session.delete(user)
    db.session.commit()


def _reset_second_factors(user, restaurant: Restaurant | None, org: Organization) -> None:
    # The account page keeps one factor on the caller's own account at all
    # times; this route would be a way around it.
    _changeable(user, 'Gérez votre propre double authentification depuis Mon compte.')
    _in_reach(user)
    removed = reset_second_factor(user)
    audit(
        AuditLog.ACTION_MFA_DISABLED, restaurant, org,
        target_type='user', target_id=user.id,
        details={'totp_removed': True, 'passkeys_removed': removed},
    )
    db.session.commit()
    notify_security_event(user, SecurityEvent.SECOND_FACTORS_RESET)


def _send_password_reset(user, restaurant: Restaurant | None, org: Organization) -> tuple[dict, int]:
    _changeable(user, 'Changez votre propre mot de passe depuis Mon compte.')
    _in_reach(user)
    if not user.is_active:
        raise Problem(409, 'member_inactive', 'Ce compte est désactivé.')
    if not user.has_second_factor():
        raise Problem(
            409, 'second_factor_missing',
            "Ce compte n'a aucun second facteur : il ne pourrait pas confirmer son identité. "
            'Supprimez-le, puis invitez-le de nouveau.',
        )
    link = ActivationLink.create_password_reset_link(
        email=user.email, created_by_id=get_current_user().id
    )
    db.session.add(link)
    audit(
        AuditLog.ACTION_PASSWORD_RESET_REQUEST, restaurant, org,
        target_type='user', target_id=user.id, details={'method': 'dashboard'},
    )
    db.session.commit()
    url = f'{frontend_base_url()}/reset-password/{link.token}'
    emailed = notify_password_reset(user, url)
    return {'emailed': emailed, 'reset_url': None if emailed else url}, 201


def _pending(scope):
    return ActivationLink.query.filter(
        ActivationLink.link_type == 'invite', ActivationLink.pending_filter(), scope
    )


def _list_invitations(scope) -> dict:
    links = (
        _pending(scope).options(joinedload(ActivationLink.created_by))  # type: ignore[arg-type]
        .order_by(ActivationLink.created_at.desc())
        .limit(PENDING_SHOWN)
    )
    return {'items': [invitation_view(link) for link in links]}


def _invite(body: dict, role: str, org: Organization, restaurant: Restaurant | None):
    inviter = get_current_user()
    email = body['email']
    account = User.query.filter_by(email=email).first() if email else None
    if account is not None and _place(account, restaurant, org) is not None:
        raise Problem(409, 'already_member', 'Ce compte a déjà cet accès.')
    # Spent before anything is written: a limiter that fails must stop the
    # request here, not after the invitation exists.
    by_email = body['send_email'] and spend(INVITATION_EMAILS, 'invitation-email', str(inviter.id))
    link = ActivationLink.create_invite_link(
        email=email,
        role=role,
        created_by_id=inviter.id,
        restaurant_id=restaurant.id if restaurant else None,
        organization_id=org.id,
    )
    db.session.add(link)
    db.session.flush()
    audit(
        AuditLog.ACTION_ACTIVATION_LINK_CREATE, restaurant, org,
        target_type='activation_link', target_id=link.id,
        details={'email': email, 'role': role, 'by_email': by_email},
    )
    db.session.commit()
    if by_email and notify_invitation(link, inviter, has_account=account is not None):
        link.emailed = True
        db.session.commit()
    return invitation_view(link), 201


def _revoke(scope, invitation_id: int, restaurant: Restaurant | None, org: Organization) -> None:
    # Locked like the activation that may be reading it: whichever commits
    # first decides, and the other finds the link spent or revoked.
    link = _pending(scope).filter(ActivationLink.id == invitation_id).with_for_update().first()
    if link is None:
        raise Problem(404, 'invitation_not_found', 'Invitation introuvable.')
    link.revoke()
    audit(
        AuditLog.ACTION_ACTIVATION_LINK_REVOKE, restaurant, org,
        target_type='activation_link', target_id=link.id,
        details={'email': link.email, 'role': link.role},
    )
    db.session.commit()


def _site_invitations(restaurant: Restaurant):
    return ActivationLink.restaurant_id == restaurant.id


def _supervisor_invitations(org: Organization):
    return db.and_(
        ActivationLink.organization_id == org.id, ActivationLink.restaurant_id.is_(None)
    )


@members_bp.route('/<org>/sites/<site>/members', methods=['GET'])
@admin_required
@members_bp.arguments(PageQuerySchema, location='query')
@members_bp.response(200, MemberListSchema)
def list_site_members(query, org: str, site: str):
    """The site's accounts, newest first."""
    restaurant = member_site(org, site)
    return _list(_site_accounts(restaurant), query, restaurant.organization, restaurant)


@members_bp.route('/<org>/sites/<site>/members/<int:user_id>', methods=['PATCH'])
@site_admin_required
@members_bp.arguments(MemberPatchSchema)
@members_bp.response(200, MemberSchema)
def patch_site_member(body, org: str, site: str, user_id: int):
    """Change an account's role on the site, or turn it off: its sessions end at once.

    Turning off an account that holds places beyond the caller's reach is refused
    (403 `account_shared`), as are resetting its password or its second factors.
    """
    restaurant = member_site(org, site)
    return _patch(_site_member(restaurant, user_id), body, restaurant, restaurant.organization)


@members_bp.route('/<org>/sites/<site>/members/<int:user_id>', methods=['DELETE'])
@site_admin_required
@step_up_required
@members_bp.response(204)
def delete_site_member(org: str, site: str, user_id: int):
    """Remove an account from the site, from a confirmed session; its last place deletes it."""
    restaurant = member_site(org, site)
    _remove(_site_member(restaurant, user_id), restaurant, restaurant.organization)


@members_bp.route('/<org>/sites/<site>/members/<int:user_id>/second-factors', methods=['DELETE'])
@site_admin_required
@step_up_required
@members_bp.response(204)
def reset_site_member_second_factors(org: str, site: str, user_id: int):
    """Remove an account's second factors and end its sessions, from a confirmed session.

    The account stays active: it signs in with its password and sets up a new one.
    """
    restaurant = member_site(org, site)
    _reset_second_factors(_site_member(restaurant, user_id), restaurant, restaurant.organization)


@members_bp.route('/<org>/sites/<site>/members/<int:user_id>/password-reset', methods=['POST'])
@site_admin_required
@step_up_required
@members_bp.response(201, PasswordResetSchema)
def reset_site_member_password(org: str, site: str, user_id: int):
    """Send an account a link to choose a new password, from a confirmed session.

    The link goes to the account's address, and comes back only when it could
    not be emailed. It serves once, for 72 hours, and replaces the pending ones;
    the reset page still asks for the account's second factor.
    """
    restaurant = member_site(org, site)
    return _send_password_reset(
        _site_member(restaurant, user_id), restaurant, restaurant.organization
    )


@members_bp.route('/<org>/sites/<site>/invitations', methods=['GET'])
@site_admin_required
@members_bp.response(200, InvitationListSchema)
def list_site_invitations(org: str, site: str):
    """The site's pending invitations, the 50 latest, for its own admins."""
    restaurant, role = site_access(org, site)
    # A link's token is enough to create the account: reading one is writing.
    if role != ADMIN:
        refuse_supervisor(SUPERVISOR)
    return _list_invitations(_site_invitations(restaurant))


@members_bp.route('/<org>/sites/<site>/invitations', methods=['POST'])
@site_admin_required
@step_up_required
@members_bp.arguments(SiteInvitationInputSchema)
@members_bp.response(201, InvitationSchema)
def create_site_invitation(body, org: str, site: str):
    """Invite someone to the site, from a confirmed session.

    The link's token creates the account at `/activate/<token>`, or gives the site to
    an account already signed in (`POST /v1/user/invitations`). With `send_email` it
    is also emailed to `email`, twenty times a day at most for one administrator;
    `emailed` tells whether it left.
    """
    restaurant = member_site(org, site)
    return _invite(body, body['role'], restaurant.organization, restaurant)


@members_bp.route('/<org>/sites/<site>/invitations/<int:invitation_id>', methods=['DELETE'])
@site_admin_required
@members_bp.response(204)
def revoke_site_invitation(org: str, site: str, invitation_id: int):
    """Revoke a pending invitation: its link stops working at once."""
    restaurant = member_site(org, site)
    _revoke(_site_invitations(restaurant), invitation_id, restaurant, restaurant.organization)


@members_bp.route('/<org>/members', methods=['GET'])
@org_admin_required
@members_bp.arguments(PageQuerySchema, location='query')
@members_bp.response(200, MemberListSchema)
def list_org_members(query, org: str):
    """Every account of the organization, its supervisors and its sites', newest first."""
    organization = member_org(org)
    return _list(org_accounts(organization), query, organization)


@members_bp.route('/<org>/members/<int:user_id>', methods=['PATCH'])
@org_admin_required
@members_bp.arguments(SupervisorPatchSchema)
@members_bp.response(200, MemberSchema)
def patch_org_member(body, org: str, user_id: int):
    """Turn a supervisor's account off or on; its sessions end at once."""
    organization = member_org(org)
    return _patch(_supervisor(organization, user_id), body, None, organization)


@members_bp.route('/<org>/members/<int:user_id>', methods=['DELETE'])
@org_admin_required
@step_up_required
@members_bp.response(204)
def delete_org_member(org: str, user_id: int):
    """Remove a supervisor, from a confirmed session; its last place deletes the account."""
    organization = member_org(org)
    _remove(_supervisor(organization, user_id), None, organization)


@members_bp.route('/<org>/members/<int:user_id>/second-factors', methods=['DELETE'])
@org_admin_required
@step_up_required
@members_bp.response(204)
def reset_org_member_second_factors(org: str, user_id: int):
    """Remove a supervisor's second factors and end its sessions, from a confirmed session."""
    organization = member_org(org)
    _reset_second_factors(_supervisor(organization, user_id), None, organization)


@members_bp.route('/<org>/members/<int:user_id>/password-reset', methods=['POST'])
@org_admin_required
@step_up_required
@members_bp.response(201, PasswordResetSchema)
def reset_org_member_password(org: str, user_id: int):
    """Send a supervisor a link to choose a new password, from a confirmed session."""
    organization = member_org(org)
    return _send_password_reset(_supervisor(organization, user_id), None, organization)


@members_bp.route('/<org>/invitations', methods=['GET'])
@org_admin_required
@members_bp.response(200, InvitationListSchema)
def list_org_invitations(org: str):
    """The pending invitations of supervisors, the 50 latest."""
    return _list_invitations(_supervisor_invitations(member_org(org)))


@members_bp.route('/<org>/invitations', methods=['POST'])
@org_admin_required
@step_up_required
@members_bp.arguments(SupervisorInvitationInputSchema)
@members_bp.response(201, InvitationSchema)
def create_org_invitation(body, org: str):
    """Invite a supervisor, from a confirmed session; as for a site, `send_email` emails it."""
    return _invite(body, User.ROLE_ORG_ADMIN, member_org(org), None)


@members_bp.route('/<org>/invitations/<int:invitation_id>', methods=['DELETE'])
@org_admin_required
@members_bp.response(204)
def revoke_org_invitation(org: str, invitation_id: int):
    """Revoke a supervisor's pending invitation."""
    organization = member_org(org)
    _revoke(_supervisor_invitations(organization), invitation_id, None, organization)
