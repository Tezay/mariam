"""restaurant extended info fields

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
Create Date: 2026-04-02 00:00:00.000000

Adds contact info, capacity, BAN address, payment methods and PMR
accessibility as scalar columns on restaurants. Replaces the legacy
`address` VARCHAR with address_label/lat/lon. Adds a normalized
restaurant_service_hours table (one row per day).
"""
from alembic import op
import sqlalchemy as sa

revision = 'e3f4a5b6c7d8'
down_revision = 'd2e3f4a5b6c7'
branch_labels = None
depends_on = None


def upgrade():
    # Replace legacy address column with BAN-structured fields
    op.drop_column('restaurants', 'address')
    op.add_column('restaurants', sa.Column('address_label', sa.String(300), nullable=True))
    op.add_column('restaurants', sa.Column('address_lat', sa.Float, nullable=True))
    op.add_column('restaurants', sa.Column('address_lon', sa.Float, nullable=True))

    # Contact & capacity
    op.add_column('restaurants', sa.Column('email', sa.String(150), nullable=True))
    op.add_column('restaurants', sa.Column('phone', sa.String(30), nullable=True))
    op.add_column('restaurants', sa.Column('capacity', sa.Integer, nullable=True))

    # Payment methods (fixed enum, stored as JSON list)
    op.add_column('restaurants', sa.Column('payment_methods', sa.JSON, nullable=True))

    # PMR accessibility: NULL = not set, True = accessible, False = not accessible
    op.add_column('restaurants', sa.Column('pmr_access', sa.Boolean, nullable=True))

    # Normalized service hours (one row per day per restaurant)
    op.create_table(
        'restaurant_service_hours',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('restaurant_id', sa.Integer,
                  sa.ForeignKey('restaurants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('day_of_week', sa.Integer, nullable=False),   # 0=Monday … 6=Sunday
        sa.Column('open_time', sa.String(5), nullable=False),   # "HH:MM"
        sa.Column('close_time', sa.String(5), nullable=False),  # "HH:MM"
        sa.UniqueConstraint('restaurant_id', 'day_of_week', name='uq_restaurant_service_hour_day'),
    )


def downgrade():
    op.drop_table('restaurant_service_hours')

    op.drop_column('restaurants', 'pmr_access')
    op.drop_column('restaurants', 'payment_methods')
    op.drop_column('restaurants', 'capacity')
    op.drop_column('restaurants', 'phone')
    op.drop_column('restaurants', 'email')
    op.drop_column('restaurants', 'address_lon')
    op.drop_column('restaurants', 'address_lat')
    op.drop_column('restaurants', 'address_label')

    op.add_column('restaurants', sa.Column('address', sa.String(200), nullable=True))
