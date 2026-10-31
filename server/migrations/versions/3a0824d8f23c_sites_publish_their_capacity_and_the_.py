"""sites publish their capacity and the state of their service

Revision ID: 3a0824d8f23c
Revises: fda029457ee9
Create Date: 2026-10-30 06:46:37.153128

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '3a0824d8f23c'
down_revision = 'fda029457ee9'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'service_live_status',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('restaurant_id', sa.Integer(), nullable=False),
        sa.Column('day', sa.Date(), nullable=False),
        sa.Column('capacity_reached_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['restaurant_id'], ['restaurants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('restaurant_id', 'day', name='uq_service_live_status_day'),
    )

    with op.batch_alter_table('restaurants', schema=None) as batch_op:
        batch_op.add_column(sa.Column('service_capacity', sa.Integer(), nullable=True))


def downgrade():
    with op.batch_alter_table('restaurants', schema=None) as batch_op:
        batch_op.drop_column('service_capacity')

    op.drop_table('service_live_status')
