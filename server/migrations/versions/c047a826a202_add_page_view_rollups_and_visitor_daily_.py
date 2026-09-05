"""add page view rollups and visitor daily uniques

Revision ID: c047a826a202
Revises: c4d81f2a9b30
Create Date: 2026-08-29 11:09:45.694736

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c047a826a202'
down_revision = 'c4d81f2a9b30'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('page_view_rollups',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('restaurant_id', sa.Integer(), nullable=True),
    sa.Column('organization_id', sa.Integer(), nullable=True),
    sa.Column('date', sa.Date(), nullable=False),
    sa.Column('hour', sa.SmallInteger(), nullable=False),
    sa.Column('page_kind', sa.String(length=20), nullable=False),
    sa.Column('views', sa.Integer(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.CheckConstraint('(restaurant_id IS NULL) <> (organization_id IS NULL)', name='ck_pv_rollup_single_owner'),
    sa.CheckConstraint('hour >= 0 AND hour <= 23', name='ck_pv_rollup_hour'),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['restaurant_id'], ['restaurants.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('restaurant_id', 'organization_id', 'date', 'hour', 'page_kind', name='uq_pv_rollup_owner_date_hour_kind', postgresql_nulls_not_distinct=True)
    )
    with op.batch_alter_table('page_view_rollups', schema=None) as batch_op:
        batch_op.create_index('ix_pv_rollups_date', ['date'], unique=False)

    op.create_table('visitor_daily_uniques',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('restaurant_id', sa.Integer(), nullable=False),
    sa.Column('date', sa.Date(), nullable=False),
    sa.Column('unique_visitors', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['restaurant_id'], ['restaurants.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('restaurant_id', 'date', name='uq_uv_site_date')
    )
    with op.batch_alter_table('visitor_daily_uniques', schema=None) as batch_op:
        batch_op.create_index('ix_visitor_daily_uniques_date', ['date'], unique=False)

def downgrade():
    with op.batch_alter_table('visitor_daily_uniques', schema=None) as batch_op:
        batch_op.drop_index('ix_visitor_daily_uniques_date')

    op.drop_table('visitor_daily_uniques')
    with op.batch_alter_table('page_view_rollups', schema=None) as batch_op:
        batch_op.drop_index('ix_pv_rollups_date')

    op.drop_table('page_view_rollups')
