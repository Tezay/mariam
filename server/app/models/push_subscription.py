import base64
import hashlib
from datetime import time

from ..extensions import db
from ..utils.time import utc_now_naive


def endpoint_fingerprint(endpoint: str) -> str:
    """SHA-256 of the endpoint in base64url: the subscription's address, which the
    browser computes as well and which, unlike the endpoint, lets no one push.
    """
    digest = hashlib.sha256(endpoint.encode()).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b'=').decode()


class PushSubscription(db.Model):
    """Anonymous: the browser's endpoint is its identity."""

    __tablename__ = 'push_subscriptions'

    id = db.Column(db.Integer, primary_key=True)
    restaurant_id = db.Column(db.Integer, db.ForeignKey('restaurants.id'), nullable=False)

    endpoint = db.Column(db.Text, nullable=False, unique=True, index=True)
    endpoint_sha256 = db.Column(db.String(43), unique=True, nullable=True)
    p256dh = db.Column(db.Text, nullable=False)
    auth = db.Column(db.Text, nullable=False)

    notify_today_menu = db.Column(db.Boolean, default=True, nullable=False)
    notify_today_menu_time = db.Column(db.Time, default=time(11, 0), nullable=False)

    notify_tomorrow_menu = db.Column(db.Boolean, default=False, nullable=False)
    notify_tomorrow_menu_time = db.Column(db.Time, default=time(19, 0), nullable=False)

    notify_events = db.Column(db.Boolean, default=True, nullable=False)

    platform = db.Column(db.String(20), nullable=True)  # android, ios, desktop
    created_at = db.Column(db.DateTime, default=utc_now_naive, nullable=False)
    updated_at = db.Column(db.DateTime, default=utc_now_naive, onupdate=utc_now_naive, nullable=False)
    last_notified_at = db.Column(db.DateTime, nullable=True)

    restaurant = db.relationship('Restaurant', backref=db.backref('push_subscriptions', lazy='dynamic'))

    def get_subscription_info(self):
        """In the shape pywebpush expects."""
        return {
            'endpoint': self.endpoint,
            'keys': {
                'p256dh': self.p256dh,
                'auth': self.auth,
            }
        }

    def __repr__(self):
        return f'<PushSubscription {self.id} ({self.platform or "unknown"})>'
