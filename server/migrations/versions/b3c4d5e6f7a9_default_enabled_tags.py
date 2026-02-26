"""add tags_customized flag to restaurants

Revision ID: b3c4d5e6f7a9
Revises: a2b3c4d5e6f7
Create Date: 2026-02-26 00:00:00.000000

Ajoute un booléen `tags_customized` à `restaurants` pour distinguer
« jamais configuré » (→ défauts) de « configuré par l'admin ».
"""
from alembic import op
import sqlalchemy as sa

revision = 'b3c4d5e6f7a9'
down_revision = 'a2b3c4d5e6f7'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('restaurants') as batch_op:
        batch_op.add_column(
            sa.Column('tags_customized', sa.Boolean,
                      server_default='false', nullable=False)
        )


def downgrade():
    with op.batch_alter_table('restaurants') as batch_op:
        batch_op.drop_column('tags_customized')
