"""activation links emailed

Revision ID: b3f8d2a6c9e1
Revises: a9d3f6c2e8b1
Create Date: 2026-10-12 21:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b3f8d2a6c9e1'
down_revision = 'a9d3f6c2e8b1'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('activation_links', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('emailed', sa.Boolean(), nullable=False, server_default=sa.text('false'))
        )


def downgrade():
    with op.batch_alter_table('activation_links', schema=None) as batch_op:
        batch_op.drop_column('emailed')
