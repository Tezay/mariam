"""add ui_preferences to users

Revision ID: bbc63f7ca634
Revises: 887ae2df2413
Create Date: 2026-09-15 01:27:50.757649

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'bbc63f7ca634'
down_revision = '887ae2df2413'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('ui_preferences', sa.JSON(), nullable=True))


def downgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('ui_preferences')
