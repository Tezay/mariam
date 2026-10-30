"""passkeys name their provider and accounts carry a random webauthn handle

Revision ID: 51765ed55958
Revises: 48800cefc5e2
Create Date: 2026-10-30 05:09:40.790109

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '51765ed55958'
down_revision = '48800cefc5e2'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('passkeys', schema=None) as batch_op:
        batch_op.add_column(sa.Column('aaguid', sa.String(length=36), nullable=True))

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('webauthn_user_id', sa.LargeBinary(), nullable=True))
        batch_op.create_unique_constraint('users_webauthn_user_id_key', ['webauthn_user_id'])

    # The handle their passkeys were created with, so the browser keeps matching them.
    op.execute(
        "UPDATE users SET webauthn_user_id = convert_to(id::text, 'UTF8') "
        "WHERE id IN (SELECT user_id FROM passkeys)"
    )


def downgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_constraint('users_webauthn_user_id_key', type_='unique')
        batch_op.drop_column('webauthn_user_id')

    with op.batch_alter_table('passkeys', schema=None) as batch_op:
        batch_op.drop_column('aaguid')
