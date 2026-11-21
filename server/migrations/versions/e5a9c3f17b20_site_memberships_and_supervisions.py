"""an account holds a role per site and supervises organizations; audit entries name their organization

Revision ID: e5a9c3f17b20
Revises: d41c7e9a2b05
Create Date: 2026-11-21 18:00:00.000000

"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = 'e5a9c3f17b20'
down_revision = 'd41c7e9a2b05'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'site_memberships',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column(
            'user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False
        ),
        sa.Column(
            'restaurant_id', sa.Integer(),
            sa.ForeignKey('restaurants.id', ondelete='CASCADE'), nullable=False,
        ),
        sa.Column('role', sa.String(20), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint('restaurant_id', 'user_id', name='uq_site_membership'),
        sa.CheckConstraint("role IN ('admin', 'editor')", name='ck_site_membership_role'),
    )
    op.create_index('ix_site_memberships_user_id', 'site_memberships', ['user_id'])
    op.create_table(
        'org_supervisions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column(
            'user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False
        ),
        sa.Column(
            'organization_id', sa.Integer(),
            sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False,
        ),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint('organization_id', 'user_id', name='uq_org_supervision'),
    )
    op.create_index('ix_org_supervisions_user_id', 'org_supervisions', ['user_id'])

    # users.created_at is naive UTC.
    op.execute(
        "INSERT INTO site_memberships (user_id, restaurant_id, role, created_at) "
        "SELECT id, restaurant_id, role, created_at AT TIME ZONE 'UTC' FROM users "
        "WHERE role IN ('admin', 'editor') AND restaurant_id IS NOT NULL"
    )
    op.execute(
        "INSERT INTO org_supervisions (user_id, organization_id, created_at) "
        "SELECT id, organization_id, created_at AT TIME ZONE 'UTC' FROM users "
        "WHERE role = 'org_admin' AND organization_id IS NOT NULL"
    )

    op.add_column('audit_logs', sa.Column('organization_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_audit_logs_organization_id', 'audit_logs', 'organizations',
        ['organization_id'], ['id'],
    )
    op.create_index('ix_audit_logs_organization_id', 'audit_logs', ['organization_id'])
    op.execute(
        'UPDATE audit_logs SET organization_id = r.organization_id '
        'FROM restaurants r WHERE r.id = audit_logs.restaurant_id'
    )
    # A supervisor's entries without a site were its one organization's, and must not
    # reach another it comes to supervise. A site member's are its own account's.
    op.execute(
        "UPDATE audit_logs SET organization_id = u.organization_id FROM users u "
        "WHERE u.id = audit_logs.user_id AND audit_logs.restaurant_id IS NULL "
        "AND u.role = 'org_admin'"
    )


def downgrade():
    op.drop_index('ix_audit_logs_organization_id', table_name='audit_logs')
    op.drop_constraint('fk_audit_logs_organization_id', 'audit_logs', type_='foreignkey')
    op.drop_column('audit_logs', 'organization_id')
    op.drop_index('ix_org_supervisions_user_id', table_name='org_supervisions')
    op.drop_table('org_supervisions')
    op.drop_index('ix_site_memberships_user_id', table_name='site_memberships')
    op.drop_table('site_memberships')
