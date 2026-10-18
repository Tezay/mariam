"""import sessions belong to a site and a kind

Revision ID: d6f0b2e5a8c3
Revises: c5e9a1d4f7b2
Create Date: 2026-10-17 12:10:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd6f0b2e5a8c3'
down_revision = 'c5e9a1d4f7b2'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('import_session', schema=None) as batch_op:
        batch_op.add_column(sa.Column('restaurant_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('kind', sa.String(length=10), nullable=True))
        batch_op.create_foreign_key(
            'import_session_restaurant_id_fkey', 'restaurants',
            ['restaurant_id'], ['id'], ondelete='CASCADE',
        )


def downgrade():
    with op.batch_alter_table('import_session', schema=None) as batch_op:
        batch_op.drop_constraint('import_session_restaurant_id_fkey', type_='foreignkey')
        batch_op.drop_column('kind')
        batch_op.drop_column('restaurant_id')
