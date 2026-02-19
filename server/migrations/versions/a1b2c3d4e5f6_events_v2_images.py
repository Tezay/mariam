"""events v2 — subtitle, description text, color, status, images

Revision ID: a1b2c3d4e5f6
Revises: d8b132cab14e
Create Date: 2026-02-04 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = 'd8b132cab14e'
branch_labels = None
depends_on = None


def upgrade():
    # ── Nouvelles colonnes sur events ──────────────────────────────
    with op.batch_alter_table('events', schema=None) as batch_op:
        # subtitle : court texte sous le titre
        batch_op.add_column(sa.Column('subtitle', sa.String(length=200), nullable=True))
        # color : couleur symbolique (#RRGGBB)
        batch_op.add_column(sa.Column('color', sa.String(length=7), nullable=True))
        # status : draft / published (remplace is_active pour le workflow)
        batch_op.add_column(sa.Column('status', sa.String(length=20), server_default='draft'))
        # updated_at : date de dernière modification
        batch_op.add_column(sa.Column('updated_at', sa.DateTime(), nullable=True))

    # Transformer description de String(300) en Text
    # PostgreSQL supporte ALTER TYPE directement
    op.execute("ALTER TABLE events ALTER COLUMN description TYPE TEXT USING description::TEXT")

    # Migrer les données : les événements actifs deviennent « published »
    op.execute("UPDATE events SET status = 'published' WHERE is_active = true")
    op.execute("UPDATE events SET status = 'draft' WHERE is_active = false OR is_active IS NULL")
    op.execute("UPDATE events SET color = '#3498DB' WHERE color IS NULL")

    # ── Table event_images ─────────────────────────────────────────
    op.create_table('event_images',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('event_id', sa.Integer(), nullable=False),
        sa.Column('storage_key', sa.String(length=500), nullable=False),
        sa.Column('url', sa.String(length=500), nullable=False),
        sa.Column('filename', sa.String(length=255), nullable=True),
        sa.Column('order', sa.Integer(), default=0),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['event_id'], ['events.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('event_images', schema=None) as batch_op:
        batch_op.create_index('ix_event_images_event_id', ['event_id'], unique=False)


def downgrade():
    # ── Supprimer event_images ─────────────────────────────────────
    with op.batch_alter_table('event_images', schema=None) as batch_op:
        batch_op.drop_index('ix_event_images_event_id')
    op.drop_table('event_images')

    # ── Restaurer is_active depuis status ──────────────────────────
    op.execute("UPDATE events SET is_active = (status = 'published')")

    # ── Remettre description en String(300) ────────────────────────
    op.execute("ALTER TABLE events ALTER COLUMN description TYPE VARCHAR(300) USING LEFT(description, 300)")

    # ── Supprimer les colonnes ajoutées ────────────────────────────
    with op.batch_alter_table('events', schema=None) as batch_op:
        batch_op.drop_column('updated_at')
        batch_op.drop_column('status')
        batch_op.drop_column('color')
        batch_op.drop_column('subtitle')
