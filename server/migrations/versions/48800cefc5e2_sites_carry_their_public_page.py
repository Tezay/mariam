"""sites carry their public page: texts, logo, cover, gallery, links and menu window

Revision ID: 48800cefc5e2
Revises: 06df321ae0cd
Create Date: 2026-10-25 21:00:00.000000

"""
import re

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '48800cefc5e2'
down_revision = '06df321ae0cd'
branch_labels = None
depends_on = None

# A Base Adresse Nationale label ends with its postcode and city.
_POSTCODE_CITY = re.compile(r'^.*\s(\d{5})\s+(.+)$')


def upgrade():
    with op.batch_alter_table('restaurants', schema=None) as batch_op:
        batch_op.add_column(sa.Column('logo_storage_key', sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column('cover_url', sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column('cover_storage_key', sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column('address_city', sa.String(length=100), nullable=True))
        batch_op.add_column(sa.Column('address_postcode', sa.String(length=10), nullable=True))
        batch_op.add_column(sa.Column('tagline', sa.String(length=160), nullable=True))
        batch_op.add_column(sa.Column('description', sa.String(length=800), nullable=True))
        batch_op.add_column(sa.Column('access_info', sa.String(length=300), nullable=True))
        batch_op.add_column(sa.Column('services', sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column('links', sa.JSON(), nullable=True))
        batch_op.add_column(
            sa.Column('menu_days_ahead', sa.Integer(), nullable=False, server_default='7')
        )
        batch_op.add_column(
            sa.Column('menu_days_back', sa.Integer(), nullable=False, server_default='30')
        )

    op.create_table(
        'restaurant_photos',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('restaurant_id', sa.Integer(), nullable=False),
        sa.Column('storage_key', sa.String(length=500), nullable=False),
        sa.Column('url', sa.String(length=500), nullable=False),
        sa.Column('alt', sa.String(length=150), nullable=False),
        sa.Column('order', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['restaurant_id'], ['restaurants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('restaurant_photos', schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f('ix_restaurant_photos_restaurant_id'), ['restaurant_id'], unique=False
        )

    sites = sa.table(
        'restaurants',
        sa.column('id', sa.Integer),
        sa.column('address_label', sa.String),
        sa.column('address_city', sa.String),
        sa.column('address_postcode', sa.String),
    )
    bind = op.get_bind()
    labelled = sa.select(sites.c.id, sites.c.address_label).where(sites.c.address_label.isnot(None))
    for row in bind.execute(labelled).all():
        if match := _POSTCODE_CITY.search(row.address_label):
            bind.execute(
                sites.update()
                .where(sites.c.id == row.id)
                .values(address_postcode=match[1], address_city=match[2][:100])
            )

    # Typed by hand until #124: a page shows uploaded logos only. downgrade()
    # cannot bring these back.
    op.execute('UPDATE restaurants SET logo_url = NULL')


def downgrade():
    with op.batch_alter_table('restaurant_photos', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_restaurant_photos_restaurant_id'))
    op.drop_table('restaurant_photos')

    with op.batch_alter_table('restaurants', schema=None) as batch_op:
        for column in (
            'menu_days_back', 'menu_days_ahead', 'links', 'services', 'access_info',
            'description', 'tagline', 'address_postcode', 'address_city', 'cover_storage_key',
            'cover_url', 'logo_storage_key',
        ):
            batch_op.drop_column(column)
