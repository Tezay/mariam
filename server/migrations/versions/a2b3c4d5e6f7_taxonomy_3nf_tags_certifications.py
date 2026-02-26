"""taxonomy: tags & certifications normalisés

Revision ID: a2b3c4d5e6f7
Revises: f6a7b8c9d0e1
Create Date: 2025-01-01 00:00:00.000000

Actions :
1. Crée les tables de référence (catégories, tags, certifications, mots-clés).
2. Crée les tables de jonction N:N (restaurant_*, menu_item_*).
3. Peuple les tables depuis le registre Python (taxonomy.py).
4. Supprime les colonnes legacy de menu_items et restaurants.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'a2b3c4d5e6f7'
down_revision = 'f6a7b8c9d0e1'
branch_labels = None
depends_on = None


def upgrade():
    # ── 1. Tables de référence ──────────────────────────────────────

    op.create_table(
        'dietary_tag_categories',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('color', sa.String(30), nullable=True),
        sa.Column('sort_order', sa.Integer, default=0),
    )

    op.create_table(
        'certification_categories',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('sort_order', sa.Integer, default=0),
    )

    op.create_table(
        'dietary_tags',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('label', sa.String(100), nullable=False),
        sa.Column('icon', sa.String(50), nullable=False),
        sa.Column('color', sa.String(30), nullable=False),
        sa.Column('category_id', sa.String(50),
                  sa.ForeignKey('dietary_tag_categories.id'), nullable=False),
        sa.Column('sort_order', sa.Integer, default=0),
    )

    op.create_table(
        'certifications',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('official_name', sa.String(200), nullable=False),
        sa.Column('issuer', sa.String(200), nullable=False),
        sa.Column('scheme_type', sa.String(20), nullable=False),
        sa.Column('jurisdiction', sa.String(30), nullable=False),
        sa.Column('guarantee', sa.String(300), nullable=True),
        sa.Column('logo_filename', sa.String(100), nullable=False),
        sa.Column('category_id', sa.String(50),
                  sa.ForeignKey('certification_categories.id'), nullable=False),
        sa.Column('sort_order', sa.Integer, default=0),
    )

    op.create_table(
        'dietary_tag_keywords',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('tag_id', sa.String(50),
                  sa.ForeignKey('dietary_tags.id', ondelete='CASCADE'), nullable=False),
        sa.Column('keyword', sa.String(100), nullable=False),
        sa.UniqueConstraint('tag_id', 'keyword', name='uq_tag_keyword'),
    )

    op.create_table(
        'certification_keywords',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('certification_id', sa.String(50),
                  sa.ForeignKey('certifications.id', ondelete='CASCADE'), nullable=False),
        sa.Column('keyword', sa.String(100), nullable=False),
        sa.UniqueConstraint('certification_id', 'keyword', name='uq_cert_keyword'),
    )

    # ── 2. Tables de jonction ───────────────────────────────────────

    op.create_table(
        'restaurant_dietary_tags',
        sa.Column('restaurant_id', sa.Integer,
                  sa.ForeignKey('restaurants.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('tag_id', sa.String(50),
                  sa.ForeignKey('dietary_tags.id', ondelete='CASCADE'), primary_key=True),
    )

    op.create_table(
        'restaurant_certifications',
        sa.Column('restaurant_id', sa.Integer,
                  sa.ForeignKey('restaurants.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('certification_id', sa.String(50),
                  sa.ForeignKey('certifications.id', ondelete='CASCADE'), primary_key=True),
    )

    op.create_table(
        'menu_item_dietary_tags',
        sa.Column('menu_item_id', sa.Integer,
                  sa.ForeignKey('menu_items.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('tag_id', sa.String(50),
                  sa.ForeignKey('dietary_tags.id', ondelete='CASCADE'), primary_key=True),
    )

    op.create_table(
        'menu_item_certifications',
        sa.Column('menu_item_id', sa.Integer,
                  sa.ForeignKey('menu_items.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('certification_id', sa.String(50),
                  sa.ForeignKey('certifications.id', ondelete='CASCADE'), primary_key=True),
    )

    # ── 3. Peuplement depuis le registre ────────────────────────────

    from app.data.taxonomy import (
        DIETARY_TAG_CATEGORIES,
        DIETARY_TAGS,
        DIETARY_TAG_KEYWORDS,
        CERTIFICATION_CATEGORIES,
        CERTIFICATIONS,
        CERTIFICATION_KEYWORDS,
    )

    # Helper tables for bulk insert
    tag_cat_t = sa.table('dietary_tag_categories',
        sa.column('id', sa.String), sa.column('name', sa.String),
        sa.column('color', sa.String), sa.column('sort_order', sa.Integer))

    cert_cat_t = sa.table('certification_categories',
        sa.column('id', sa.String), sa.column('name', sa.String),
        sa.column('sort_order', sa.Integer))

    tag_t = sa.table('dietary_tags',
        sa.column('id', sa.String), sa.column('label', sa.String),
        sa.column('icon', sa.String), sa.column('color', sa.String),
        sa.column('category_id', sa.String), sa.column('sort_order', sa.Integer))

    cert_t = sa.table('certifications',
        sa.column('id', sa.String), sa.column('name', sa.String),
        sa.column('official_name', sa.String), sa.column('issuer', sa.String),
        sa.column('scheme_type', sa.String), sa.column('jurisdiction', sa.String),
        sa.column('guarantee', sa.String), sa.column('logo_filename', sa.String),
        sa.column('category_id', sa.String), sa.column('sort_order', sa.Integer))

    tag_kw_t = sa.table('dietary_tag_keywords',
        sa.column('tag_id', sa.String), sa.column('keyword', sa.String))

    cert_kw_t = sa.table('certification_keywords',
        sa.column('certification_id', sa.String), sa.column('keyword', sa.String))

    # Insert categories
    op.bulk_insert(tag_cat_t, DIETARY_TAG_CATEGORIES)
    op.bulk_insert(cert_cat_t, CERTIFICATION_CATEGORIES)

    # Insert tags
    op.bulk_insert(tag_t, [{
        'id': t['id'], 'label': t['label'], 'icon': t['icon'],
        'color': t['color'], 'category_id': t['category_id'],
        'sort_order': t['sort_order'],
    } for t in DIETARY_TAGS])

    # Insert certifications
    op.bulk_insert(cert_t, [{
        'id': c['id'], 'name': c['name'], 'official_name': c['official_name'],
        'issuer': c['issuer'], 'scheme_type': c['scheme_type'],
        'jurisdiction': c['jurisdiction'], 'guarantee': c['guarantee'],
        'logo_filename': c['logo_filename'], 'category_id': c['category_id'],
        'sort_order': c['sort_order'],
    } for c in CERTIFICATIONS])

    # Insert keywords
    tag_kw_rows = []
    for tag_id, keywords in DIETARY_TAG_KEYWORDS.items():
        for kw in keywords:
            tag_kw_rows.append({'tag_id': tag_id, 'keyword': kw})
    op.bulk_insert(tag_kw_t, tag_kw_rows)

    cert_kw_rows = []
    for cert_id, keywords in CERTIFICATION_KEYWORDS.items():
        for kw in keywords:
            cert_kw_rows.append({'certification_id': cert_id, 'keyword': kw})
    op.bulk_insert(cert_kw_t, cert_kw_rows)

    # ── 4. Suppression des colonnes legacy ──────────────────────────

    # menu_items: supprimer les 6 colonnes legacy
    with op.batch_alter_table('menu_items') as batch_op:
        batch_op.drop_column('is_vegetarian')
        batch_op.drop_column('is_halal')
        batch_op.drop_column('is_pork_free')
        batch_op.drop_column('allergens')
        batch_op.drop_column('tags')
        batch_op.drop_column('certifications')

    # restaurants: supprimer les 2 colonnes JSON
    with op.batch_alter_table('restaurants') as batch_op:
        batch_op.drop_column('dietary_tags')
        batch_op.drop_column('certifications')


def downgrade():
    # Restaurer colonnes legacy
    with op.batch_alter_table('restaurants') as batch_op:
        batch_op.add_column(sa.Column('dietary_tags', sa.JSON, nullable=True))
        batch_op.add_column(sa.Column('certifications', sa.JSON, nullable=True))

    with op.batch_alter_table('menu_items') as batch_op:
        batch_op.add_column(sa.Column('is_vegetarian', sa.Boolean, server_default='false'))
        batch_op.add_column(sa.Column('is_halal', sa.Boolean, server_default='false'))
        batch_op.add_column(sa.Column('is_pork_free', sa.Boolean, server_default='false'))
        batch_op.add_column(sa.Column('allergens', sa.Text, nullable=True))
        batch_op.add_column(sa.Column('tags', sa.JSON, nullable=True))
        batch_op.add_column(sa.Column('certifications', sa.JSON, nullable=True))

    # Supprimer tables de jonction
    op.drop_table('menu_item_certifications')
    op.drop_table('menu_item_dietary_tags')
    op.drop_table('restaurant_certifications')
    op.drop_table('restaurant_dietary_tags')

    # Supprimer tables de mots-clés
    op.drop_table('certification_keywords')
    op.drop_table('dietary_tag_keywords')

    # Supprimer tables principales
    op.drop_table('certifications')
    op.drop_table('dietary_tags')

    # Supprimer catégories
    op.drop_table('certification_categories')
    op.drop_table('dietary_tag_categories')
