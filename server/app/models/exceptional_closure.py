from datetime import datetime, timezone
from ..extensions import db


class ExceptionalClosure(db.Model):
    """Fermeture exceptionnelle du restaurant (vacances, jours fériés, travaux, grèves…)."""

    __tablename__ = 'exceptional_closures'

    id            = db.Column(db.Integer, primary_key=True)
    restaurant_id = db.Column(db.Integer, db.ForeignKey('restaurants.id'), nullable=False)

    start_date  = db.Column(db.Date, nullable=False, index=True)
    end_date    = db.Column(db.Date, nullable=False, index=True)  # == start_date pour 1 seul jour
    reason      = db.Column(db.String(100), nullable=True)        # "Vacances scolaires", "Grève"…
    description = db.Column(db.Text, nullable=True)

    is_active = db.Column(db.Boolean, default=True, nullable=False)

    # Suivi des notifications push (J-7 / J-1 avant start_date)
    notified_7d = db.Column(db.Boolean, default=False, nullable=False)
    notified_1d = db.Column(db.Boolean, default=False, nullable=False)

    created_at    = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at    = db.Column(db.DateTime(timezone=True), onupdate=lambda: datetime.now(timezone.utc))
    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

    created_by = db.relationship('User', backref='created_closures', foreign_keys=[created_by_id])

    def to_dict(self, today=None):
        from ..utils.time import paris_today
        if today is None:
            today = paris_today()
        return {
            'id':            self.id,
            'restaurant_id': self.restaurant_id,
            'start_date':    self.start_date.isoformat() if self.start_date else None,
            'end_date':      self.end_date.isoformat() if self.end_date else None,
            'reason':        self.reason,
            'description':   self.description,
            'is_active':     self.is_active,
            'is_current':    self.start_date <= today <= self.end_date if self.start_date and self.end_date else False,
            'notified_7d':   self.notified_7d,
            'notified_1d':   self.notified_1d,
            'created_at':    self.created_at.isoformat() if self.created_at else None,
            'updated_at':    self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self):
        return f'<ExceptionalClosure {self.start_date}–{self.end_date}: {self.reason}>'
