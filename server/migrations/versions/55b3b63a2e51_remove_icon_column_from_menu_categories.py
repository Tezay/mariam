"""remove icon column from menu_categories

Revision ID: 55b3b63a2e51
Revises: h7c8d9e0f1g2
Create Date: 2026-05-06 18:07:15.363134

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '55b3b63a2e51'
down_revision = 'h7c8d9e0f1g2'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('menu_categories', schema=None) as batch_op:
        batch_op.drop_column('icon')


def downgrade():
    with op.batch_alter_table('menu_categories', schema=None) as batch_op:
        batch_op.add_column(sa.Column('icon', sa.VARCHAR(length=50), server_default=sa.text("'utensils'::character varying"), autoincrement=False, nullable=False))
