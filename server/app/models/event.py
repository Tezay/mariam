"""
Modèle Event - Événements affichés sur les écrans TV et mobile.

Permet d'informer les étudiants d'événements spéciaux :
- Repas thématiques
- Fermetures exceptionnelles
- Animations
"""
from datetime import datetime
from ..extensions import db


class Event(db.Model):
    """Événement à afficher sur les écrans."""
    
    __tablename__ = 'events'
    
    id = db.Column(db.Integer, primary_key=True)
    restaurant_id = db.Column(db.Integer, db.ForeignKey('restaurants.id'), nullable=False)
    title = db.Column(db.String(100), nullable=False)
    description = db.Column(db.String(300), nullable=True)
    event_date = db.Column(db.Date, nullable=False, index=True)
    visibility = db.Column(db.String(20), default='all')  # tv, mobile, all
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    
    # Relation
    created_by = db.relationship('User', backref='created_events', foreign_keys=[created_by_id])
    
    # Valeurs de visibilité valides
    VALID_VISIBILITY = ['tv', 'mobile', 'all']
    
    def to_dict(self):
        """Sérialise l'événement en dictionnaire JSON."""
        return {
            'id': self.id,
            'restaurant_id': self.restaurant_id,
            'title': self.title,
            'description': self.description,
            'event_date': self.event_date.isoformat() if self.event_date else None,
            'visibility': self.visibility,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
    
    def __repr__(self):
        return f'<Event {self.event_date}: {self.title}>'
