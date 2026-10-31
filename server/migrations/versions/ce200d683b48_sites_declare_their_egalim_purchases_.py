"""sites declare their egalim purchases and quality commitments

Revision ID: ce200d683b48
Revises: 3a0824d8f23c
Create Date: 2026-10-31 01:31:06.453117

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'ce200d683b48'
down_revision = '3a0824d8f23c'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'egalim_declarations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('restaurant_id', sa.Integer(), nullable=False),
        sa.Column('year', sa.Integer(), nullable=False),
        sa.Column('sustainable_share', sa.Numeric(precision=4, scale=1), nullable=False),
        sa.Column('organic_share', sa.Numeric(precision=4, scale=1), nullable=False),
        sa.Column('territorial_share', sa.Numeric(precision=4, scale=1), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['restaurant_id'], ['restaurants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('restaurant_id', 'year', name='uq_egalim_declaration_year'),
    )

    with op.batch_alter_table('restaurants', schema=None) as batch_op:
        batch_op.add_column(sa.Column('quality_commitments', sa.String(length=600), nullable=True))


def downgrade():
    with op.batch_alter_table('restaurants', schema=None) as batch_op:
        batch_op.drop_column('quality_commitments')

    op.drop_table('egalim_declarations')
