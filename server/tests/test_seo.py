"""
Server-side SEO tests: the injected public shell, host/path tenant resolution,
the per-host sitemap, and the passthrough for private/unknown requests.
"""
import pytest

from app.extensions import db
from app.models import DishCatalog, Menu, MenuItem, Organization, Restaurant
from app.services.seo import render_public_shell
from app.utils.time import paris_today
from conftest import make_category, make_restaurant

BASE_HTML = (
    '<!DOCTYPE html><html lang="fr"><head>'
    '<meta charset="UTF-8">'
    '<title>Mariam - Menu du Jour</title>'
    '<meta name="description" content="générique">'
    '</head><body><div id="root"></div></body></html>'
)


# ---------------------------------------------------------------------------
# render_public_shell — pure injection
# ---------------------------------------------------------------------------

class TestRenderShell:
    def test_replaces_placeholder_title_and_description(self):
        out = render_public_shell(
            BASE_HTML, title='Menu RU — Org', description='desc du jour',
            canonical='https://o.mariam.app/ru/menu', site_name='Org',
        )
        assert '<title>Menu RU — Org</title>' in out
        assert '<title>Mariam - Menu du Jour</title>' not in out
        assert out.count('<title>') == 1
        assert 'content="générique"' not in out
        assert 'content="desc du jour"' in out

    def test_injects_open_graph_and_canonical(self):
        out = render_public_shell(
            BASE_HTML, title='T', description='D',
            canonical='https://o.mariam.app/ru/menu', site_name='Org',
            image_url='https://cdn/logo.png',
        )
        assert '<link rel="canonical" href="https://o.mariam.app/ru/menu">' in out
        assert '<meta property="og:title" content="T">' in out
        assert '<meta property="og:image" content="https://cdn/logo.png">' in out
        assert '<meta name="twitter:card" content="summary_large_image">' in out

    def test_injects_jsonld_before_head_close(self):
        out = render_public_shell(
            BASE_HTML, title='T', description='D', canonical='https://x/', site_name='Org',
            jsonld={'@type': 'Restaurant', 'name': 'RU'},
        )
        assert '<script type="application/ld+json">' in out
        assert out.index('application/ld+json') < out.index('</head>')

    def test_escapes_dynamic_values(self):
        out = render_public_shell(
            BASE_HTML, title='<script>alert(1)</script>', description='"><b>x',
            canonical='https://x/', site_name='Org',
        )
        assert '<script>alert(1)</script>' not in out
        assert '&lt;script&gt;' in out

    def test_jsonld_cannot_break_out_of_script(self):
        out = render_public_shell(
            BASE_HTML, title='T', description='D', canonical='https://x/', site_name='Org',
            jsonld={'name': '</script><script>evil'},
        )
        # Only the closing tag we add is a literal </script>.
        assert out.count('</script>') == 1
        assert '<\\/script>' in out


# ---------------------------------------------------------------------------
# Route integration — host + path resolution
# ---------------------------------------------------------------------------

@pytest.fixture
def _stub_shell(monkeypatch):
    monkeypatch.setattr('app.routes.seo.get_base_shell', lambda: BASE_HTML)


def _host(slug):
    return {'Host': f'{slug}.localhost'}


def _org(slug='org-seo', name='Org SEO'):
    org = Organization(name=name, slug=slug)
    db.session.add(org)
    db.session.commit()
    return org.id


def _site(org_id, name, code, slug, is_active=True):
    rid = make_restaurant(None, name=name, code=code)
    r = Restaurant.query.get(rid)
    r.organization_id = org_id
    r.slug = slug
    r.is_active = is_active
    db.session.commit()
    return rid


