from datetime import UTC, datetime

from ..extensions import db

KINDS = ('trial', 'paid', 'complimentary')
RENEWALS = ('undecided', 'tacit', 'ending')


class SubscriptionPeriod(db.Model):
    """A period of a site's subscription to the hosted service, as its operator records it."""

    __tablename__ = 'subscription_periods'
    __table_args__ = (
        db.CheckConstraint('ends_on >= starts_on', name='ck_subscription_period_dates'),
        db.CheckConstraint(
            "kind IN ('trial', 'paid', 'complimentary')", name='ck_subscription_period_kind'
        ),
        db.CheckConstraint(
            "renewal IN ('undecided', 'tacit', 'ending')", name='ck_subscription_period_renewal'
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    restaurant_id = db.Column(
        db.Integer, db.ForeignKey('restaurants.id', ondelete='CASCADE'), nullable=False, index=True
    )
    kind = db.Column(db.String(20), nullable=False)
    # Both days included.
    starts_on = db.Column(db.Date, nullable=False)
    ends_on = db.Column(db.Date, nullable=False)
    renewal = db.Column(
        db.String(20), nullable=False, default='undecided', server_default='undecided'
    )
    # The last day the contract's tacit renewals may reach.
    tacit_until = db.Column(db.Date, nullable=True)
    # The last day the buyer may decline the next renewal.
    notice_by = db.Column(db.Date, nullable=True)
    quote_ref = db.Column(db.String(60), nullable=True)
    # Purchase order, or a public buyer's legal commitment number.
    order_ref = db.Column(db.String(60), nullable=True)
    payer_name = db.Column(db.String(150), nullable=True)
    payer_siret = db.Column(db.String(14), nullable=True)
    # The payer's e-invoicing service or routing code.
    payer_service_code = db.Column(db.String(100), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
