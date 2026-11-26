"""subscription periods of a site

Revision ID: 3e78e13b977c
Revises: e5a9c3f17b20
Create Date: 2026-11-26 00:07:07.085201

"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = '3e78e13b977c'
down_revision = 'e5a9c3f17b20'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'subscription_periods',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column(
            'restaurant_id', sa.Integer(),
            sa.ForeignKey('restaurants.id', ondelete='CASCADE'), nullable=False,
        ),
        sa.Column('kind', sa.String(20), nullable=False),
        sa.Column('starts_on', sa.Date(), nullable=False),
        sa.Column('ends_on', sa.Date(), nullable=False),
        sa.Column('renewal', sa.String(20), server_default='undecided', nullable=False),
        sa.Column('tacit_until', sa.Date(), nullable=True),
        sa.Column('notice_by', sa.Date(), nullable=True),
        sa.Column('quote_ref', sa.String(60), nullable=True),
        sa.Column('order_ref', sa.String(60), nullable=True),
        sa.Column('payer_name', sa.String(150), nullable=True),
        sa.Column('payer_siret', sa.String(14), nullable=True),
        sa.Column('payer_service_code', sa.String(100), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint('ends_on >= starts_on', name='ck_subscription_period_dates'),
        sa.CheckConstraint(
            "kind IN ('trial', 'paid', 'complimentary')", name='ck_subscription_period_kind'
        ),
        sa.CheckConstraint(
            "renewal IN ('undecided', 'tacit', 'ending')", name='ck_subscription_period_renewal'
        ),
    )
    op.create_index(
        'ix_subscription_periods_restaurant_id', 'subscription_periods', ['restaurant_id']
    )


def downgrade():
    op.drop_index('ix_subscription_periods_restaurant_id', table_name='subscription_periods')
    op.drop_table('subscription_periods')
