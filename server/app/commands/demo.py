"""
flask seed-demo — Create a complete demo dataset for client presentations.

Creates (or reuses) a demo restaurant, an admin account without MFA,
and a full published week of realistic CROUS-style menus.
Idempotent: re-running wipes and regenerates this week's menus.

Usage:
    docker compose exec backend flask seed-demo
"""
import secrets
import string
from datetime import UTC, date, datetime, timedelta

import click
from werkzeug.security import generate_password_hash

from ..commands.seed import (
    _upsert_certification_categories,
    _upsert_certification_keywords,
    _upsert_certifications,
    _upsert_dietary_tag_categories,
    _upsert_dietary_tag_keywords,
    _upsert_dietary_tags,
)
from ..extensions import db
from ..models.category import MenuCategory
from ..models.menu import Menu, MenuItem
from ..models.restaurant import Restaurant
from ..models.taxonomy import DietaryTag
from ..models.user import User

_DEMO_CODE = 'DEMO'
_DEMO_EMAIL = 'demo@mariam.app'
_PALETTE = ['indigo', 'sky', 'mint', 'saffron', 'clay', 'lilac']


def register_commands(app):
    @app.cli.command('seed-demo')
    def seed_demo():
        """Create demo restaurant, admin user, and a published week of menus."""
        # 1. Ensure taxonomy is seeded first
        click.echo('\n⏳ Vérification de la taxonomie...')
        _upsert_dietary_tag_categories()
        _upsert_dietary_tags()
        _upsert_dietary_tag_keywords()
        _upsert_certification_categories()
        _upsert_certifications()
        _upsert_certification_keywords()
        db.session.commit()

        # 2. Restaurant
        restaurant = _ensure_demo_restaurant()
        db.session.commit()

        # 3. Menu categories
        categories = _ensure_menu_categories(restaurant.id)
        db.session.commit()

        # 4. Admin user
        password = _generate_password()
        _ensure_demo_user(password, restaurant.id)
        db.session.commit()

        # 5. Menus (current week Mon–Fri)
        week = _get_current_week()
        menu_count, item_count = _create_demo_menus(restaurant.id, categories, week)
        db.session.commit()

        # 6. Summary
        frontend_url = app.config.get('FRONTEND_URL', 'http://localhost:5173')
        click.echo('\n' + '=' * 55)
        click.echo('  DEMO — Données de présentation créées')
        click.echo('=' * 55)
        click.echo(f'  Restaurant   : {restaurant.name} (code: {restaurant.code})')
        click.echo(f'  Menus        : {menu_count} jours, {item_count} plats')
        click.echo('  Identifiants :')
        click.echo(f'    Email      : {_DEMO_EMAIL}')
        click.echo(f'    Mot de passe: {password}')
        rid = restaurant.id
        click.echo(f'  URL admin    : {frontend_url}/admin/')
        click.echo(f'  Vue TV       : {frontend_url}/menu?mode=tv&restaurant_id={rid}')
        click.echo(f'  Vue mobile   : {frontend_url}/menu?restaurant_id={rid}')
        click.echo('=' * 55)
        click.echo('  ✅  Prêt pour la démo !\n')


# ──────────────────────────────────────────────────────────────────────
#  Restaurant
# ──────────────────────────────────────────────────────────────────────

def _ensure_demo_restaurant() -> Restaurant:
    restaurant = Restaurant.query.filter_by(code=_DEMO_CODE).first()
    if not restaurant:
        restaurant = Restaurant(
            name='Restaurant Universitaire — Démo',
            code=_DEMO_CODE,
            is_active=True,
        )
        db.session.add(restaurant)
        click.echo('  ✓ Restaurant démo créé')
    else:
        click.echo(f'  ✓ Restaurant démo réutilisé (ID {restaurant.id})')
    return restaurant


# ──────────────────────────────────────────────────────────────────────
#  Menu categories
# ──────────────────────────────────────────────────────────────────────

_CATEGORY_TREE = [
    {
        'label': 'Entrées',
        'order': 1,
        'color_key': 'sky',
        'children': [
            {'label': 'Froides', 'order': 1},
            {'label': 'Chaudes', 'order': 2},
        ],
    },
    {
        'label': 'Plat principal',
        'order': 2,
        'color_key': 'saffron',
        'is_highlighted': True,
        'children': [
            {'label': 'Viandes et volailles', 'order': 1},
            {'label': 'Poissons', 'order': 2},
            {'label': 'Végétarien', 'order': 3},
        ],
    },
    {
        'label': 'Garnitures',
        'order': 3,
        'color_key': 'mint',
        'children': [],
    },
    {
        'label': 'Fromages et laitages',
        'order': 4,
        'color_key': 'clay',
        'children': [],
    },
    {
        'label': 'Desserts',
        'order': 5,
        'color_key': 'lilac',
        'children': [
            {'label': 'Pâtisseries', 'order': 1},
            {'label': 'Fruits et laitages', 'order': 2},
        ],
    },
]


