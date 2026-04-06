"""add color_key to menu_categories

Revision ID: f5a6b7c8d9e0
Revises: e3f4a5b6c7d8
Create Date: 2026-04-05 00:00:00.000000

Adds a color_key column to menu_categories so admins can assign a named
color (green, blue, purple, yellow, teal, slate) to each non-highlighted
category. Existing top-level non-highlighted categories receive a default
color assigned in order, ensuring no duplicates for standard installs
(which have fewer than 6 such categories by default).
"""
from alembic import op
import sqlalchemy as sa

revision = 'f5a6b7c8d9e0'
down_revision = 'e3f4a5b6c7d8'
branch_labels = None
depends_on = None

PALETTE = ['green', 'blue', 'purple', 'yellow', 'teal', 'slate']


def upgrade():
    op.add_column(
        'menu_categories',
        sa.Column('color_key', sa.String(30), nullable=True)
    )

    # Affecter une couleur par défaut aux catégories top-level non-highlighted,
    # triées par leur champ `order` croissant.
    connection = op.get_bind()
    rows = connection.execute(
        sa.text(
            'SELECT id FROM menu_categories '
            'WHERE parent_id IS NULL AND is_highlighted = FALSE '
            'ORDER BY "order" ASC'
        )
    ).fetchall()

    for i, row in enumerate(rows):
        connection.execute(
            sa.text('UPDATE menu_categories SET color_key = :key WHERE id = :id'),
            {'key': PALETTE[i % len(PALETTE)], 'id': row[0]}
        )


def downgrade():
    op.drop_column('menu_categories', 'color_key')
