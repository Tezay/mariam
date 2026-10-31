from datetime import UTC, datetime

from ..extensions import db


class EgalimDeclaration(db.Model):
    """A site's purchases of one year, as its annual EGalim report gives them."""

    __tablename__ = 'egalim_declarations'
    __table_args__ = (
        db.UniqueConstraint('restaurant_id', 'year', name='uq_egalim_declaration_year'),
    )

    id = db.Column(db.Integer, primary_key=True)
    restaurant_id = db.Column(
        db.Integer, db.ForeignKey('restaurants.id', ondelete='CASCADE'), nullable=False
    )
    year = db.Column(db.Integer, nullable=False)
    # Percent of the year's food purchases, by value.
    sustainable_share = db.Column(db.Numeric(4, 1), nullable=False)
    organic_share = db.Column(db.Numeric(4, 1), nullable=False)
    territorial_share = db.Column(db.Numeric(4, 1), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