def _ensure_menu_categories(restaurant_id: int) -> dict:
    """Create menu categories if they don't exist. Returns a label→id map."""
    existing = {
        c.label: c
        for c in MenuCategory.query.filter_by(restaurant_id=restaurant_id).all()
    }
    result = {}

    for i, cat_data in enumerate(_CATEGORY_TREE):
        label = cat_data['label']
        if label not in existing:
            cat = MenuCategory(
                restaurant_id=restaurant_id,
                label=label,
                order=cat_data['order'],
                color_key=cat_data.get('color_key', _PALETTE[i % len(_PALETTE)]),
                is_highlighted=cat_data.get('is_highlighted', False),
            )
            db.session.add(cat)
            db.session.flush()
            existing[label] = cat

        result[label] = existing[label].id

        for child_data in cat_data.get('children', []):
            child_label = child_data['label']
            if child_label not in existing:
                child = MenuCategory(
                    restaurant_id=restaurant_id,
                    parent_id=existing[label].id,
                    label=child_label,
                    order=child_data['order'],
                )
                db.session.add(child)
                db.session.flush()
                existing[child_label] = child

            result[child_label] = existing[child_label].id

    click.echo(f'  ✓ {len(result)} catégories de menu')
    return result


# ──────────────────────────────────────────────────────────────────────
#  User
# ──────────────────────────────────────────────────────────────────────

def _generate_password() -> str:
    chars = string.ascii_letters + string.digits
    base = ''.join(secrets.choice(chars) for _ in range(10))
    return f'Demo!{base}1'


def _ensure_demo_user(password: str, restaurant_id: int) -> User:
    user = User.query.filter_by(email=_DEMO_EMAIL).first()
    if not user:
        user = User(
            email=_DEMO_EMAIL,
            username='demo',
            password_hash=generate_password_hash(password),
            role='admin',
            is_active=True,
            mfa_enabled=False,
            restaurant_id=restaurant_id,
        )
        db.session.add(user)
        click.echo(f'  ✓ Utilisateur demo créé ({_DEMO_EMAIL})')
    else:
        user.password_hash = generate_password_hash(password)
        user.is_active = True
        user.mfa_enabled = False
        click.echo(f'  ✓ Mot de passe demo réinitialisé ({_DEMO_EMAIL})')
    return user


# ──────────────────────────────────────────────────────────────────────
#  Menus
# ──────────────────────────────────────────────────────────────────────

def _get_current_week() -> list[date]:
    today = date.today()
    monday = today - timedelta(days=today.weekday())
    return [monday + timedelta(days=i) for i in range(5)]


