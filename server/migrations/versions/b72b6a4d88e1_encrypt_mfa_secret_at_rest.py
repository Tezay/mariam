"""encrypt mfa_secret at rest

Revision ID: b72b6a4d88e1
Revises: f335d000f6e2
Create Date: 2026-07-20 14:17:38.389698

Widens `users.mfa_secret` to TEXT and encrypts existing plaintext TOTP secrets
with Fernet (see app/services/crypto.py). Requires MFA_ENCRYPTION_KEY in the
environment to actually encrypt; without a key the values are left in cleartext
(development). Downgrade decrypts back to plaintext and restores VARCHAR(32).
"""
from alembic import op
import sqlalchemy as sa

from app.services.crypto import decrypt_secret, encrypt_secret

# revision identifiers, used by Alembic.
revision = 'b72b6a4d88e1'
down_revision = 'f335d000f6e2'
branch_labels = None
depends_on = None


def _rewrite(transform):
    """Apply `transform` to every non-null users.mfa_secret value."""
    conn = op.get_bind()
    rows = conn.execute(sa.text(
        "SELECT id, mfa_secret FROM users WHERE mfa_secret IS NOT NULL"
    )).fetchall()
    for row_id, secret in rows:
        conn.execute(
            sa.text("UPDATE users SET mfa_secret = :s WHERE id = :id"),
            {'s': transform(secret), 'id': row_id},
        )


def upgrade():
    op.alter_column(
        'users', 'mfa_secret',
        existing_type=sa.String(length=32),
        type_=sa.Text(),
        existing_nullable=True,
    )
    _rewrite(encrypt_secret)


def downgrade():
    _rewrite(decrypt_secret)
    op.alter_column(
        'users', 'mfa_secret',
        existing_type=sa.Text(),
        type_=sa.String(length=32),
        existing_nullable=True,
    )
