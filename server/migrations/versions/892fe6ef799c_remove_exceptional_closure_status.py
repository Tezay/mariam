"""remove_exceptional_closure_status

Revision ID: 892fe6ef799c
Revises: a96639e26a02
Create Date: 2026-04-29 14:08:20.725163

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '892fe6ef799c'
down_revision = 'a96639e26a02'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('exceptional_closures', schema=None) as batch_op:
        batch_op.drop_column('status')


def downgrade():
    with op.batch_alter_table('exceptional_closures', schema=None) as batch_op:
        batch_op.add_column(sa.Column('status', sa.VARCHAR(length=20), autoincrement=False, nullable=True))
