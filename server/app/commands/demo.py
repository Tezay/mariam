"""
flask seed-demo — Create a complete demo dataset for client presentations.

Creates (or reuses) a demo restaurant, an admin account without MFA,
and a full published week of realistic CROUS-style menus.
Idempotent: re-running wipes and regenerates this week's menus and the demo
site's own analytics history, leaving every other site untouched.

Usage:
    docker compose exec backend flask seed-demo
"""
import json
import random
import secrets
import string
from datetime import date, datetime, time, timedelta
from typing import Any

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
from ..models.audit_log import AuditLog
from ..models.catalog import DishCatalog
from ..models.category import MenuCategory
from ..models.menu import Menu, MenuItem
from ..models.menu_vote import MenuVote
from ..models.organization import Organization
from ..models.restaurant import DEFAULT_SERVICE_DAYS, Restaurant, RestaurantServiceHours
from ..models.telemetry import PageViewRollup, VisitorDailyUnique
from ..models.user import User
from ..routes.helpers import get_or_create_dish
from ..services.votes import vote_dish_groups
from ..utils.time import paris_today

_DEMO_CODE = 'DEMO'
_DEMO_SLUG = 'demo'
_DEMO_EMAIL = 'demo@mariam.app'
_DIRECTOR_EMAIL = 'direction@mariam.app'

# Three sites rather than one: a supervision dashboard, its alerts and its
# weekly email only mean something across a fleet. The profiles differ so the
# ranking, the sites to watch and the satisfaction gap are not flat.
_DEMO_SITES = [
    {
        'name': 'Restaurant Universitaire — Démo',
        'code': _DEMO_CODE,
        'slug': _DEMO_SLUG,
        'visitors': (180, 420),
        'ratings': [12, 28, 60],
        'skip_days': (),
    },
    {
        'name': 'Cafétéria des Sciences',
        'code': 'DEMO_SCIENCES',
        'slug': 'sciences',
        'visitors': (90, 220),
        'ratings': [18, 34, 48],
        'skip_days': (4,),
    },
    {
        'name': 'RU Campus Nord',
        'code': 'DEMO_NORD',
        'slug': 'nord',
        'visitors': (60, 160),
        'ratings': [34, 36, 30],
        'skip_days': (1, 3),
    },
]
_DEMO_OPEN_TIME = '11:30'
_DEMO_CLOSE_TIME = '14:00'
_PALETTE = ['indigo', 'sky', 'mint', 'saffron', 'clay', 'lilac']


