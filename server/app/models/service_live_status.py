from datetime import UTC, datetime

from ..extensions import db


class ServiceLiveStatus(db.Model):
    """What the team says of a site's service, one row per day: it lapses with the date."""

    __tablename__ = 'service_live_status'
    __table_args__ = (
        db.UniqueConstraint('restaurant_id', 'day', name='uq_service_live_status_day'),
    )

    id = db.Column(db.Integer, primary_key=True)
    restaurant_id = db.Column(
        db.Integer, db.ForeignKey('restaurants.id', ondelete='CASCADE'), nullable=False
    )
    day = db.Column(db.Date, nullable=False)
    capacity_reached_at = db.Column(db.DateTime(timezone=True), nullable=True)
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
