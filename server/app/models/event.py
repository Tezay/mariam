"""
Modèle Event & EventImage - Événements avec images S3.

Permet d'informer les étudiants d'événements spéciaux :
- Repas thématiques
- Fermetures exceptionnelles
- Animations

Chaque événement possède un titre, sous-titre, description (Markdown),
une couleur symbolique et jusqu'à 6 images stockées sur S3.
"""
from datetime import datetime
from ..extensions import db


class Event(db.Model):
    """Événement à afficher sur les écrans TV et mobile."""

    __tablename__ = 'events'

    id = db.Column(db.Integer, primary_key=True)
    restaurant_id = db.Column(db.Integer, db.ForeignKey('restaurants.id'), nullable=False)

    # Contenu
    title = db.Column(db.String(100), nullable=False)
    subtitle = db.Column(db.String(200), nullable=True)
    description = db.Column(db.Text, nullable=True)  # Markdown
    color = db.Column(db.String(7), nullable=True, default='#3498DB')  # Hex (#RRGGBB)

    # Planification
    event_date = db.Column(db.Date, nullable=False, index=True)
    status = db.Column(db.String(20), default='draft')  # draft, published
    visibility = db.Column(db.String(20), default='all')  # tv, mobile, all
    is_active = db.Column(db.Boolean, default=True)

    # Metadata
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

    # Relations
    created_by = db.relationship('User', backref='created_events', foreign_keys=[created_by_id])
    images = db.relationship(
        'EventImage', backref='event', lazy='dynamic',
        cascade='all, delete-orphan', order_by='EventImage.order',
    )

    # Constantes
    VALID_VISIBILITY = ['tv', 'mobile', 'all']
    VALID_STATUS = ['draft', 'published']

    def to_dict(self, include_images=True):
        """Sérialise l'événement en dictionnaire JSON."""
        data = {
            'id': self.id,
            'restaurant_id': self.restaurant_id,
            'title': self.title,
            'subtitle': self.subtitle,
            'description': self.description,
            'color': self.color,
            'event_date': self.event_date.isoformat() if self.event_date else None,
            'status': self.status,
            'visibility': self.visibility,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_images:
            data['images'] = [img.to_dict() for img in self.images.order_by(EventImage.order)]
        return data

    def __repr__(self):
        return f'<Event {self.event_date}: {self.title}>'


class EventImage(db.Model):
    """Image associée à un événement, stockée sur S3."""

    __tablename__ = 'event_images'

    id = db.Column(db.Integer, primary_key=True)
    event_id = db.Column(db.Integer, db.ForeignKey('events.id'), nullable=False)
    storage_key = db.Column(db.String(500), nullable=False)  # Clé S3
    url = db.Column(db.String(500), nullable=False)  # URL publique
    filename = db.Column(db.String(255), nullable=True)  # Nom original
    order = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        """Sérialise l'image en dictionnaire JSON."""
        return {
            'id': self.id,
            'event_id': self.event_id,
            'url': self.url,
            'filename': self.filename,
            'order': self.order,
        }

    def __repr__(self):
        return f'<EventImage {self.id} for Event {self.event_id}>'
