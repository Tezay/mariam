"""push subscriptions carry the fingerprint of their endpoint

Revision ID: e73659b57517
Revises: d6f0b2e5a8c3
Create Date: 2026-10-23 22:44:55.442101

"""
import base64
import hashlib

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e73659b57517'
down_revision = 'd6f0b2e5a8c3'
branch_labels = None
depends_on = None


def _fingerprint(endpoint: str) -> str:
    digest = hashlib.sha256(endpoint.encode()).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b'=').decode()


def upgrade():
    with op.batch_alter_table('push_subscriptions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('endpoint_sha256', sa.String(length=43), nullable=True))
        batch_op.create_unique_constraint(
            'push_subscriptions_endpoint_sha256_key', ['endpoint_sha256']
        )

    subscriptions = sa.table(
        'push_subscriptions',
        sa.column('id', sa.Integer),
        sa.column('endpoint', sa.Text),
        sa.column('endpoint_sha256', sa.String),
    )
    bind = op.get_bind()
    for row in bind.execute(sa.select(subscriptions.c.id, subscriptions.c.endpoint)).all():
        bind.execute(
            subscriptions.update()
            .where(subscriptions.c.id == row.id)
            .values(endpoint_sha256=_fingerprint(row.endpoint))
        )


def downgrade():
    with op.batch_alter_table('push_subscriptions', schema=None) as batch_op:
        batch_op.drop_constraint('push_subscriptions_endpoint_sha256_key', type_='unique')
        batch_op.drop_column('endpoint_sha256')
