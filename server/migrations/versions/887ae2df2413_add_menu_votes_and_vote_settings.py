"""add menu votes and vote settings

Revision ID: 887ae2df2413
Revises: c047a826a202
Create Date: 2026-09-07 08:18:21.720912

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '887ae2df2413'
down_revision = 'c047a826a202'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('menu_votes',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('organization_id', sa.Integer(), nullable=False),
    sa.Column('restaurant_id', sa.Integer(), nullable=False),
    sa.Column('menu_id', sa.Integer(), nullable=False),
    sa.Column('date', sa.Date(), nullable=False),
    sa.Column('device_id', sa.String(length=64), nullable=True),
    sa.Column('rating', sa.SmallInteger(), nullable=False),
    sa.Column('source', sa.String(length=20), nullable=False),
    sa.Column('icon_preset', sa.String(length=20), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.CheckConstraint('rating >= 1 AND rating <= 3', name='ck_menu_vote_rating'),
    sa.ForeignKeyConstraint(['menu_id'], ['menus.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['restaurant_id'], ['restaurants.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('organization_id', 'date', 'device_id', name='uq_vote_org_date_device')
    )
    with op.batch_alter_table('menu_votes', schema=None) as batch_op:
        batch_op.create_index('ix_menu_votes_site_date', ['restaurant_id', 'date'], unique=False)

    op.create_table('menu_vote_dishes',
    sa.Column('vote_id', sa.Integer(), nullable=False),
    sa.Column('dish_id', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['dish_id'], ['dish_catalog.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['vote_id'], ['menu_votes.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('vote_id', 'dish_id')
    )
    with op.batch_alter_table('restaurants', schema=None) as batch_op:
        batch_op.add_column(sa.Column('vote_enabled', sa.Boolean(), server_default='true', nullable=False))
        batch_op.add_column(sa.Column('vote_category_ids', sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column('vote_icon_preset', sa.String(length=20), server_default='thumbs', nullable=False))



def downgrade():
    with op.batch_alter_table('restaurants', schema=None) as batch_op:
        batch_op.drop_column('vote_icon_preset')
        batch_op.drop_column('vote_category_ids')
        batch_op.drop_column('vote_enabled')

    op.drop_table('menu_vote_dishes')
    with op.batch_alter_table('menu_votes', schema=None) as batch_op:
        batch_op.drop_index('ix_menu_votes_site_date')

    op.drop_table('menu_votes')
