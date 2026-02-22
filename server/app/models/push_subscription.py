"""
Modèle PushSubscription - Souscriptions aux notifications push.

Stock les souscriptions Web Push (VAPID) des utilisateurs publics.
Aucune authentification requise : l'identifiant est l'endpoint du navigateur.

Chaque souscription contient :
- Les données techniques Web Push (endpoint, clés p256dh et auth)
- Les préférences de notification (menu du jour, menu du lendemain, événements)
- Les horaires de notification choisis par l'utilisateur
- La plateforme détectée (analytics)
"""
from datetime import datetime, time
from ..extensions import db


class PushSubscription(db.Model):
    """Souscription push d'un utilisateur."""

    __tablename__ = 'push_subscriptions'

    id = db.Column(db.Integer, primary_key=True)
    restaurant_id = db.Column(db.Integer, db.ForeignKey('restaurants.id'), nullable=False)

    # ========================================
    # Données techniques Web Push (VAPID)
    # ========================================
    endpoint = db.Column(db.Text, nullable=False, unique=True, index=True)
    p256dh = db.Column(db.Text, nullable=False)   # Clé publique client (Base64)
    auth = db.Column(db.Text, nullable=False)     # Secret d'authentification (Base64)

    # ========================================
    # Préférences de notification
    # ========================================
    # Menu du jour (notification quotidienne le matin)
    notify_today_menu = db.Column(db.Boolean, default=True, nullable=False)
    notify_today_menu_time = db.Column(db.Time, default=time(11, 0), nullable=False)

    # Menu du lendemain (notification la veille au soir)
    notify_tomorrow_menu = db.Column(db.Boolean, default=False, nullable=False)
    notify_tomorrow_menu_time = db.Column(db.Time, default=time(19, 0), nullable=False)

    # Événements à venir (notification à la publication)
    notify_events = db.Column(db.Boolean, default=True, nullable=False)

    # ========================================
    # Métadonnées
    # ========================================
    platform = db.Column(db.String(20), nullable=True)  # android, ios, desktop
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    last_notified_at = db.Column(db.DateTime, nullable=True)

    # Relations
    restaurant = db.relationship('Restaurant', backref=db.backref('push_subscriptions', lazy='dynamic'))

    def to_dict(self):
        """Sérialise la souscription en dictionnaire JSON (sans données sensibles)."""
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
        """Retourne les données nécessaires pour pywebpush."""
        return {
            'endpoint': self.endpoint,
            'keys': {
                'p256dh': self.p256dh,
                'auth': self.auth,
            }
        }

    def __repr__(self):
        return f'<PushSubscription {self.id} ({self.platform or "unknown"})>'
