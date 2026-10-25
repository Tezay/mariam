"""The weekly email's unsubscribe action, at the address the emails carry."""
from flask_smorest import Blueprint

from ..extensions import db
from ..problems import Problem
from ..security import limiter, public_limit
from ..services.email_service import user_from_token

weekly_emails_bp = Blueprint(
    'weekly_emails', __name__, description="The weekly email: the summary or the reopening notice"
)


@weekly_emails_bp.route('/<token>/unsubscribe', methods=['POST'])
@weekly_emails_bp.doc(security=[])
@limiter.limit(public_limit)
@weekly_emails_bp.response(204)
def unsubscribe(token: str):
    """Stop the weekly email of the account the email's token names.

    The one-click target of mail clients (RFC 8058), whose body is ignored, and
    of the page the email's own link opens.
    """
    user = user_from_token(token)
    if user is None:
        raise Problem(404, 'link_invalid', "Ce lien de désinscription n'est pas valable.")
    preferences = user.get_notification_preferences()
    preferences['weekly_digest'] = False
    user.notification_preferences = preferences
    db.session.commit()
