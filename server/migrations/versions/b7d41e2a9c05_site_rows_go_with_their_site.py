"""site rows go with their site

Revision ID: b7d41e2a9c05
Revises: 11900bfc8691
Create Date: 2026-11-26 10:00:00.000000

"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = 'b7d41e2a9c05'
down_revision = '11900bfc8691'
branch_labels = None
depends_on = None

# (table, column, referred table, delete rule)
KEYS = [
    ('menus', 'restaurant_id', 'restaurants', 'CASCADE'),
    ('menu_items', 'menu_id', 'menus', 'CASCADE'),
    ('events', 'restaurant_id', 'restaurants', 'CASCADE'),
    ('event_images', 'event_id', 'events', 'CASCADE'),
    ('exceptional_closures', 'restaurant_id', 'restaurants', 'CASCADE'),
    ('activation_links', 'restaurant_id', 'restaurants', 'CASCADE'),
    ('push_subscriptions', 'restaurant_id', 'restaurants', 'CASCADE'),
    ('audit_logs', 'restaurant_id', 'restaurants', 'CASCADE'),
    ('users', 'restaurant_id', 'restaurants', 'SET NULL'),
]


def _replace(table: str, column: str, referred: str, ondelete: str | None) -> None:
    # Looked up rather than named: some keys were named by a migration, others by Postgres.
    (name,) = [
        key['name'] for key in sa.inspect(op.get_bind()).get_foreign_keys(table)
        if key['constrained_columns'] == [column]
    ]
    op.drop_constraint(name, table, type_='foreignkey')
    op.create_foreign_key(name, table, referred, [column], ['id'], ondelete=ondelete)


def upgrade():
    for table, column, referred, ondelete in KEYS:
        _replace(table, column, referred, ondelete)


def downgrade():
    for table, column, referred, _ in KEYS:
        _replace(table, column, referred, None)
