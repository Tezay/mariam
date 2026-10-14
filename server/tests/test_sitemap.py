"""The per-host sitemap: tenant resolution from the host, active sites only."""
from app.extensions import db
from app.models import Organization, Restaurant
from conftest import make_restaurant


def _host(slug):
    return {'Host': f'{slug}.localhost'}


def _org(slug='org-seo', name='Org SEO'):
    org = Organization(name=name, slug=slug)
    db.session.add(org)
    db.session.commit()
    return org.id


def _site(org_id, name, code, slug, is_active=True):
    rid = make_restaurant(None, name=name, code=code)
    r = db.session.get(Restaurant, rid)
    r.organization_id = org_id
    r.slug = slug
    r.is_active = is_active
    db.session.commit()
    return rid


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
