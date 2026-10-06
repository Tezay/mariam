"""activation links revoked_at

Revision ID: 7c2b4e6a1d83
Revises: 5a1e8c3d9f20
Create Date: 2026-10-06 15:20:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '7c2b4e6a1d83'
down_revision = '5a1e8c3d9f20'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('activation_links', schema=None) as batch_op:
        batch_op.add_column(sa.Column('revoked_at', sa.DateTime(), nullable=True))

    # A pending invitation naming an existing account would give its holder a
    # second one: activation takes the address from the form, not the link.
    op.execute(
        """
        UPDATE activation_links
        SET revoked_at = (now() AT TIME ZONE 'utc')
        WHERE link_type = 'invite'
          AND used_at IS NULL
          AND email IN (SELECT email FROM users)
        """
    )


def downgrade():
    with op.batch_alter_table('activation_links', schema=None) as batch_op:
        batch_op.drop_column('revoked_at')
