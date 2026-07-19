"""add organizations, tenant scoping columns, token revocation

Revision ID: f335d000f6e2
Revises: 4c83d7dc335a
Create Date: 2026-07-18 22:24:06.401200

Introduces the multi-tenant Organization -> Restaurants hierarchy:
- `organizations` table
- `restaurants.organization_id` + `restaurants.slug` (unique per organization)
- `users.organization_id` + `users.tokens_valid_after` (token revocation)
- `activation_links.restaurant_id` / `organization_id` (tenant propagation)
- `audit_logs.restaurant_id` (log isolation)

Backfill is limited to automatically derivable links (slug from `code`, orphan
accounts/logs). Creating an organization and attaching restaurants is left to
the operator:

    INSERT INTO organizations (name, slug, is_active) VALUES ('<nom>', '<slug>', true);
    UPDATE restaurants SET organization_id = (SELECT id FROM organizations WHERE slug='<slug>');
    UPDATE users        SET organization_id = (SELECT id FROM organizations WHERE slug='<slug>');
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f335d000f6e2'
down_revision = '4c83d7dc335a'
branch_labels = None
depends_on = None


def upgrade():
    # --- Schéma ---------------------------------------------------------------
    op.create_table(
        'organizations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=150), nullable=False),
        sa.Column('slug', sa.String(length=63), nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('organizations', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_organizations_slug'), ['slug'], unique=True)

    with op.batch_alter_table('activation_links', schema=None) as batch_op:
        batch_op.add_column(sa.Column('restaurant_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('organization_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            'fk_activation_links_restaurant_id', 'restaurants', ['restaurant_id'], ['id'])
        batch_op.create_foreign_key(
            'fk_activation_links_organization_id', 'organizations', ['organization_id'], ['id'])

    with op.batch_alter_table('audit_logs', schema=None) as batch_op:
        batch_op.add_column(sa.Column('restaurant_id', sa.Integer(), nullable=True))
        batch_op.create_index(
            batch_op.f('ix_audit_logs_restaurant_id'), ['restaurant_id'], unique=False)
        batch_op.create_foreign_key(
            'fk_audit_logs_restaurant_id', 'restaurants', ['restaurant_id'], ['id'])

    with op.batch_alter_table('restaurants', schema=None) as batch_op:
        batch_op.add_column(sa.Column('organization_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('slug', sa.String(length=63), nullable=True))
        batch_op.create_index(
            batch_op.f('ix_restaurants_organization_id'), ['organization_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_restaurants_slug'), ['slug'], unique=False)
        batch_op.create_unique_constraint('uq_restaurant_org_slug', ['organization_id', 'slug'])
        batch_op.create_foreign_key(
            'fk_restaurants_organization_id', 'organizations', ['organization_id'], ['id'])

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('organization_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('tokens_valid_after', sa.DateTime(), nullable=True))
        batch_op.create_index(
            batch_op.f('ix_users_organization_id'), ['organization_id'], unique=False)
        batch_op.create_foreign_key(
            'fk_users_organization_id', 'organizations', ['organization_id'], ['id'])

    # --- Integrity backfill ---------------------------------------------------
    bind = op.get_bind()

    # Restaurant slug derived from the code (URL-safe), when missing.
    bind.execute(sa.text(
        "UPDATE restaurants "
        "SET slug = lower(regexp_replace(code, '[^a-zA-Z0-9]+', '-', 'g')) "
        "WHERE slug IS NULL"
    ))

    # If exactly one restaurant exists, attach orphan accounts to it (integrity:
    # avoids locking users out after removing the "first active restaurant"
    # fallback). Ambiguous with several restaurants -> left to the operator.
    restaurant_ids = [
        row[0] for row in bind.execute(sa.text("SELECT id FROM restaurants")).fetchall()
    ]
    if len(restaurant_ids) == 1:
        bind.execute(
            sa.text("UPDATE users SET restaurant_id = :rid WHERE restaurant_id IS NULL"),
            {"rid": restaurant_ids[0]},
        )

    # Audit logs: attached to the restaurant of their author.
    bind.execute(sa.text(
        "UPDATE audit_logs a SET restaurant_id = u.restaurant_id "
        "FROM users u WHERE a.user_id = u.id AND a.restaurant_id IS NULL"
    ))


def downgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_constraint('fk_users_organization_id', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_users_organization_id'))
        batch_op.drop_column('tokens_valid_after')
        batch_op.drop_column('organization_id')

    with op.batch_alter_table('restaurants', schema=None) as batch_op:
        batch_op.drop_constraint('fk_restaurants_organization_id', type_='foreignkey')
        batch_op.drop_constraint('uq_restaurant_org_slug', type_='unique')
        batch_op.drop_index(batch_op.f('ix_restaurants_slug'))
        batch_op.drop_index(batch_op.f('ix_restaurants_organization_id'))
        batch_op.drop_column('slug')
        batch_op.drop_column('organization_id')

    with op.batch_alter_table('audit_logs', schema=None) as batch_op:
        batch_op.drop_constraint('fk_audit_logs_restaurant_id', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_audit_logs_restaurant_id'))
        batch_op.drop_column('restaurant_id')

    with op.batch_alter_table('activation_links', schema=None) as batch_op:
        batch_op.drop_constraint('fk_activation_links_organization_id', type_='foreignkey')
        batch_op.drop_constraint('fk_activation_links_restaurant_id', type_='foreignkey')
        batch_op.drop_column('organization_id')
        batch_op.drop_column('restaurant_id')

    with op.batch_alter_table('organizations', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_organizations_slug'))
    op.drop_table('organizations')
