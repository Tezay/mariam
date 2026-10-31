"""news items may go undated, be pinned, and tell when they were published

Revision ID: 7b3f9e2d41a6
Revises: ce200d683b48
Create Date: 2026-10-31 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '7b3f9e2d41a6'
down_revision = 'ce200d683b48'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('events', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('pinned', sa.Boolean(), server_default='false', nullable=False)
        )
        batch_op.add_column(sa.Column('published_at', sa.DateTime(timezone=True), nullable=True))
        batch_op.alter_column('event_date', existing_type=sa.Date(), nullable=True)

    op.execute(
        "UPDATE events SET published_at = created_at AT TIME ZONE 'UTC' "
        "WHERE status = 'published'"
    )


def downgrade():
    # The previous release requires a date: an undated item takes the day it was published.
    op.execute(
        'UPDATE events SET event_date = COALESCE(published_at::date, created_at::date) '
        'WHERE event_date IS NULL'
    )
    with op.batch_alter_table('events', schema=None) as batch_op:
        batch_op.alter_column('event_date', existing_type=sa.Date(), nullable=False)
        batch_op.drop_column('published_at')
        batch_op.drop_column('pinned')