def register_commands(app):
    @app.cli.command('seed-demo')
    def seed_demo():
        """Create demo restaurant, admin user, and a published week of menus."""
        # 1. Ensure taxonomy is seeded first
        click.echo('\n⏳ Checking reference taxonomy...')
        _upsert_dietary_tag_categories()
        _upsert_dietary_tags()
        _upsert_dietary_tag_keywords()
        _upsert_certification_categories()
        _upsert_certifications()
        _upsert_certification_keywords()
        db.session.commit()

        # 2. Organization and its sites
        organization = _ensure_demo_organization()
        db.session.commit()
        password = _generate_password()
        restaurants = []
        menu_count = item_count = view_count = vote_count = 0

        for site in _DEMO_SITES:
            restaurant = _ensure_demo_restaurant(organization, site)
            db.session.commit()
            categories = _ensure_menu_categories(restaurant.id)
            db.session.commit()
            menus, items = _create_demo_menus(restaurant.id, categories, _menu_plan(site))
            db.session.commit()
            views, votes = _create_demo_analytics(restaurant, site)
            db.session.commit()
            restaurants.append(restaurant)
            menu_count += menus
            item_count += items
            view_count += views
            vote_count += votes

        # 3. Accounts: one site admin and the director who oversees them all
        admin = _ensure_demo_user(password, restaurants[0].id)
        _ensure_demo_director(password, organization.id)
        db.session.commit()
        _seed_activity(restaurants, admin.id)
        db.session.commit()
        restaurant = restaurants[0]

        # 7. Summary
        frontend_url = app.config.get('FRONTEND_URL', 'http://localhost:5173')
        # A single-site organization serves its menu at the root; a multi-site
        # one lists its sites there instead.
        site_count = Restaurant.query.filter_by(
            organization_id=restaurant.organization_id, is_active=True
        ).count()
        menu_path = '/menu' if site_count == 1 else f'/{restaurant.slug}/menu'
        click.echo('\n' + '=' * 55)
        click.echo('  DEMO — Presentation dataset ready')
        click.echo('=' * 55)
        click.echo(f'  Organization : {organization.name} ({len(restaurants)} sites)')
        for site in restaurants:
            click.echo(f'    · {site.name} (code: {site.code})')
        click.echo(f'  Menus        : {menu_count} days, {item_count} dishes')
        click.echo(f'  Analytics    : {view_count} views, {vote_count} votes')
        click.echo('  Credentials  :')
        click.echo(f'    Site admin  : {_DEMO_EMAIL}')
        click.echo(f'    Supervisor  : {_DIRECTOR_EMAIL}')
        click.echo(f'    Password    : {password}')
        click.echo(f'  Service      : {_DEMO_OPEN_TIME}–{_DEMO_CLOSE_TIME}, '
                   f'voting opens at {_DEMO_OPEN_TIME} (Paris time)')
        click.echo(f'  Admin URL    : {frontend_url}/admin/')
        click.echo(f'  TV view      : {frontend_url}{menu_path}?mode=tv')
        click.echo(f'  Mobile view  : {frontend_url}{menu_path}')
        click.echo('=' * 55)
        click.echo('  ✅  Ready for the demo.\n')


# ──────────────────────────────────────────────────────────────────────
#  Restaurant
# ──────────────────────────────────────────────────────────────────────

def _ensure_demo_organization() -> Organization:
    organization = Organization.query.filter_by(slug=_DEMO_SLUG).first()
    if not organization:
        organization = Organization(name='Organisation Démo', slug=_DEMO_SLUG, is_active=True)
        db.session.add(organization)
        db.session.flush()
    return organization


def _ensure_demo_restaurant(organization: Organization, site: dict) -> Restaurant:
    """One demo site, attached to the organization.

    The public pages resolve their tenant from the Host, so a site without an
    organization has no reachable menu page at all.
    """
    restaurant = Restaurant.query.filter_by(code=site['code']).first()
    if not restaurant:
        restaurant = Restaurant(name=site['name'], code=site['code'], is_active=True)
        db.session.add(restaurant)
        click.echo(f'  ✓ Site created: {site["name"]}')
    else:
        click.echo(f'  ✓ Site reused: {site["name"]} (id {restaurant.id})')

    restaurant.organization_id = organization.id
    restaurant.slug = restaurant.slug or site['slug']
    restaurant.service_days = list(DEFAULT_SERVICE_DAYS)
    db.session.flush()
    _ensure_service_hours(restaurant.id)
    return restaurant


def _ensure_service_hours(restaurant_id: int) -> None:
    """Opening hours for the demo week.

    The vote window opens with the day's service, so a demo site without hours
    never shows the rating card.
    """
    existing = {
        hours.day_of_week
        for hours in RestaurantServiceHours.query.filter_by(restaurant_id=restaurant_id).all()
    }
    for day in DEFAULT_SERVICE_DAYS:
        if day not in existing:
            db.session.add(RestaurantServiceHours(
                restaurant_id=restaurant_id,
                day_of_week=day,
                open_time=_DEMO_OPEN_TIME,
                close_time=_DEMO_CLOSE_TIME,
            ))


# ──────────────────────────────────────────────────────────────────────
#  Menu categories
# ──────────────────────────────────────────────────────────────────────