class TestShellRoutes:
    def test_multisite_restaurant_shell(self, app, client, _stub_shell):
        org_id = _org()
        _site(org_id, 'RU Alpha', 'RU_A', 'alpha')
        _site(org_id, 'RU Beta', 'RU_B', 'beta')

        res = client.get('/alpha/menu', headers=_host('org-seo'))
        body = res.get_data(as_text=True)
        assert res.status_code == 200
        assert '<title>Menu RU Alpha — Org SEO</title>' in body
        assert '<link rel="canonical" href="https://org-seo.localhost/alpha/menu">' in body
        assert '"@type": "Restaurant"' in body

    def test_multisite_root_lists_org(self, app, client, _stub_shell):
        org_id = _org()
        _site(org_id, 'RU Alpha', 'RU_A', 'alpha')
        _site(org_id, 'RU Beta', 'RU_B', 'beta')

        body = client.get('/', headers=_host('org-seo')).get_data(as_text=True)
        assert '<title>Org SEO — Nos restaurants</title>' in body

    def test_monosite_root_features_single_site(self, app, client, _stub_shell):
        org_id = _org()
        _site(org_id, 'RU Solo', 'RU_S', 'solo')

        body = client.get('/', headers=_host('org-seo')).get_data(as_text=True)
        assert '<title>Menu RU Solo — Org SEO</title>' in body

    def test_jsonld_has_menu_when_published(self, app, client, _stub_shell):
        org_id = _org()
        rid = _site(org_id, 'RU Alpha', 'RU_A', 'alpha')
        _site(org_id, 'RU Beta', 'RU_B', 'beta')
        cat_id = make_category(None, rid, label='Plat principal')
        dish = DishCatalog(restaurant_id=rid, category_id=cat_id, name='Bœuf bourguignon')
        db.session.add(dish)
        menu = Menu(restaurant_id=rid, date=paris_today(), status='published')
        db.session.add(menu)
        db.session.flush()
        db.session.add(MenuItem(menu_id=menu.id, category_id=cat_id, dish_id=dish.id, order=0))
        db.session.commit()

        body = client.get('/alpha/menu', headers=_host('org-seo')).get_data(as_text=True)
        assert '"hasMenu"' in body
        assert 'Bœuf bourguignon' in body
        assert 'Plat principal' in body

    def test_private_path_passthrough(self, app, client, _stub_shell):
        org_id = _org()
        _site(org_id, 'RU Alpha', 'RU_A', 'alpha')
        res = client.get('/admin', headers=_host('org-seo'))
        assert res.get_data(as_text=True) == BASE_HTML

    def test_unknown_host_passthrough(self, app, client, _stub_shell):
        res = client.get('/whatever/menu', headers=_host('does-not-exist'))
        assert res.get_data(as_text=True) == BASE_HTML

    def test_unknown_slug_passthrough(self, app, client, _stub_shell):
        org_id = _org()
        _site(org_id, 'RU Alpha', 'RU_A', 'alpha')
        _site(org_id, 'RU Beta', 'RU_B', 'beta')
        res = client.get('/ghost/menu', headers=_host('org-seo'))
        assert res.get_data(as_text=True) == BASE_HTML


class TestSitemap:
    def test_lists_only_active_sites(self, app, client):
        org_id = _org()
        _site(org_id, 'RU Alpha', 'RU_A', 'alpha')
        _site(org_id, 'RU Beta', 'RU_B', 'beta')
        _site(org_id, 'RU Gone', 'RU_G', 'gone', is_active=False)

        res = client.get('/sitemap.xml', headers=_host('org-seo'))
        body = res.get_data(as_text=True)
        assert res.mimetype == 'application/xml'
        assert 'https://org-seo.localhost/alpha/menu' in body
        assert 'https://org-seo.localhost/beta/menu' in body
        assert 'gone' not in body

    def test_monosite_sitemap_uses_root_menu(self, app, client):
        org_id = _org()
        _site(org_id, 'RU Solo', 'RU_S', 'solo')
        body = client.get('/sitemap.xml', headers=_host('org-seo')).get_data(as_text=True)
        assert 'https://org-seo.localhost/menu' in body
        assert '/solo/menu' not in body

    def test_unknown_host_empty_sitemap(self, app, client):
        res = client.get('/sitemap.xml', headers=_host('nope'))
        body = res.get_data(as_text=True)
        assert res.status_code == 200
        assert '<urlset' in body
        assert '<loc>' not in body
