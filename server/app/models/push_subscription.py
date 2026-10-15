from datetime import time

from ..extensions import db
from ..utils.time import utc_now_naive


class PushSubscription(db.Model):
    """Anonymous: the browser's endpoint is its identity."""

    __tablename__ = 'push_subscriptions'

    id = db.Column(db.Integer, primary_key=True)
    restaurant_id = db.Column(db.Integer, db.ForeignKey('restaurants.id'), nullable=False)

    endpoint = db.Column(db.Text, nullable=False, unique=True, index=True)
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

    def to_dict(self):
        """Leaves out the keys, which let anyone push to this browser."""
        return {
            'id': self.id,
            'restaurant_id': self.restaurant_id,
            'notify_today_menu': self.notify_today_menu,
            'notify_today_menu_time': self.notify_today_menu_time.strftime('%H:%M') if self.notify_today_menu_time else '11:00',
            'notify_tomorrow_menu': self.notify_tomorrow_menu,
            'notify_tomorrow_menu_time': self.notify_tomorrow_menu_time.strftime('%H:%M') if self.notify_tomorrow_menu_time else '19:00',
            'notify_events': self.notify_events,
            'platform': self.platform,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

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
