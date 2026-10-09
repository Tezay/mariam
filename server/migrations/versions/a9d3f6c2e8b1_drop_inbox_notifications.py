"""drop inbox notifications

Revision ID: a9d3f6c2e8b1
Revises: e4a7c1b9d2f6
Create Date: 2026-10-08 18:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a9d3f6c2e8b1'
down_revision = 'e4a7c1b9d2f6'
branch_labels = None
depends_on = None


def upgrade():
    op.drop_table('inbox_notifications')


def downgrade():
    op.create_table(
        'inbox_notifications',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('restaurant_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('type', sa.String(length=50), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('body', sa.Text(), nullable=True),
        sa.Column('is_read', sa.Boolean(), nullable=False),
        sa.Column('meta', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['restaurant_id'], ['restaurants.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('inbox_notifications', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_inbox_notifications_created_at'), ['created_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_inbox_notifications_restaurant_id'), ['restaurant_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_inbox_notifications_user_id'), ['user_id'], unique=False)
