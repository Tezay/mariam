"""add hot_appetizer dietary tag

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-04-02 00:00:00.000000

"""
from alembic import op
from sqlalchemy.sql import text

# revision identifiers
revision = 'd2e3f4a5b6c7'
down_revision = 'c1d2e3f4a5b6'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    conn.execute(text("""
        INSERT INTO dietary_tags (id, label, icon, color, category_id, sort_order)
        VALUES ('hot_appetizer', 'Entrée chaude', 'soup', 'orange', 'preparation', 15)
        ON CONFLICT (id) DO NOTHING
    """))


def downgrade():
    conn = op.get_bind()
    conn.execute(text("DELETE FROM dietary_tags WHERE id = 'hot_appetizer'"))
