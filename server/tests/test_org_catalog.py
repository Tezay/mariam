"""Organization catalogue: the dishes every site serves, pooled by name."""
import datetime

from app.extensions import db
from app.models import (
    DishCatalog,
    Menu,
    MenuCategory,
    MenuItem,
    MenuVote,
    Organization,
    Restaurant,
    User,
)
from app.utils.time import paris_today
from conftest import auth_headers, get_token, make_restaurant, make_user


def _org(slug='cat-org'):
    org = Organization(name=slug, slug=slug)
    db.session.add(org)
    db.session.commit()
    return org.id


def _site(org_id, code):
    rid = make_restaurant(None, name=code, code=code)
    site = Restaurant.query.get(rid)
    site.organization_id = org_id
    db.session.commit()
    return rid


def _category(rid, label='Plat'):
    category = MenuCategory(restaurant_id=rid, label=label, order=0)
    db.session.add(category)
    db.session.commit()
    return category.id


def _dish(rid, name, image_url=None):
    dish = DishCatalog(restaurant_id=rid, name=name, image_url=image_url)
    db.session.add(dish)
    db.session.commit()
    return dish


def _serve(rid, category_id, dish, day):
    menu = Menu(restaurant_id=rid, date=day, status='published')
    db.session.add(menu)
    db.session.commit()
    db.session.add(MenuItem(menu_id=menu.id, category_id=category_id, dish_id=dish.id, order=0))
    db.session.commit()
    return menu


def _vote(org_id, rid, menu, dish, rating, device):
    vote = MenuVote(
        organization_id=org_id,
        restaurant_id=rid,
        menu_id=menu.id,
        date=menu.date,
        device_id=device,
        rating=rating,
        dishes=[dish],
    )
    db.session.add(vote)
    db.session.commit()


def _director(rid, org_id, email='dir@mariam.app'):
    uid = make_user(None, email=email, role='org_admin', restaurant_id=rid)
    User.query.get(uid).organization_id = org_id
    db.session.commit()
    return uid


def _catalog(client, token, query=''):
    res = client.get(f'/v1/org/catalog?{query}', headers=auth_headers(token))
    assert res.status_code == 200, res.get_json()
    return res.get_json()


class TestPooling:
    def test_spelling_variants_collapse_into_one_entry(self, app, client):
        org = _org('cat1')
        first = _site(org, 'CAT1A')
        second = _site(org, 'CAT1B')
        _dish(first, 'Poulet basquaise')
        _dish(second, '  poulet   BASQUAISE ')
        _director(first, org)
        token = get_token(client, email='dir@mariam.app')

        dishes = _catalog(client, token)['dishes']

        assert len(dishes) == 1
        assert dishes[0]['site_count'] == 2
        assert dishes[0]['display_name'] in ('Poulet basquaise', '  poulet   BASQUAISE ')

    def test_photo_coverage_counts_sites_not_dishes(self, app, client):
        org = _org('cat2')
        first = _site(org, 'CAT2A')
        second = _site(org, 'CAT2B')
        _dish(first, 'Ratatouille', image_url='https://example.test/r.jpg')
        _dish(second, 'Ratatouille')
        _director(first, org)
        token = get_token(client, email='dir@mariam.app')

        row = _catalog(client, token)['dishes'][0]

        assert (row['photo_count'], row['site_count']) == (1, 2)
        assert row['image_url'] == 'https://example.test/r.jpg'


class TestUsage:
    def test_the_default_window_covers_the_whole_history(self, app, client):
        org = _org('cat3')
        rid = _site(org, 'CAT3')
        category = _category(rid)
        dish = _dish(rid, 'Gratin')
        _serve(rid, category, dish, paris_today() - datetime.timedelta(days=5))
        _serve(rid, category, dish, paris_today() - datetime.timedelta(days=200))
        _director(rid, org)
        token = get_token(client, email='dir@mariam.app')

        assert _catalog(client, token)['dishes'][0]['usage_count'] == 2
        assert _catalog(client, token, 'period=90d')['dishes'][0]['usage_count'] == 1


