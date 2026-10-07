"""users email shape check

Revision ID: e4a7c1b9d2f6
Revises: 7c2b4e6a1d83
Create Date: 2026-10-07 16:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e4a7c1b9d2f6'
down_revision = '7c2b4e6a1d83'
branch_labels = None
depends_on = None

SHAPE = "'^[!-~]+@[!-~]+$'"


def upgrade():
    # Checked first so the failure names the rows: no rewrite can turn such an
    # address into one its owner would recognise.
    offenders = op.get_bind().execute(
        sa.text(f'SELECT id FROM users WHERE email !~ {SHAPE} ORDER BY id')
    ).scalars().all()
    if offenders:
        raise RuntimeError(
            'users.email must be printable ASCII without spaces before this migration. '
            f'Offending ids: {offenders}. Give each one an address that is, for example: '
            "UPDATE users SET email = 'new.address@example.org' WHERE id = <id>;"
        )

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.create_check_constraint('ck_users_email_shape', f'email ~ {SHAPE}')


def downgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_constraint('ck_users_email_shape', type_='check')
