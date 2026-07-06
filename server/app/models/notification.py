"""
Modèle Notification — Centre de notifications in-app (inbox).

Distinct des notifications Web Push (PushSubscription).
Stocke les alertes métier et actions multi-utilisateurs affichées
dans le centre de notifications de l'interface admin.
"""
from datetime import UTC, datetime

from ..extensions import db


class Notification(db.Model):
    """Notification in-app persistée en base."""

    __tablename__ = 'inbox_notifications'

    id            = db.Column(db.Integer, primary_key=True)
    restaurant_id = db.Column(db.Integer, db.ForeignKey('restaurants.id'), nullable=False, index=True)
    # None = broadcast (visible par tous les utilisateurs du restaurant)
    user_id       = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True, index=True)

    # 'business_alert' | 'user_action'
    type          = db.Column(db.String(50), nullable=False)
    title         = db.Column(db.String(200), nullable=False)
    body          = db.Column(db.Text, nullable=True)
    is_read       = db.Column(db.Boolean, default=False, nullable=False)

    # Données contextuelles libres (ex: { menu_date, actor_name, actor_id })
    meta          = db.Column(db.JSON, nullable=True)

    created_at    = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
        index=True,
    )

    # Relations
    restaurant = db.relationship('Restaurant', backref=db.backref('inbox_notifications', lazy='dynamic'))
    user       = db.relationship('User', backref=db.backref('inbox_notifications', lazy='dynamic'))

    def to_dict(self) -> dict:
        return {
            'id':            self.id,
            'type':          self.type,
            'title':         self.title,
            'body':          self.body,
            'is_read':       self.is_read,
            'meta':          self.meta or {},
            'created_at':    self.created_at.isoformat(),
        }

    @classmethod
    def create(
        cls,
        restaurant_id: int,
        type: str,
        title: str,
        body: str | None = None,
        meta: dict | None = None,
        user_id: int | None = None,
    ) -> 'Notification':
        """Crée et persiste une notification. Appeler db.session.commit() après."""
        notif = cls(
            restaurant_id=restaurant_id,
            user_id=user_id,
            type=type,
            title=title,
            body=body,
            meta=meta,
        )
        db.session.add(notif)
        return notif
