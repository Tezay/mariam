"""menu categories refactor: table menu_categories + migration items

Revision ID: c1d2e3f4a5b6
Revises: ff7caab46c56
Create Date: 2026-04-01 00:00:00.000000

Actions (une seule migration atomique) :
1. Crée la table menu_categories (avec auto-référence parent_id)
2. Pour chaque restaurant, insère les catégories par défaut depuis le JSON existant
3. Crée les sous-catégories de "Plat principal" (Protéines, Accompagnements, VG)
4. Ajoute category_id (Integer FK) sur menu_items
5. Migre menu_items.category (string) → menu_items.category_id (int)
6. Migre gallery_image_tags.category_id (string → int nullable)
7. Migre menu_item_images : ajoute menu_item_id, supprime category+item_index
8. Supprime menu_items.category (string) + restaurants.menu_categories (JSON)
9. Ajoute replacement_label + is_out_of_stock sur menu_items

⚠️  NE PAS lancer cette migration avant validation de la structure finale.
"""
import json
from datetime import datetime
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers
revision = 'c1d2e3f4a5b6'
down_revision = 'ff7caab46c56'
branch_labels = None
depends_on = None


# ── Données par défaut des sous-catégories de "Plat principal" ──────────────
MAIN_COURSE_SUBCATEGORIES = [
    {'label': 'Protéines',   'icon': 'beef',    'order': 1, 'is_protected': True, 'is_highlighted': True},
    {'label': 'Accompagnements', 'icon': 'wheat', 'order': 2, 'is_protected': True, 'is_highlighted': False},
    # La sous-cat "Option végétarienne" est ajoutée si le restaurant avait une cat 'vg'
]

# Mapping slug → (label, icon, order, is_protected, is_highlighted)
KNOWN_SLUG_MAP = {
    'entree':  ('Entrée',        'salad',      1, False, False),
    'plat':    ('Plat principal', 'utensils',   2, True,  True),
    'dessert': ('Dessert',       'cake-slice',  3, False, False),
    'vg':      None,  # traité comme sous-catégorie de plat principal
}


