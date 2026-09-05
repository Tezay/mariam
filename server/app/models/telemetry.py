"""Aggregate-only telemetry for the public menu pages.

No IP, user agent or per-visitor row ever reaches Postgres: counters are
accumulated in Redis and flushed here by the scheduler.
"""
from datetime import UTC, datetime

from ..extensions import db

# Widen as public views appear; the column is a plain string, so no migration.
PAGE_KINDS = ('today', 'tomorrow', 'tv', 'sites')

# The site list belongs to an organization, not a site.
ORG_PAGE_KINDS = ('sites',)

# Screens refresh on their own all day, and an organization-level page has no
# site to attribute a visitor to, so neither feeds the unique-visitor estimate.
VISITOR_PAGE_KINDS = tuple(k for k in PAGE_KINDS if k not in ORG_PAGE_KINDS and k != 'tv')


class PageViewRollup(db.Model):
    """Hourly page views per owner and page kind, flushed from Redis.

    The owner is a site, or the organization for its public root. NULLS NOT
    DISTINCT keeps one unique constraint — and one upsert path — across both.
    """

    __tablename__ = 'page_view_rollups'

    id = db.Column(db.Integer, primary_key=True)
    restaurant_id = db.Column(
        db.Integer, db.ForeignKey('restaurants.id', ondelete='CASCADE'), nullable=True
    )
    organization_id = db.Column(
        db.Integer, db.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=True
    )
    date = db.Column(db.Date, nullable=False)
    hour = db.Column(db.SmallInteger, nullable=False)
    page_kind = db.Column(db.String(20), nullable=False)
    views = db.Column(db.Integer, nullable=False, default=0)
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    __table_args__ = (
        db.UniqueConstraint(
            'restaurant_id', 'organization_id', 'date', 'hour', 'page_kind',
            name='uq_pv_rollup_owner_date_hour_kind',
            postgresql_nulls_not_distinct=True,
        ),
        db.Index('ix_pv_rollups_date', 'date'),
        db.CheckConstraint('hour >= 0 AND hour <= 23', name='ck_pv_rollup_hour'),
        db.CheckConstraint(
            '(restaurant_id IS NULL) <> (organization_id IS NULL)',
            name='ck_pv_rollup_single_owner',
        ),
    )

    def __repr__(self):
        return f'<PageViewRollup {self.date} {self.hour}h {self.page_kind}={self.views}>'


class VisitorDailyUnique(db.Model):
    """Approximate unique visitors per site and day, closed from a Redis HyperLogLog.

    Daily granularity is imposed by the salt rotation: the hashes of two days are
    not comparable, so they cannot be merged into a finer bucket.
    """

    __tablename__ = 'visitor_daily_uniques'

    id = db.Column(db.Integer, primary_key=True)
    restaurant_id = db.Column(
        db.Integer, db.ForeignKey('restaurants.id', ondelete='CASCADE'), nullable=False
    )
    date = db.Column(db.Date, nullable=False)
    unique_visitors = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(UTC))

    __table_args__ = (
        db.UniqueConstraint('restaurant_id', 'date', name='uq_uv_site_date'),
        db.Index('ix_visitor_daily_uniques_date', 'date'),
    )

    def __repr__(self):
        return f'<VisitorDailyUnique {self.date} site={self.restaurant_id}={self.unique_visitors}>'
