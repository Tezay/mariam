"""users keep no TOTP secret that no code ever confirmed

Revision ID: 06df321ae0cd
Revises: e73659b57517
Create Date: 2026-10-25 10:00:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = '06df321ae0cd'
down_revision = 'e73659b57517'
branch_labels = None
depends_on = None


def upgrade():
    # Left by activations that never confirmed a code. Nothing reads one while
    # mfa_enabled is off, so neither direction has anything to restore.
    op.execute('UPDATE users SET mfa_secret = NULL WHERE NOT mfa_enabled AND mfa_secret IS NOT NULL')


def downgrade():
    pass
