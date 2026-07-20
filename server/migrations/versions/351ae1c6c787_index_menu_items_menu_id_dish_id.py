"""index menu_items menu_id dish_id

Revision ID: 351ae1c6c787
Revises: b72b6a4d88e1
Create Date: 2026-07-20 14:58:37.278631

Composite index on menu_items(menu_id, dish_id): speeds the per-menu item
lookups and the dish usage-count aggregation in the catalog.
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = '351ae1c6c787'
down_revision = 'b72b6a4d88e1'
branch_labels = None
depends_on = None


def upgrade():
    op.create_index(
        'ix_menu_items_menu_id_dish_id', 'menu_items', ['menu_id', 'dish_id']
    )


def downgrade():
    op.drop_index('ix_menu_items_menu_id_dish_id', table_name='menu_items')