_CATEGORY_TREE: list[dict[str, Any]] = [
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

    click.echo(f'  ✓ {len(result)} menu categories')
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
        click.echo(f'  ✓ Demo account created ({_DEMO_EMAIL})')
    else:
        user.password_hash = generate_password_hash(password)
        user.is_active = True
        user.mfa_enabled = False
        click.echo(f'  ✓ Demo password reset ({_DEMO_EMAIL})')
    user.notification_preferences = {
        **user.get_notification_preferences(), 'weekly_digest': True
    }
    return user


# ──────────────────────────────────────────────────────────────────────
#  Menus
# ──────────────────────────────────────────────────────────────────────

_DEMO_WEEKS = 5

# Dishes introduced late, so « servis pour la première fois » has something to
# report on the week the digest covers.
_NEW_DISHES = [
    (2, ('Curry de pois chiches', 'Végétarien', ['vegetarian', 'vegan', 'homemade'])),
    (1, ('Filet de colin à l’aneth', 'Poissons', ['pescetarian'])),
    (1, ('Salade de lentilles tièdes', 'Froides', ['vegetarian', 'vegan', 'seasonal'])),
]


def _menu_plan(site: dict) -> list[tuple[date, list]]:
    """Five weeks of weekday menus, oldest first.

    A site skips a weekday or two so the publication rate, the ranking and the
    sites to watch are not identical everywhere.
    """
    today = paris_today()
    monday = today - timedelta(days=today.weekday())
    plan = []
    for back in range(_DEMO_WEEKS - 1, -1, -1):
        week_start = monday - timedelta(weeks=back)
        for index, items in enumerate(_WEEK_MENUS):
            if back and index in site['skip_days']:
                continue
            day = week_start + timedelta(days=index)
            if day > today:
                continue
            extras = [dish for weeks_back, dish in _NEW_DISHES if weeks_back >= back and index == 0]
            plan.append((day, list(items) + extras))
    return plan


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
    plan: list[tuple[date, list]],
) -> tuple[int, int]:
    menu_count = 0
    item_count = 0

    for day_date, day_items in plan:
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
            # The eve at 17:00 Paris: a realistic lead time, so punctuality and
            # anticipation read like a site that works rather than a backfill.
            published_at=datetime.combine(day_date - timedelta(days=1), time(15, 0)),
        )
        db.session.add(menu)
        db.session.flush()

        for order, (name, cat_label, tag_ids) in enumerate(day_items):
            cat_id = categories.get(cat_label)
            if not cat_id:
                continue

            dish = get_or_create_dish(restaurant_id, {
                'name': name,
                'category_id': cat_id,
                'tag_ids': tag_ids,
            })
            if not dish:
                continue

            item = MenuItem(
                menu_id=menu.id,
                category_id=cat_id,
                dish_id=dish.id,
                order=order,
            )
            db.session.add(item)
            item_count += 1

        menu_count += 1

    click.echo(f'  ✓ {menu_count} menus created/updated ({item_count} dishes)')
    return menu_count, item_count


# ──────────────────────────────────────────────────────────────────────
#  Analytics history
# ──────────────────────────────────────────────────────────────────────

# Five weeks: the traffic alert compares a day to the four previous same
# weekdays, and the digest compares a week to the one before.
_ANALYTICS_DAYS = 35

# Menu traffic follows the service: a morning look-up, a lunch peak, a long tail.
_HOURLY_SHAPE = {
    7: 0.03, 8: 0.06, 9: 0.07, 10: 0.09, 11: 0.16, 12: 0.20,
    13: 0.13, 14: 0.06, 17: 0.05, 18: 0.06, 19: 0.05, 20: 0.04,
}


def _demo_random(day: date, salt: int) -> random.Random:
    """Same figures on every run, so a re-seed does not redraw the charts."""
    return random.Random(f'{day.isoformat()}:{salt}')


def _ensure_demo_director(password: str, organization_id: int) -> User:
    """The supervisor account, subscribed to the weekly email like the admin."""
    user = User.query.filter_by(email=_DIRECTOR_EMAIL).first()
    if not user:
        user = User(
            email=_DIRECTOR_EMAIL,
            username='direction',
            role='org_admin',
            is_active=True,
            mfa_enabled=False,
        )
        db.session.add(user)
        click.echo(f'  ✓ Supervisor created ({_DIRECTOR_EMAIL})')
    user.password_hash = generate_password_hash(password)
    user.is_active = True
    user.mfa_enabled = False
    user.organization_id = organization_id
    user.restaurant_id = None
    user.notification_preferences = {
        **user.get_notification_preferences(), 'weekly_digest': True
    }
    return user


