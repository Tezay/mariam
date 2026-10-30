"""accounts and invitations of the reader role become editors

Revision ID: fda029457ee9
Revises: 51765ed55958
Create Date: 2026-10-30 05:49:14.025689

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'fda029457ee9'
down_revision = '51765ed55958'
branch_labels = None
depends_on = None


def upgrade():
    # Nothing records who was a reader, so downgrade has nothing to give back.
    op.execute("UPDATE users SET role = 'editor' WHERE role = 'reader'")
    op.execute("UPDATE activation_links SET role = 'editor' WHERE role = 'reader'")


def downgrade():
    pass
