"""What an anonymous caller reads under /v1/orgs: published, active content only."""
from datetime import timedelta

from app.extensions import db
from app.models import (
    DishCatalog,
    Event,
    ExceptionalClosure,
    Menu,
    MenuCategory,
    MenuItem,
    Organization,
    Restaurant,
)
from app.services.menu_window import DAYS_AHEAD, DAYS_BACK
from app.utils.time import paris_today
from conftest import make_category, make_restaurant

SITE = '/v1/orgs/crous-test/sites/efrei'


def _org(slug='crous-test', is_active=True):
    org = Organization(name='Crous Test', slug=slug, is_active=is_active)
    db.session.add(org)
    db.session.commit()
    return org


def _site(org, slug='efrei', is_active=True):
    site = db.session.get(Restaurant, make_restaurant(None, name=slug.upper(), code=slug.upper()))
    site.organization_id = org.id
    site.slug = slug
    site.is_active = is_active
    db.session.commit()
    return site


def _menu(site, day, status='published'):
    menu = Menu(restaurant_id=site.id, date=day, status=status)
    db.session.add(menu)
    db.session.commit()
    return menu


class TestOrganization:
    def test_an_organization_lists_its_active_sites(self, client):
        org = _org()
        _site(org)
        _site(org, 'closed', is_active=False)

        assert client.get('/v1/orgs/crous-test').get_json() == {
            'slug': 'crous-test',
            'name': 'Crous Test',
        }
        sites = client.get('/v1/orgs/crous-test/sites').get_json()['items']
        assert [site['slug'] for site in sites] == ['efrei']

    def test_an_inactive_organization_is_not_found(self, client):
        _site(_org(is_active=False))

        res = client.get('/v1/orgs/crous-test/sites')

        assert res.status_code == 404
        assert res.get_json()['code'] == 'org_not_found'


class TestSite:
    def test_a_site_shows_no_internal_field(self, client):
        _site(_org())

        site = client.get(SITE).get_json()

        assert not {'id', 'code', 'is_active', 'config'} & set(site)
        assert not {'menu_days_ahead', 'menu_days_back', 'vote_category_ids'} & set(site)
        today = paris_today()
        assert site['menu_window'] == {
            'from': (today - timedelta(days=DAYS_BACK)).isoformat(),
            'to': (today + timedelta(days=DAYS_AHEAD)).isoformat(),
        }

    def test_a_site_is_reached_only_through_its_own_organization(self, client):
        _site(_org())
        _org('other-org')

        res = client.get('/v1/orgs/other-org/sites/efrei')

        assert res.status_code == 404
        assert res.get_json()['code'] == 'site_not_found'

    def test_an_inactive_site_is_not_found(self, client):
        _site(_org(), is_active=False)

        assert client.get(SITE).status_code == 404


class TestMenus:
    def test_only_published_menus_inside_the_window_are_listed(self, client):
        site = _site(_org())
        today = paris_today()
        for days, status in ((-31, 'published'), (-30, 'published'), (0, 'published'),
                             (1, 'draft'), (DAYS_AHEAD + 1, 'published')):
            _menu(site, today + timedelta(days=days), status)
        start, end = today - timedelta(days=40), today + timedelta(days=10)

        menus = client.get(f'{SITE}/menus?from={start}&to={end}').get_json()['items']

        assert [menu['date'] for menu in menus] == [
            (today - timedelta(days=30)).isoformat(),
            today.isoformat(),
        ]

    def test_the_list_starts_today_by_default(self, client):
        site = _site(_org())
        today = paris_today()
        for days in (-1, 0, DAYS_AHEAD):
            _menu(site, today + timedelta(days=days))

        menus = client.get(f'{SITE}/menus').get_json()['items']

        assert [menu['date'] for menu in menus] == [
            today.isoformat(),
            (today + timedelta(days=DAYS_AHEAD)).isoformat(),
        ]

    def test_a_menu_shows_its_categories_and_subcategories_without_internal_fields(self, client):
        site = _site(_org())
        menu = _menu(site, paris_today())
        parent = make_category(None, site.id, label='Plats', order=0)
        child = MenuCategory(restaurant_id=site.id, parent_id=parent, label='Viandes', order=0)
        db.session.add(child)
        db.session.commit()
        dish = DishCatalog(restaurant_id=site.id, category_id=child.id, name='Rôti')
        db.session.add(dish)
        db.session.commit()
        db.session.add(MenuItem(menu_id=menu.id, category_id=child.id, dish_id=dish.id, order=0))
        db.session.commit()

        body = client.get(f'{SITE}/menus/{paris_today()}').get_json()

        assert set(body) == {'date', 'chef_note', 'categories', 'substitutions'}
        [shown] = body['categories']
        assert 'is_protected' not in shown
        [sub] = shown['subcategories']
        assert set(sub['items'][0]['dish']) == {
            'id', 'name', 'image_url', 'tags', 'certifications',
        }

    def test_the_window_is_the_sites_own(self, client):
        site = _site(_org())
        site.menu_days_ahead, site.menu_days_back = 0, 0
        db.session.commit()
        today = paris_today()
        for days in (-1, 0, 1):
            _menu(site, today + timedelta(days=days))
        start, end = today - timedelta(days=5), today + timedelta(days=5)

        menus = client.get(f'{SITE}/menus?from={start}&to={end}').get_json()['items']

        assert [menu['date'] for menu in menus] == [today.isoformat()]
        assert client.get(f'{SITE}/menus/{today + timedelta(days=1)}').status_code == 404
        assert client.get(SITE).get_json()['menu_window'] == {
            'from': today.isoformat(), 'to': today.isoformat(),
        }

    def test_a_draft_or_a_far_day_is_not_found(self, client):
        site = _site(_org())
        today = paris_today()
        _menu(site, today, 'draft')
        far = _menu(site, today + timedelta(days=DAYS_AHEAD + 1))

        for day in (today, far.date):
            res = client.get(f'{SITE}/menus/{day}')
            assert res.status_code == 404
            assert res.get_json()['code'] == 'menu_not_found'
        assert client.get(f'{SITE}/menus/tomorrow').status_code == 404

    def test_an_inverted_or_too_long_range_is_refused(self, client):
        _site(_org())
        today = paris_today()

        inverted = client.get(f'{SITE}/menus?from={today}&to={today - timedelta(days=1)}')
        too_long = client.get(f'{SITE}/menus?from={today}&to={today + timedelta(days=62)}')

        assert inverted.status_code == too_long.status_code == 422
        assert too_long.get_json()['errors'] == [
            {'parameter': 'to', 'detail': '62 jours au plus.'}
        ]


