"""users email lowercase check

Revision ID: 5a1e8c3d9f20
Revises: bbc63f7ca634
Create Date: 2026-10-06 15:10:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '5a1e8c3d9f20'
down_revision = 'bbc63f7ca634'
branch_labels = None
depends_on = None


def upgrade():
    # Checked first so the failure names the rows; rewriting them here would
    # leave downgrade() unable to restore what it found.
    offenders = op.get_bind().execute(
        sa.text('SELECT id FROM users WHERE email <> lower(email) ORDER BY id')
    ).scalars().all()
    if offenders:
        raise RuntimeError(
            f'users.email must be lowercase before this migration. Offending ids: {offenders}. '
            'Run: UPDATE users SET email = lower(email) WHERE email <> lower(email);'
        )

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.create_check_constraint('ck_users_email_lowercase', 'email = lower(email)')


def downgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_constraint('ck_users_email_lowercase', type_='check')