def upgrade():
    conn = op.get_bind()
    now = datetime.utcnow()

    # ── 1. Créer la table menu_categories ────────────────────────────────────
    op.create_table(
        'menu_categories',
        sa.Column('id',             sa.Integer,     primary_key=True),
        sa.Column('restaurant_id',  sa.Integer,     sa.ForeignKey('restaurants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('parent_id',      sa.Integer,     sa.ForeignKey('menu_categories.id', ondelete='CASCADE'), nullable=True),
        sa.Column('label',          sa.String(100), nullable=False),
        sa.Column('icon',           sa.String(50),  nullable=False, server_default='utensils'),
        sa.Column('order',          sa.Integer,     nullable=False, server_default='0'),
        sa.Column('is_protected',   sa.Boolean,     nullable=False, server_default='false'),
        sa.Column('is_highlighted', sa.Boolean,     nullable=False, server_default='false'),
        sa.Column('created_at',     sa.DateTime,    server_default=sa.func.now()),
        sa.Column('updated_at',     sa.DateTime,    server_default=sa.func.now()),
    )
    op.create_index('ix_menu_categories_restaurant', 'menu_categories', ['restaurant_id'])
    op.create_index('ix_menu_categories_parent',     'menu_categories', ['parent_id'])

    # ── 2. Pour chaque restaurant, créer les catégories depuis le JSON ────────
    restaurants = conn.execute(text('SELECT id, menu_categories FROM restaurants')).fetchall()

    # restaurant_id → {slug/label → category_id}
    slug_to_cat_id: dict[int, dict[str, int]] = {}
    # restaurant_id → id de la cat "Plat principal"
    plat_cat_id: dict[int, int] = {}

    for restaurant_id, menu_categories_json in restaurants:
        slug_to_cat_id[restaurant_id] = {}

        # Parser le JSON de catégories
        try:
            if isinstance(menu_categories_json, str):
                cats = json.loads(menu_categories_json)
            elif menu_categories_json:
                cats = menu_categories_json
            else:
                cats = []
        except (json.JSONDecodeError, TypeError):
            cats = []

        # Si vide, utiliser les défauts
        if not cats:
            cats = [
                {'id': 'entree',  'label': 'Entrée',            'icon': 'salad',      'order': 1},
                {'id': 'plat',    'label': 'Plat principal',    'icon': 'utensils',   'order': 2},
                {'id': 'vg',      'label': 'Option végétarienne','icon': 'leaf',       'order': 3},
                {'id': 'dessert', 'label': 'Dessert',           'icon': 'cake-slice', 'order': 4},
            ]

        has_vg = False
        for cat_config in cats:
            slug = cat_config.get('id', '')
            if slug == 'vg':
                has_vg = True
                continue  # VG sera sous-catégorie de Plat principal

            mapping = KNOWN_SLUG_MAP.get(slug)
            if mapping:
                label, icon, order, is_protected, is_highlighted = mapping
            else:
                # Catégorie custom
                label = cat_config.get('label', slug)
                icon = cat_config.get('icon', 'utensils')
                order = cat_config.get('order', 99)
                is_protected = False
                is_highlighted = False

            result = conn.execute(text(
                "INSERT INTO menu_categories "
                "(restaurant_id, parent_id, label, icon, \"order\", is_protected, is_highlighted, created_at, updated_at) "
                "VALUES (:rid, NULL, :label, :icon, :order, :prot, :highlight, :now, :now) "
                "RETURNING id"
            ), {
                'rid': restaurant_id, 'label': label, 'icon': icon,
                'order': order, 'prot': is_protected, 'highlight': is_highlighted, 'now': now,
            })
            cat_id = result.fetchone()[0]
            slug_to_cat_id[restaurant_id][slug] = cat_id

            if slug == 'plat':
                plat_cat_id[restaurant_id] = cat_id

        # ── 3. Sous-catégories de "Plat principal" ──────────────────────────
        parent_id = plat_cat_id.get(restaurant_id)
        if parent_id is None:
            # Pas de cat 'plat' dans la config custom : créer quand même
            result = conn.execute(text(
                "INSERT INTO menu_categories "
                "(restaurant_id, parent_id, label, icon, \"order\", is_protected, is_highlighted, created_at, updated_at) "
                "VALUES (:rid, NULL, 'Plat principal', 'utensils', 2, true, false, :now, :now) "
                "RETURNING id"
            ), {'rid': restaurant_id, 'now': now})
            parent_id = result.fetchone()[0]
            plat_cat_id[restaurant_id] = parent_id

        for sub in MAIN_COURSE_SUBCATEGORIES:
            result = conn.execute(text(
                "INSERT INTO menu_categories "
                "(restaurant_id, parent_id, label, icon, \"order\", is_protected, is_highlighted, created_at, updated_at) "
                "VALUES (:rid, :pid, :label, :icon, :order, :prot, :highlight, :now, :now) "
                "RETURNING id"
            ), {
                'rid': restaurant_id, 'pid': parent_id,
                'label': sub['label'], 'icon': sub['icon'],
                'order': sub['order'], 'prot': sub['is_protected'],
                'highlight': sub['is_highlighted'], 'now': now,
            })
            sub_id = result.fetchone()[0]
            if sub['label'] == 'Protéines':
                slug_to_cat_id[restaurant_id]['plat'] = sub_id  # anciens items 'plat' → Protéines

        if has_vg:
            result = conn.execute(text(
                "INSERT INTO menu_categories "
                "(restaurant_id, parent_id, label, icon, \"order\", is_protected, is_highlighted, created_at, updated_at) "
                "VALUES (:rid, :pid, 'Option végétarienne', 'leaf', 3, false, false, :now, :now) "
                "RETURNING id"
            ), {'rid': restaurant_id, 'pid': parent_id, 'now': now})
            vg_id = result.fetchone()[0]
            slug_to_cat_id[restaurant_id]['vg'] = vg_id

    # ── 4. Ajouter category_id (nullable d'abord) sur menu_items ────────────
    op.add_column('menu_items', sa.Column(
        'category_id', sa.Integer,
        sa.ForeignKey('menu_categories.id'), nullable=True
    ))

    # ── 5. Migrer menu_items.category (string) → category_id (int) ──────────
    # Pour chaque item, retrouver son restaurant via menu, puis mapper le slug
    items = conn.execute(text(
        'SELECT mi.id, mi.category, m.restaurant_id '
        'FROM menu_items mi JOIN menus m ON mi.menu_id = m.id'
    )).fetchall()

    for item_id, category_slug, restaurant_id in items:
        if restaurant_id not in slug_to_cat_id:
            continue
        cat_id = slug_to_cat_id[restaurant_id].get(category_slug)
        if cat_id:
            conn.execute(text(
                'UPDATE menu_items SET category_id = :cid WHERE id = :iid'
            ), {'cid': cat_id, 'iid': item_id})
        # Sinon : item sans catégorie connue — laissé NULL (sera visible dans le dashboard)

    # Passer category_id NOT NULL (items non mappés resteront avec NULL → acceptable)
    # Note : on ne force pas NOT NULL pour éviter les erreurs sur data inattendue.
    # La contrainte NOT NULL sera ajoutée après nettoyage manuel si nécessaire.

    # ── 6. Migrer gallery_image_tags.category_id (string → int nullable) ─────
    op.add_column('gallery_image_tags', sa.Column(
        'category_id_new', sa.Integer, nullable=True
    ))

    # Récupérer tous les tags de type 'category' avec leur category_id string
    cat_tags = conn.execute(text(
        "SELECT git.id, git.category_id, gi.restaurant_id "
        "FROM gallery_image_tags git "
        "JOIN gallery_images gi ON git.gallery_image_id = gi.id "
        "WHERE git.tag_type = 'category' AND git.category_id IS NOT NULL"
    )).fetchall()

    for tag_id, slug, restaurant_id in cat_tags:
        if restaurant_id not in slug_to_cat_id:
            continue
        cat_id = slug_to_cat_id[restaurant_id].get(slug)
        if cat_id:
            conn.execute(text(
                'UPDATE gallery_image_tags SET category_id_new = :cid WHERE id = :tid'
            ), {'cid': cat_id, 'tid': tag_id})

    # Remplacer l'ancienne colonne
    op.drop_column('gallery_image_tags', 'category_id')
    op.alter_column('gallery_image_tags', 'category_id_new', new_column_name='category_id')

    # ── 7. Migrer menu_item_images : ajouter menu_item_id ────────────────────
    op.add_column('menu_item_images', sa.Column(
        'menu_item_id', sa.Integer,
        sa.ForeignKey('menu_items.id', ondelete='CASCADE'), nullable=True
    ))

    # Reconstituer menu_item_id depuis (menu_id, category, item_index)
    # On cherche l'item de même catégorie et du même ordre dans le menu
    item_images = conn.execute(text(
        'SELECT id, menu_id, category, item_index FROM menu_item_images'
    )).fetchall()

    for link_id, menu_id, category_slug, item_index in item_images:
        # Trouver le restaurant pour résoudre le slug → cat_id
        menu_row = conn.execute(text(
            'SELECT restaurant_id FROM menus WHERE id = :mid'
        ), {'mid': menu_id}).fetchone()
        if not menu_row:
            continue
        restaurant_id = menu_row[0]
        cat_id = slug_to_cat_id.get(restaurant_id, {}).get(category_slug)
        if not cat_id:
            continue

        # Chercher l'item correspondant (même menu, même catégorie, même position)
        item_row = conn.execute(text(
            'SELECT id FROM menu_items '
            'WHERE menu_id = :mid AND category_id = :cid '
            'ORDER BY "order" LIMIT 1 OFFSET :idx'
        ), {'mid': menu_id, 'cid': cat_id, 'idx': item_index}).fetchone()

        if item_row:
            conn.execute(text(
                'UPDATE menu_item_images SET menu_item_id = :iid WHERE id = :lid'
            ), {'iid': item_row[0], 'lid': link_id})
        else:
            # Pas de correspondance : supprimer le lien orphelin
            conn.execute(text('DELETE FROM menu_item_images WHERE id = :lid'), {'lid': link_id})

    # Créer l'index + supprimer les anciennes colonnes de menu_item_images
    op.create_index('ix_menu_item_images_item', 'menu_item_images', ['menu_item_id'])
    op.drop_index('ix_menu_item_images_menu', table_name='menu_item_images')
    op.drop_column('menu_item_images', 'menu_id')
    op.drop_column('menu_item_images', 'category')
    op.drop_column('menu_item_images', 'item_index')

    # ── 8. Supprimer les colonnes obsolètes ──────────────────────────────────
    op.drop_column('menu_items', 'category')
    op.drop_column('restaurants', 'menu_categories')

    # ── 9. Ajouter replacement_label + is_out_of_stock sur menu_items ────────
    op.add_column('menu_items', sa.Column(
        'replacement_label', sa.String(200), nullable=True
    ))
    op.add_column('menu_items', sa.Column(
        'is_out_of_stock', sa.Boolean, nullable=False, server_default='false'
    ))


def downgrade():
    # Downgrade partiel : recrée les colonnes supprimées mais ne remigre pas les données
    op.add_column('menu_items', sa.Column('category', sa.String(50), nullable=True))
    op.add_column('restaurants', sa.Column('menu_categories', sa.JSON, nullable=True))
    op.drop_column('menu_items', 'is_out_of_stock')
    op.drop_column('menu_items', 'replacement_label')
    op.drop_column('menu_items', 'category_id')
    op.add_column('menu_item_images', sa.Column('menu_id', sa.Integer, nullable=True))
    op.add_column('menu_item_images', sa.Column('category', sa.String(50), nullable=True))
    op.add_column('menu_item_images', sa.Column('item_index', sa.Integer, nullable=True))
    op.drop_column('menu_item_images', 'menu_item_id')
    op.drop_table('menu_categories')
