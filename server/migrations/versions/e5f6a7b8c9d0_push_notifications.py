"""push notifications

Revision ID: e5f6a7b8c9d0
Revises: c4d5e6f7a8b9
Create Date: 2026-02-20 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e5f6a7b8c9d0'
down_revision = 'c4d5e6f7a8b9'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'push_subscriptions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('restaurant_id', sa.Integer(), sa.ForeignKey('restaurants.id'), nullable=False),
        # Web Push VAPID data
        sa.Column('endpoint', sa.Text(), nullable=False),
        sa.Column('p256dh', sa.Text(), nullable=False),
        sa.Column('auth', sa.Text(), nullable=False),
        # Notification preferences
        sa.Column('notify_today_menu', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('notify_today_menu_time', sa.Time(), nullable=False, server_default=sa.text("'11:00:00'")),
        sa.Column('notify_tomorrow_menu', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('notify_tomorrow_menu_time', sa.Time(), nullable=False, server_default=sa.text("'19:00:00'")),
        sa.Column('notify_events', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        # Metadata
        sa.Column('platform', sa.String(20), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('last_notified_at', sa.DateTime(), nullable=True),
    )

    # Index unique sur endpoint (identifiant de la souscription)
    op.create_index('ix_push_subscriptions_endpoint', 'push_subscriptions', ['endpoint'], unique=True)

    # Index pour les requêtes du scheduler (restaurant + horaires)
    op.create_index(
        'ix_push_subscriptions_restaurant_today',
        'push_subscriptions',
        ['restaurant_id', 'notify_today_menu', 'notify_today_menu_time'],
    )
    op.create_index(
        'ix_push_subscriptions_restaurant_tomorrow',
        'push_subscriptions',
        ['restaurant_id', 'notify_tomorrow_menu', 'notify_tomorrow_menu_time'],
    )


def downgrade():
    op.drop_index('ix_push_subscriptions_restaurant_tomorrow', table_name='push_subscriptions')
    op.drop_index('ix_push_subscriptions_restaurant_today', table_name='push_subscriptions')
    op.drop_index('ix_push_subscriptions_endpoint', table_name='push_subscriptions')
    op.drop_table('push_subscriptions')
