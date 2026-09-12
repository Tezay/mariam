"""Student ratings of a published day's menu.

Uniqueness is scoped to the organization, not the site: a student eats once a
day, wherever they eat. `restaurant_id` still records which site was rated. No
fingerprint is persisted here; the link between a fingerprint and a device lives
in Redis for 48 hours (see services/votes.py).
"""
from datetime import UTC, datetime

from ..extensions import db

RATING_MIN = 1
RATING_MAX = 3

# Below this, an average says more about the sample than about the dish.
MIN_SITE_VOTES = 5

# Icon sets the widget can render. The drawings live in the client's rating
# module; only the identifier is stored, so both lists move together.
VOTE_ICON_PRESETS = ('thumbs', 'faces', 'stars')
DEFAULT_ICON_PRESET = 'thumbs'

menu_vote_dishes = db.Table(
    'menu_vote_dishes',
    db.Column('vote_id', db.Integer, db.ForeignKey('menu_votes.id', ondelete='CASCADE'),
              primary_key=True),
    db.Column('dish_id', db.Integer, db.ForeignKey('dish_catalog.id', ondelete='CASCADE'),
              primary_key=True),
)


class MenuVote(db.Model):
    __tablename__ = 'menu_votes'

    id = db.Column(db.Integer, primary_key=True)
    organization_id = db.Column(
        db.Integer, db.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False
    )
    restaurant_id = db.Column(
        db.Integer, db.ForeignKey('restaurants.id', ondelete='CASCADE'), nullable=False
    )
    menu_id = db.Column(db.Integer, db.ForeignKey('menus.id', ondelete='CASCADE'), nullable=False)
    # Denormalised from the menu so the aggregates never join to filter a period.
    date = db.Column(db.Date, nullable=False)
    # Cleared once the day is over: it only guards against a second vote and
    # lets its author edit until midnight, after which keeping it would leave a
    # persistent identifier on an otherwise anonymous row.
    device_id = db.Column(db.String(64), nullable=True)
    rating = db.Column(db.SmallInteger, nullable=False)
    # Single-valued today; the column keeps a non-web source separable.
    source = db.Column(db.String(20), nullable=False, default='web')
    # Recorded per vote: reading the site's current setting would misattribute
    # every vote cast under a previous one.
    icon_preset = db.Column(db.String(20), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    dishes = db.relationship('DishCatalog', secondary=menu_vote_dishes, lazy='selectin')

    __table_args__ = (
        db.UniqueConstraint(
            'organization_id', 'date', 'device_id', name='uq_vote_org_date_device'
        ),
        # The unique constraint no longer leads with the site, which the per-site
        # aggregates filter on.
        db.Index('ix_menu_votes_site_date', 'restaurant_id', 'date'),
        db.CheckConstraint(
            f'rating >= {RATING_MIN} AND rating <= {RATING_MAX}', name='ck_menu_vote_rating'
        ),
    )

    def to_dict(self) -> dict:
        return {
            'rating': self.rating,
            'dish_ids': [dish.id for dish in self.dishes],
            'restaurant_id': self.restaurant_id,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