def _seed_activity(restaurants: list[Restaurant], user_id: int) -> None:
    """An audit trail behind the published menus.

    Without it every demo site looks abandoned to the inactivity alert, which
    reads the last recorded action. Written row by row rather than through
    `AuditLog.log`, which has no reason to let a caller backdate an entry.
    """
    today = paris_today()
    AuditLog.query.filter(
        AuditLog.restaurant_id.in_([site.id for site in restaurants]),
        AuditLog.action == AuditLog.ACTION_MENU_PUBLISH,
    ).delete(synchronize_session=False)

    for restaurant in restaurants:
        for back in range(1, 4):
            day = today - timedelta(days=back)
            if day.weekday() >= 5:
                continue
            db.session.add(AuditLog(
                restaurant_id=restaurant.id,
                user_id=user_id,
                action=AuditLog.ACTION_MENU_PUBLISH,
                target_type='menu',
                details=json.dumps({'date': day.isoformat(), 'demo': True}),
                created_at=datetime.combine(day, time(15, 0)),
            ))


def _create_demo_analytics(restaurant: Restaurant, site: dict) -> tuple[int, int]:
    """Backfill traffic and votes so the dashboards show curves from day one."""
    today = paris_today()
    start = today - timedelta(days=_ANALYTICS_DAYS - 1)

    PageViewRollup.query.filter(PageViewRollup.restaurant_id == restaurant.id).delete()
    VisitorDailyUnique.query.filter(VisitorDailyUnique.restaurant_id == restaurant.id).delete()
    MenuVote.query.filter(MenuVote.restaurant_id == restaurant.id).delete()

    menus_by_date = {
        menu.date: menu
        for menu in Menu.query.filter_by(restaurant_id=restaurant.id, status='published').all()
    }
    # The same resolution the widget uses, so demo votes land on offerable dishes.
    choices_by_menu = {
        menu.id: [
            [dish['id'] for dish in group['dishes']]
            for group in vote_dish_groups(restaurant, menu)
        ]
        for menu in menus_by_date.values()
    }

    views = 0
    votes = 0
    for offset in range(_ANALYTICS_DAYS):
        day = start + timedelta(days=offset)
        if day.weekday() >= 5:
            continue

        rng = _demo_random(day, restaurant.id)
        daily_visitors = rng.randint(*site['visitors'])
        for hour, share in _HOURLY_SHAPE.items():
            count = round(daily_visitors * share * rng.uniform(0.85, 1.15))
            if count <= 0:
                continue
            db.session.add(PageViewRollup(
                restaurant_id=restaurant.id,
                date=day,
                hour=hour,
                page_kind='today',
                views=count,
            ))
            views += count
        db.session.add(VisitorDailyUnique(
            restaurant_id=restaurant.id,
            date=day,
            unique_visitors=round(daily_visitors * rng.uniform(0.6, 0.75)),
        ))

        menu = menus_by_date.get(day)
        groups = choices_by_menu.get(menu.id, []) if menu else []
        if menu is None or not groups:
            continue
        for index in range(rng.randint(20, 70)):
            db.session.add(MenuVote(
                organization_id=restaurant.organization_id,
                restaurant_id=restaurant.id,
                menu_id=menu.id,
                date=day,
                # A device votes once per organization and day, so demo ids
                # carry the site or two of them would collide.
                device_id=f'demo{restaurant.id}{day.isoformat()}{index:04d}'.replace('-', ''),
                rating=rng.choices([1, 2, 3], weights=site['ratings'])[0],
                dishes=[
                    db.session.get(DishCatalog, rng.choice(group)) for group in groups
                ],
            ))
            votes += 1

    return views, votes
