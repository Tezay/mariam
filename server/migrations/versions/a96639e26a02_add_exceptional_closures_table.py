"""add exceptional_closures table

Revision ID: a96639e26a02
Revises: g6b7c8d9e0f1
Create Date: 2026-04-27 08:13:03.024097

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a96639e26a02'
down_revision = 'g6b7c8d9e0f1'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('exceptional_closures',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('restaurant_id', sa.Integer(), nullable=False),
    sa.Column('start_date', sa.Date(), nullable=False),
    sa.Column('end_date', sa.Date(), nullable=False),
    sa.Column('reason', sa.String(length=100), nullable=True),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('status', sa.String(length=20), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('notified_7d', sa.Boolean(), nullable=False),
    sa.Column('notified_1d', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_by_id', sa.Integer(), nullable=True),
    sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['restaurant_id'], ['restaurants.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('exceptional_closures', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_exceptional_closures_end_date'), ['end_date'], unique=False)
        batch_op.create_index(batch_op.f('ix_exceptional_closures_start_date'), ['start_date'], unique=False)


def downgrade():
    with op.batch_alter_table('exceptional_closures', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_exceptional_closures_start_date'))
        batch_op.drop_index(batch_op.f('ix_exceptional_closures_end_date'))

    op.drop_table('exceptional_closures')
