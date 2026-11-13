"""news, closures, sites and menus drop the columns and table 0.20.0 stopped reading

Revision ID: d41c7e9a2b05
Revises: 7b3f9e2d41a6
Create Date: 2026-11-12 10:00:00.000000

"""
import logging

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd41c7e9a2b05'
down_revision = '7b3f9e2d41a6'
branch_labels = None
depends_on = None

log = logging.getLogger('alembic.runtime.migration')

HIDDEN_NEWS = 'SELECT id FROM events WHERE is_active IS NOT TRUE'


def upgrade():
    # A migration makes no storage call: the files it leaves behind are named for the
    # operator to delete.
    keys = [
        key
        for (key,) in op.get_bind().execute(sa.text(
            f'SELECT storage_key FROM event_images WHERE event_id IN ({HIDDEN_NEWS}) '
            'UNION ALL SELECT storage_key FROM menu_images'
        ))
    ]
    if keys:
        log.warning('%d stored files are no longer referenced: %s', len(keys), ', '.join(keys))

    # Every reader hid these rows already; without the flag they would show.
    op.execute(f'DELETE FROM event_images WHERE event_id IN ({HIDDEN_NEWS})')
    op.execute('DELETE FROM events WHERE is_active IS NOT TRUE')
    op.execute('DELETE FROM exceptional_closures WHERE NOT is_active')

    with op.batch_alter_table('events', schema=None) as batch_op:
        batch_op.drop_column('is_active')
    with op.batch_alter_table('exceptional_closures', schema=None) as batch_op:
        batch_op.drop_column('is_active')
    with op.batch_alter_table('restaurants', schema=None) as batch_op:
        batch_op.drop_column('capacity')
    op.drop_table('menu_images')


def downgrade():
    # The schema comes back, not what the upgrade deleted: no menu photo, no seat count,
    # no hidden news item or closure.
    op.create_table(
        'menu_images',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('menu_id', sa.Integer(), nullable=False),
        sa.Column('storage_key', sa.String(length=500), nullable=False),
        sa.Column('url', sa.String(length=500), nullable=False),
        sa.Column('filename', sa.String(length=255), nullable=True),
        sa.Column('order', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['menu_id'], ['menus.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('restaurants', schema=None) as batch_op:
        batch_op.add_column(sa.Column('capacity', sa.Integer(), nullable=True))

    # Every remaining row is active; the default only fills them.
    with op.batch_alter_table('exceptional_closures', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False)
        )
    with op.batch_alter_table('exceptional_closures', schema=None) as batch_op:
        batch_op.alter_column('is_active', existing_type=sa.Boolean(), server_default=None)
    with op.batch_alter_table('events', schema=None) as batch_op:
        batch_op.add_column(sa.Column('is_active', sa.Boolean(), server_default='true', nullable=True))
    with op.batch_alter_table('events', schema=None) as batch_op:
        batch_op.alter_column('is_active', existing_type=sa.Boolean(), server_default=None)
