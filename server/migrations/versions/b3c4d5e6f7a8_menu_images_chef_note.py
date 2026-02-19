"""menu images and chef note

Revision ID: b3c4d5e6f7a8
Revises: a1b2c3d4e5f6
Create Date: 2026-02-15 22:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b3c4d5e6f7a8'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    # ── Note du chef sur menus ─────────────────────────────────────
    with op.batch_alter_table('menus', schema=None) as batch_op:
        batch_op.add_column(sa.Column('chef_note', sa.String(length=300), nullable=True))

    # ── Table menu_images (photos du jour) ─────────────────────────
    op.create_table('menu_images',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('menu_id', sa.Integer(), nullable=False),
        sa.Column('storage_key', sa.String(length=500), nullable=False),
        sa.Column('url', sa.String(length=500), nullable=False),
        sa.Column('filename', sa.String(length=255), nullable=True),
        sa.Column('order', sa.Integer(), default=0),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['menu_id'], ['menus.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('menu_images', schema=None) as batch_op:
        batch_op.create_index('ix_menu_images_menu_id', ['menu_id'], unique=False)


def downgrade():
    with op.batch_alter_table('menu_images', schema=None) as batch_op:
        batch_op.drop_index('ix_menu_images_menu_id')
    op.drop_table('menu_images')

    with op.batch_alter_table('menus', schema=None) as batch_op:
        batch_op.drop_column('chef_note')
