"""subscription reminders sent

Revision ID: 11900bfc8691
Revises: 3e78e13b977c
Create Date: 2026-11-26 03:50:29.521748

"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = '11900bfc8691'
down_revision = '3e78e13b977c'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'subscription_reminders',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column(
            'restaurant_id', sa.Integer(),
            sa.ForeignKey('restaurants.id', ondelete='CASCADE'), nullable=False,
        ),
        sa.Column('ends_on', sa.Date(), nullable=False),
        sa.Column('days', sa.Integer(), nullable=False),
        sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint('restaurant_id', 'ends_on', 'days', name='uq_subscription_reminder'),
    )
    op.create_index(
        'ix_subscription_reminders_restaurant_id', 'subscription_reminders', ['restaurant_id']
    )


def downgrade():
    op.drop_index('ix_subscription_reminders_restaurant_id', table_name='subscription_reminders')
    op.drop_table('subscription_reminders')
