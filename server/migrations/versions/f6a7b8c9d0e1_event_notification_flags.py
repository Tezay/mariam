"""event notification flags (notified_7d, notified_1d)

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-02-21 01:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f6a7b8c9d0e1'
down_revision = 'e5f6a7b8c9d0'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('events', sa.Column(
        'notified_7d', sa.Boolean(), nullable=False, server_default=sa.text('false'),
    ))
    op.add_column('events', sa.Column(
        'notified_1d', sa.Boolean(), nullable=False, server_default=sa.text('false'),
    ))


def downgrade():
    op.drop_column('events', 'notified_1d')
    op.drop_column('events', 'notified_7d')
