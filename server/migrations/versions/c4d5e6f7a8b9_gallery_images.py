"""gallery images and per-category menu photos

Revision ID: c4d5e6f7a8b9
Revises: b3c4d5e6f7a8
Create Date: 2026-02-18 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c4d5e6f7a8b9'
down_revision = 'b3c4d5e6f7a8'
branch_labels = None
depends_on = None


def upgrade():
    # --- gallery_images ---
    op.create_table(
        'gallery_images',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('restaurant_id', sa.Integer(), sa.ForeignKey('restaurants.id'), nullable=False),
        sa.Column('storage_key', sa.String(500), nullable=False),
        sa.Column('url', sa.String(500), nullable=False),
        sa.Column('filename', sa.String(255), nullable=True),
        sa.Column('file_size', sa.Integer(), nullable=True),
        sa.Column('mime_type', sa.String(100), nullable=True),
        sa.Column('uploaded_by_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_gallery_images_restaurant', 'gallery_images', ['restaurant_id'])

    # --- gallery_image_tags ---
    op.create_table(
        'gallery_image_tags',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('gallery_image_id', sa.Integer(), sa.ForeignKey('gallery_images.id'), nullable=False),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('tag_type', sa.String(20), nullable=False),
        sa.Column('category_id', sa.String(50), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_gallery_image_tags_name', 'gallery_image_tags', ['name'])
    op.create_index('ix_gallery_image_tags_type', 'gallery_image_tags', ['tag_type'])

    # --- menu_item_images ---
    op.create_table(
        'menu_item_images',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('menu_id', sa.Integer(), sa.ForeignKey('menus.id'), nullable=False),
        sa.Column('gallery_image_id', sa.Integer(), sa.ForeignKey('gallery_images.id'), nullable=False),
        sa.Column('category', sa.String(50), nullable=False),
        sa.Column('item_index', sa.Integer(), default=0),
        sa.Column('display_order', sa.Integer(), default=0),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_menu_item_images_menu', 'menu_item_images', ['menu_id'])
    op.create_index('ix_menu_item_images_gallery', 'menu_item_images', ['gallery_image_id'])


def downgrade():
    op.drop_index('ix_menu_item_images_gallery', table_name='menu_item_images')
    op.drop_index('ix_menu_item_images_menu', table_name='menu_item_images')
    op.drop_table('menu_item_images')

    op.drop_index('ix_gallery_image_tags_type', table_name='gallery_image_tags')
    op.drop_index('ix_gallery_image_tags_name', table_name='gallery_image_tags')
    op.drop_table('gallery_image_tags')

    op.drop_index('ix_gallery_images_restaurant', table_name='gallery_images')
    op.drop_table('gallery_images')
