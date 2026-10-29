from flask_jwt_extended import jwt_required
from limits import parse
from psycopg2.errors import UniqueViolation
from sqlalchemy.exc import IntegrityError

from ...extensions import db
from ...models import AuditLog, User
from ...problems import Problem
from ...schemas.user import (
    AccountSchema,
    AlertListSchema,
    NotificationPreferencesSchema,
    ProfilePatchSchema,
    UiPreferencesSchema,
)
from ...security import get_client_ip, limiter, seconds_until_reset, spend
from ...services.access import accessible_restaurant_ids
from ...services.account import change_email, notify_email_changed
from ...services.alerts import live_alerts
from ..auth._common import reopen_session
from ..helpers import account_view, get_current_user, step_up_required
from .blueprint import user_bp

EMAIL_CHANGES = parse('2 per day')


def _audit(user: User, action: str, details: dict) -> None:
    AuditLog.log(
        action=action,
        user_id=user.id,
        restaurant_id=user.restaurant_id,
        target_type='user',
        target_id=user.id,
        details=details,
        ip_address=get_client_ip(),
    )


def _refused(user: User, reason: str, problem: Problem) -> Problem:
    _audit(user, AuditLog.ACTION_EMAIL_CHANGE, {'success': False, 'reason': reason})
    db.session.commit()
    return problem


def _address_taken(user: User) -> Problem:
    return _refused(user, 'address_in_use', Problem(
        409, 'email_taken', 'Cette adresse est déjà utilisée par un autre compte.'
    ))


@user_bp.route('', methods=['GET'])
@jwt_required()
@user_bp.response(200, AccountSchema)
def get_account():
    """The signed-in account."""
    return account_view(get_current_user())


@user_bp.route('', methods=['PATCH'])
@limiter.limit('10 per hour')
@jwt_required()
@step_up_required
@user_bp.arguments(ProfilePatchSchema)
@user_bp.response(200, AccountSchema)
@user_bp.problem(403, 'step_up_required', 'rescue_account')
@user_bp.problem(409, 'email_taken')
@user_bp.problem(429, 'email_change_limit')
def patch_account(body):
    """Change the display name or the sign-in address, from a confirmed session.

    A new address ends every other session and opens a new one for the caller,
    which is not confirmed; the previous address is told by email. An account
    changes address twice a day at most.
    """
    user = get_current_user()
    name, email = body.get('username'), body.get('email')
    renames = name is not None and name != user.username
    moves = email is not None and email != user.email

    if moves:
        if user.is_rescue_account:
            raise _refused(user, 'rescue_account', Problem(
                403, 'rescue_account', "L'adresse de ce compte est gérée par le support."
            ))
        if User.query.filter_by(email=email).first():
            raise _address_taken(user)
        if not spend(EMAIL_CHANGES, 'email-change', str(user.id)):
            wait = seconds_until_reset(EMAIL_CHANGES, 'email-change', str(user.id))
            raise _refused(user, 'daily_limit', Problem(
                429, 'email_change_limit',
                "Vous avez déjà changé d'adresse deux fois aujourd'hui. Réessayez demain.",
                headers={'Retry-After': str(wait or 1)},
            ))

    if renames:
        _audit(user, AuditLog.ACTION_USER_UPDATE, {
            'field': 'username', 'old': user.username, 'new': name,
        })
        user.username = name

    previous_email = None
    if moves:
        previous_email = change_email(user, email)
        reopen_session(user)
        _audit(user, AuditLog.ACTION_EMAIL_CHANGE, {
            'success': True, 'old': previous_email, 'new': email,
        })

    try:
        db.session.commit()
    except IntegrityError as exc:
        db.session.rollback()
        # Two accounts can pass the lookup above with the same address; the
        # unique index decides between them.
        if isinstance(exc.orig, UniqueViolation):
            raise _address_taken(user) from None
        raise

    if previous_email:
        notify_email_changed(previous_email, email)
    return account_view(user)


@user_bp.route('/ui-preferences', methods=['GET'])
@jwt_required()
@user_bp.response(200, UiPreferencesSchema)
def get_ui_preferences():
    """What the interface remembers for the account: the guided tours already seen."""
    return get_current_user().get_ui_preferences()


@user_bp.route('/ui-preferences', methods=['PATCH'])
@jwt_required()
@user_bp.arguments(UiPreferencesSchema)
@user_bp.response(200, UiPreferencesSchema)
def patch_ui_preferences(changes):
    """Change some of them; the others keep their value."""
    user = get_current_user()
    user.ui_preferences = {**user.get_ui_preferences(), **changes}
    db.session.commit()
    return user.ui_preferences


@user_bp.route('/notification-preferences', methods=['GET'])
@jwt_required()
@user_bp.response(200, NotificationPreferencesSchema)
def get_notification_preferences():
    """Which alerts the account sees, and when its weekly email lands."""
    return get_current_user().get_notification_preferences()


@user_bp.route('/notification-preferences', methods=['PATCH'])
@jwt_required()
@user_bp.arguments(NotificationPreferencesSchema)
@user_bp.response(200, NotificationPreferencesSchema)
def patch_notification_preferences(changes):
    """Change some of them; the others keep their value."""
    user = get_current_user()
    user.notification_preferences = {**user.get_notification_preferences(), **changes}
    db.session.commit()
    return user.notification_preferences


@user_bp.route('/alerts', methods=['GET'])
@jwt_required()
@user_bp.response(200, AlertListSchema)
def list_alerts():
    """The account's active alerts, computed now.

    On the sites the account may read: its own for a site's team, every site of
    the organization for a supervisor. Each rule reaches the accounts it is for.
    """
    user = get_current_user()
    return {'items': live_alerts(user, sorted(accessible_restaurant_ids(user)))}
