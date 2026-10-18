"""sites require an organization and a slug

Revision ID: c5e9a1d4f7b2
Revises: b3f8d2a6c9e1
Create Date: 2026-10-17 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c5e9a1d4f7b2'
down_revision = 'b3f8d2a6c9e1'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('restaurants', schema=None) as batch_op:
        batch_op.alter_column('organization_id', existing_type=sa.Integer(), nullable=False)
        batch_op.alter_column('slug', existing_type=sa.String(length=63), nullable=False)


def downgrade():
    with op.batch_alter_table('restaurants', schema=None) as batch_op:
        batch_op.alter_column('slug', existing_type=sa.String(length=63), nullable=True)
        batch_op.alter_column('organization_id', existing_type=sa.Integer(), nullable=True)
