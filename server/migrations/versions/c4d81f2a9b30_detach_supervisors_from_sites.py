"""detach supervisors from sites

Revision ID: c4d81f2a9b30
Revises: 351ae1c6c787
Create Date: 2026-08-28

A supervisor (org_admin) oversees every site of its organization and belongs to
none of them. Earlier invitations bound it to the site it was invited from,
which made it show up in that site's user list.
"""
from alembic import op

revision = 'c4d81f2a9b30'
down_revision = '351ae1c6c787'
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        """
        UPDATE users
        SET organization_id = COALESCE(
                organization_id,
                (SELECT r.organization_id FROM restaurants r WHERE r.id = users.restaurant_id)
            ),
            restaurant_id = NULL
        WHERE role = 'org_admin' AND restaurant_id IS NOT NULL
        """
    )
    op.execute(
        """
        UPDATE activation_links
        SET organization_id = COALESCE(
                organization_id,
                (SELECT r.organization_id
                 FROM restaurants r
                 WHERE r.id = activation_links.restaurant_id)
            ),
            restaurant_id = NULL
        WHERE role = 'org_admin' AND restaurant_id IS NOT NULL
        """
    )


def downgrade():
    # The original site of a supervisor is not recoverable; attaching it to an
    # arbitrary site of its organization would invent data, so this is a no-op.
    pass