# Realistic CROUS-style menu items: (name, category_label, tag_ids)
_WEEK_MENUS = [
    # Monday
    [
        ('Salade verte aux herbes',       'Froides',              ['vegetarian', 'vegan']),
        ('Carottes râpées',               'Froides',              ['vegetarian', 'vegan']),
        ('Taboulé maison',                'Froides',              ['vegetarian', 'homemade']),
        ('Velouté de tomates',            'Chaudes',              ['vegetarian', 'vegan', 'homemade']),
        ('Bœuf bourguignon',              'Viandes et volailles', []),
        ('Escalope de poulet milanaise',  'Viandes et volailles', ['homemade']),
        ('Filet de merlan meunière',      'Poissons',             ['pescetarian']),
        ('Gratin de légumes du jardin',   'Végétarien',           ['vegetarian', 'homemade']),
        ('Haricots verts sautés',         'Garnitures',           ['vegetarian', 'vegan']),
        ('Pommes de terre vapeur',        'Garnitures',           ['vegetarian', 'vegan']),
        ('Comté AOP',                     'Fromages et laitages', []),
        ('Yaourt nature',                 'Fruits et laitages',   ['vegetarian']),
        ('Tarte aux pommes maison',       'Pâtisseries',          ['vegetarian', 'homemade']),
        ('Compote de pommes',             'Fruits et laitages',   ['vegetarian', 'vegan']),
    ],
    # Tuesday
    [
        ('Betteraves rouges vinaigrette',    'Froides',              ['vegetarian', 'vegan']),
        ('Concombre à la menthe',            'Froides',              ['vegetarian', 'vegan']),
        ('Soupe de poireaux',                'Chaudes',              ['vegetarian', 'vegan']),
        ('Rôti de porc aux herbes',          'Viandes et volailles', ['homemade']),
        ('Poulet basquaise',                 'Viandes et volailles', ['homemade', 'traditional']),
        ('Saumon grillé citron',             'Poissons',             ['pescetarian', 'local_product']),
        ('Quiche aux légumes',               'Végétarien',           ['vegetarian', 'homemade']),
        ('Riz pilaf',                        'Garnitures',           ['vegetarian', 'vegan']),
        ('Ratatouille provençale',           'Garnitures',           ['vegetarian', 'vegan', 'seasonal']),
        ('Fromage blanc',                    'Fromages et laitages', ['vegetarian']),
        ('Fondant au chocolat',              'Pâtisseries',          ['vegetarian', 'homemade']),
        ('Salade de fruits de saison',       'Fruits et laitages',   ['vegetarian', 'vegan', 'seasonal']),
    ],
    # Wednesday
    [
        ('Salade niçoise',                   'Froides',              ['pescetarian', 'homemade']),
        ('Pamplemousse au sucre',            'Froides',              ['vegetarian', 'vegan']),
        ('Soupe à l\'oignon gratinée',       'Chaudes',              ['vegetarian', 'homemade', 'traditional']),
        ('Hachis parmentier maison',         'Viandes et volailles', ['homemade', 'traditional']),
        ('Suprême de poulet à la crème',     'Viandes et volailles', ['homemade']),
        ('Dos de cabillaud sauce vierge',    'Poissons',             ['pescetarian', 'homemade']),
        ('Curry de pois chiches',            'Végétarien',           ['vegetarian', 'vegan', 'homemade']),
        ('Pâtes fraîches au beurre',         'Garnitures',           ['vegetarian']),
        ('Épinards à la crème',              'Garnitures',           ['vegetarian']),
        ('Camembert de Normandie',           'Fromages et laitages', []),
        ('Crème brûlée vanille',             'Pâtisseries',          ['vegetarian', 'homemade', 'chef_special']),
        ('Banane',                           'Fruits et laitages',   ['vegetarian', 'vegan']),
    ],
    # Thursday
    [
        ('Salade de lentilles',              'Froides',              ['vegetarian', 'vegan']),
        ('Tomates mozarella basilic',        'Froides',              ['vegetarian', 'seasonal']),
        ('Velouté de butternut',             'Chaudes',              ['vegetarian', 'vegan', 'seasonal', 'homemade']),
        ('Blanquette de veau',               'Viandes et volailles', ['homemade', 'traditional', 'chef_special']),
        ('Steak haché grillé',               'Viandes et volailles', []),
        ('Coquilles Saint-Jacques poêlées',  'Poissons',             ['pescetarian', 'local_product', 'chef_special']),
        ('Tian de légumes provençal',        'Végétarien',           ['vegetarian', 'vegan', 'seasonal', 'homemade']),
        ('Semoule de couscous',              'Garnitures',           ['vegetarian', 'vegan']),
        ('Carottes Vichy',                   'Garnitures',           ['vegetarian', 'vegan']),
        ('Brie de Meaux',                    'Fromages et laitages', []),
        ('Mille-feuille',                    'Pâtisseries',          ['vegetarian', 'homemade']),
        ('Yaourt aux fruits',                'Fruits et laitages',   ['vegetarian']),
    ],
    # Friday
    [
        ('Salade de pâtes provençale',       'Froides',              ['vegetarian', 'homemade']),
        ('Melon et jambon de pays',          'Froides',              ['seasonal']),
        ('Soupe de poisson',                 'Chaudes',              ['pescetarian', 'homemade', 'traditional']),
        ('Côte de porc aux pruneaux',        'Viandes et volailles', ['homemade', 'traditional']),
        ('Merguez grillées',                 'Viandes et volailles', []),
        ('Sole meunière beurre citron',      'Poissons',             ['pescetarian', 'homemade', 'chef_special']),
        ('Lasagnes végétariennes',           'Végétarien',           ['vegetarian', 'homemade']),
        ('Pommes dauphine',                  'Garnitures',           ['vegetarian']),
        ('Flageolets persillés',             'Garnitures',           ['vegetarian', 'vegan']),
        ('Reblochon de Savoie',              'Fromages et laitages', []),
        ('Tarte tatin maison',               'Pâtisseries',          ['vegetarian', 'homemade', 'traditional']),
        ('Mousse au chocolat',               'Pâtisseries',          ['vegetarian', 'homemade']),
        ('Fruit du jour',                    'Fruits et laitages',   ['vegetarian', 'vegan', 'seasonal']),
    ],
]


def _create_demo_menus(
    restaurant_id: int,
    categories: dict,
    week: list[date],
) -> tuple[int, int]:
    tag_cache: dict[str, DietaryTag] = {
        t.id: t for t in DietaryTag.query.all()
    }

    menu_count = 0
    item_count = 0

    for day_date, day_items in zip(week, _WEEK_MENUS, strict=False):
        # Delete existing menu for this date (idempotent)
        existing = Menu.query.filter_by(
            restaurant_id=restaurant_id, date=day_date
        ).first()
        if existing:
            db.session.delete(existing)
            db.session.flush()

        menu = Menu(
            restaurant_id=restaurant_id,
            date=day_date,
            status='published',
            published_at=datetime.now(UTC),
        )
        db.session.add(menu)
        db.session.flush()

        for order, (name, cat_label, tag_ids) in enumerate(day_items):
            cat_id = categories.get(cat_label)
            if not cat_id:
                continue

            item = MenuItem(
                menu_id=menu.id,
                category_id=cat_id,
                name=name,
                order=order,
            )
            for tid in tag_ids:
                if tid in tag_cache:
                    item.tags.append(tag_cache[tid])

            db.session.add(item)
            item_count += 1

        menu_count += 1

    click.echo(f'  ✓ {menu_count} menus créés/mis à jour ({item_count} plats)')
    return menu_count, item_count
