from datetime import UTC, datetime

from ..extensions import db


class ExceptionalClosure(db.Model):
    __tablename__ = 'exceptional_closures'

    id            = db.Column(db.Integer, primary_key=True)
    restaurant_id = db.Column(db.Integer, db.ForeignKey('restaurants.id'), nullable=False)

    start_date  = db.Column(db.Date, nullable=False, index=True)
    end_date    = db.Column(db.Date, nullable=False, index=True)  # Inclusive
    reason      = db.Column(db.String(100), nullable=True)
    description = db.Column(db.Text, nullable=True)

    notified_7d = db.Column(db.Boolean, default=False, nullable=False)
    notified_1d = db.Column(db.Boolean, default=False, nullable=False)

    created_at    = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at    = db.Column(db.DateTime(timezone=True), onupdate=lambda: datetime.now(UTC))
    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

    created_by = db.relationship('User', backref='created_closures', foreign_keys=[created_by_id])

    def __repr__(self):
        return f'<ExceptionalClosure {self.start_date}–{self.end_date}: {self.reason}>'
