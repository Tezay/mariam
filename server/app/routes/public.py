"""The unsubscribe link of the weekly digest, at the address the emails carry."""
from flask import render_template, request
from flask_smorest import Blueprint

from ..extensions import db
from ..security import limiter, public_limit
from ..services.email_service import user_from_token
from ..utils.urls import frontend_base_url

public_bp = Blueprint('public', __name__, description='Links sent by email')


@public_bp.route('/unsubscribe/<token>', methods=['GET', 'POST'])
@public_bp.doc(security=[])
@limiter.limit(public_limit)
def unsubscribe(token: str):
    """Turn the weekly digest off from the email itself.

    POST answers the one-click of mail clients (RFC 8058); GET renders a page
    for the footer link, so neither needs a session.
    """
    user = user_from_token(token)
    if user:
        prefs = user.get_notification_preferences()
        prefs['weekly_digest'] = False
        user.notification_preferences = prefs
        db.session.commit()

    if request.method == 'POST':
        return '', 204
    return render_template(
        'public/unsubscribe.html',
        done=user is not None,
        url=frontend_base_url(),
    )