class TestSatisfaction:
    def test_a_score_needs_enough_votes(self, app, client):
        org = _org('cat4')
        rid = _site(org, 'CAT4')
        category = _category(rid)
        dish = _dish(rid, 'Lasagnes')
        menu = _serve(rid, category, dish, paris_today())
        for index in range(4):
            _vote(org, rid, menu, dish, 3, f'device-{index}')
        _director(rid, org)
        token = get_token(client, email='dir@mariam.app')

        row = _catalog(client, token)['dishes'][0]
        assert (row['votes'], row['score']) == (4, None)

        _vote(org, rid, menu, dish, 3, 'device-4')
        assert _catalog(client, token)['dishes'][0]['score'] == 3.0


class TestListing:
    def test_search_matches_a_normalised_substring(self, app, client):
        org = _org('cat5')
        rid = _site(org, 'CAT5')
        _dish(rid, 'Poulet rôti')
        _dish(rid, 'Salade verte')
        _director(rid, org)
        token = get_token(client, email='dir@mariam.app')

        dishes = _catalog(client, token, 'q=POULET')['dishes']

        assert [row['display_name'] for row in dishes] == ['Poulet rôti']

    def test_pagination_reports_the_full_total(self, app, client):
        org = _org('cat6')
        rid = _site(org, 'CAT6')
        for index in range(5):
            _dish(rid, f'Plat {index}')
        _director(rid, org)
        token = get_token(client, email='dir@mariam.app')

        payload = _catalog(client, token, 'sort=name&page=1&per_page=2')

        assert (payload['total'], len(payload['dishes']), payload['has_more']) == (5, 2, True)
        assert [row['display_name'] for row in payload['dishes']] == ['Plat 0', 'Plat 1']


class TestIsolation:
    def test_another_organization_is_never_pooled(self, app, client):
        mine = _org('cat7')
        theirs = _org('cat8')
        rid = _site(mine, 'CAT7')
        _dish(rid, 'Poulet basquaise')
        _dish(_site(theirs, 'CAT8'), 'Poulet basquaise')
        _director(rid, mine)
        token = get_token(client, email='dir@mariam.app')

        dishes = _catalog(client, token)['dishes']

        assert len(dishes) == 1
        assert dishes[0]['site_count'] == 1


class TestDishGroup:
    def test_the_group_aggregates_every_site(self, app, client):
        org = _org('cat10')
        first = _site(org, 'CAT10A')
        second = _site(org, 'CAT10B')
        category = _category(first)
        here = _dish(first, 'Chili', image_url='https://example.test/c.jpg')
        there = _dish(second, 'chili')
        menu = _serve(first, category, here, paris_today())
        for index in range(5):
            _vote(org, first, menu, here, 3, f'group-{index}')
        _director(first, org)
        token = get_token(client, email='dir@mariam.app')

        res = client.get('/v1/org/catalog/group?name=chili', headers=auth_headers(token))

        assert res.status_code == 200
        group = res.get_json()
        assert (group['site_count'], group['photo_count']) == (2, 1)
        assert (group['votes'], group['score']) == (5, 3.0)
        assert {site['site_name'] for site in group['sites']} == {'CAT10A', 'CAT10B'}
        rated = next(s for s in group['sites'] if s['dish_id'] == here.id)
        unrated = next(s for s in group['sites'] if s['dish_id'] == there.id)
        assert (rated['votes'], rated['usage_count']) == (5, 1)
        assert (unrated['votes'], unrated['score']) == (0, None)

    def test_an_unknown_name_is_a_404(self, app, client):
        org = _org('cat11')
        rid = _site(org, 'CAT11')
        _director(rid, org)
        token = get_token(client, email='dir@mariam.app')

        res = client.get('/v1/org/catalog/group?name=inconnu', headers=auth_headers(token))

        assert res.status_code == 404