class TestEventsAndClosures:
    def test_news_items_are_published_and_for_the_screen(self, client):
        site = _site(_org())
        today = paris_today()
        for days, status, visibility in ((-1, 'published', 'all'), (0, 'published', 'tv'),
                                         (1, 'published', 'all'), (1, 'draft', 'all')):
            db.session.add(Event(
                restaurant_id=site.id, title=f'{days} {status} {visibility}',
                event_date=today + timedelta(days=days), status=status, visibility=visibility,
            ))
        db.session.commit()

        items = client.get(f'{SITE}/news?visibility=mobile&sort=date').get_json()['items']

        assert [item['title'] for item in items] == ['-1 published all', '1 published all']
        assert set(items[0]) == {
            'id', 'title', 'summary', 'description', 'color', 'date', 'pinned', 'published_at',
            'images',
        }

    def test_closures_under_way_and_to_come(self, client):
        site = _site(_org())
        today = paris_today()
        for start, end in ((-5, -1), (-1, 1), (3, 4)):
            db.session.add(ExceptionalClosure(
                restaurant_id=site.id,
                start_date=today + timedelta(days=start),
                end_date=today + timedelta(days=end),
            ))
        db.session.commit()

        closures = client.get(f'{SITE}/closures').get_json()['items']

        assert [closure['start_date'] for closure in closures] == [
            (today - timedelta(days=1)).isoformat(),
            (today + timedelta(days=3)).isoformat(),
        ]
        assert set(closures[0]) == {'id', 'start_date', 'end_date', 'reason', 'description'}


class TestHttpCaching:
    def test_a_known_etag_answers_304(self, client):
        _site(_org())
        first = client.get('/v1/orgs/crous-test/sites')

        again = client.get('/v1/orgs/crous-test/sites', headers={'If-None-Match': first.headers['ETag']})

        assert first.headers['Cache-Control'] == 'no-cache'
        assert again.status_code == 304
        assert again.headers['ETag'] == first.headers['ETag']
        assert again.data == b''


class TestCrossOrigin:
    FOREIGN = {'Origin': 'https://intranet.example.edu'}

    def test_any_origin_may_read(self, client):
        _site(_org())

        res = client.get(SITE, headers=self.FOREIGN)

        assert res.headers['Access-Control-Allow-Origin'] == '*'

    def test_another_origin_may_neither_vote_nor_reach_a_session_route(self, client):
        _site(_org())

        preflight = client.options(
            f'{SITE}/menus/{paris_today()}/vote',
            headers={**self.FOREIGN, 'Access-Control-Request-Method': 'PUT'},
        )
        session = client.get('/v1/user', headers=self.FOREIGN)

        assert 'Access-Control-Allow-Origin' not in preflight.headers
        assert 'Access-Control-Allow-Origin' not in session.headers
