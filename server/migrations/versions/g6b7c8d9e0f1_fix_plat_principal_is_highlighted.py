"""fix is_highlighted for Plat principal category

Revision ID: g6b7c8d9e0f1
Revises: f5a6b7c8d9e0
Create Date: 2026-04-07 00:00:00.000000

La migration c1d2e3f4a5b6 créait toutes les catégories top-level avec
is_highlighted = false (valeur hardcodée), y compris "Plat principal" qui
doit être true pour que l'affichage mobile route vers MobileHighlightedCategory
(seul composant capable de rendre les sous-catégories).

Critère de sélection : catégories top-level protégées (is_protected = true,
parent_id IS NULL) — seul "Plat principal" correspond dans une installation
standard.
"""
from alembic import op
import sqlalchemy as sa

revision = 'g6b7c8d9e0f1'
down_revision = 'f5a6b7c8d9e0'
branch_labels = None
depends_on = None


def upgrade():
    connection = op.get_bind()
    connection.execute(
        sa.text(
            'UPDATE menu_categories '
            'SET is_highlighted = true '
            'WHERE parent_id IS NULL AND is_protected = true'
        )
    )


def downgrade():
    connection = op.get_bind()
    connection.execute(
        sa.text(
            'UPDATE menu_categories '
            'SET is_highlighted = false '
            'WHERE parent_id IS NULL AND is_protected = true'
        )
    )
