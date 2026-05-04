"""rename category color palette to new on-brand colors

Revision ID: h7c8d9e0f1g2
Revises: 892fe6ef799c
Create Date: 2026-05-04 00:00:00.000000

Migrates color_key values from the old Duolingo-inspired palette
(green/blue/purple/yellow/teal/slate) to the new Mariam brand palette
(indigo/sky/mint/saffron/clay/lilac), using positional equivalence.

Also auto-assigns a color to any category that previously had none
(i.e. highlighted categories that were excluded from the old picker).
"""
from alembic import op
import sqlalchemy as sa

revision = 'h7c8d9e0f1g2'
down_revision = '892fe6ef799c'
branch_labels = None
depends_on = None

# Positional mapping: old → new
OLD_TO_NEW = {
    'green':  'indigo',
    'blue':   'sky',
    'purple': 'mint',
    'yellow': 'saffron',
    'teal':   'clay',
    'slate':  'lilac',
}
NEW_PALETTE = ['indigo', 'sky', 'mint', 'saffron', 'clay', 'lilac']


def upgrade():
    conn = op.get_bind()

    # 1. Rename existing color keys positionally
    for old, new in OLD_TO_NEW.items():
        conn.execute(
            sa.text("UPDATE menu_categories SET color_key = :new WHERE color_key = :old"),
            {'old': old, 'new': new},
        )

    # 2. For each restaurant, auto-assign a color to categories that still have NULL
    restaurants = conn.execute(sa.text('SELECT id FROM restaurants')).fetchall()
    for (restaurant_id,) in restaurants:
        used = {
            row[0] for row in conn.execute(
                sa.text('SELECT color_key FROM menu_categories WHERE restaurant_id = :rid AND color_key IS NOT NULL'),
                {'rid': restaurant_id},
            ).fetchall()
        }
        # Categories without a color, ordered so parent comes before subcategories
        nulls = conn.execute(
            sa.text(
                'SELECT id FROM menu_categories '
                'WHERE restaurant_id = :rid AND color_key IS NULL '
                'ORDER BY COALESCE(parent_id, 0), "order"'
            ),
            {'rid': restaurant_id},
        ).fetchall()

        for (cat_id,) in nulls:
            color = next((c for c in NEW_PALETTE if c not in used), NEW_PALETTE[0])
            used.add(color)
            conn.execute(
                sa.text('UPDATE menu_categories SET color_key = :color WHERE id = :id'),
                {'color': color, 'id': cat_id},
            )


def downgrade():
    conn = op.get_bind()

    NEW_TO_OLD = {v: k for k, v in OLD_TO_NEW.items()}
    for new, old in NEW_TO_OLD.items():
        conn.execute(
            sa.text("UPDATE menu_categories SET color_key = :old WHERE color_key = :new"),
            {'old': old, 'new': new},
        )
