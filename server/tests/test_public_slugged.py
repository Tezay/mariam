"""
Tests for the slugged public API (/v1/public/<slug>/...).

The tenant is resolved from the request Host (subdomain = organization) and the
restaurant slug in the path. Only published, active content is exposed.
"""
import datetime

from app.extensions import db
from app.models import Menu, Organization, Restaurant
from conftest import make_restaurant

HOST = {'Host': 'crous-test.mariam.app'}


def _org_with_restaurant(org_slug='crous-test', r_slug='efrei'):
    org = Organization(name='Org', slug=org_slug)
    db.session.add(org)
    db.session.commit()
    rid = make_restaurant(None, name='EFREI', code='EFREI')
    restaurant = Restaurant.query.get(rid)
    restaurant.organization_id = org.id
    restaurant.slug = r_slug
    db.session.commit()
    return org.id, rid


class TestPublicOrgBootstrap:
    def test_org_lists_sites(self, app, client):
        _org_with_restaurant()
        res = client.get('/v1/public/org', headers=HOST)
        assert res.status_code == 200
        data = res.get_json()
        assert data['organization']['slug'] == 'crous-test'
        assert any(s['slug'] == 'efrei' for s in data['sites'])

    def test_unknown_org_returns_404(self, app, client):
        _org_with_restaurant()
        res = client.get('/v1/public/org', headers={'Host': 'nope.mariam.app'})
        assert res.status_code == 404


class TestPublicMenuResolution:
    def test_today_resolves_by_host_and_slug(self, app, client):
        _org_with_restaurant()
        res = client.get('/v1/public/efrei/today', headers=HOST)
        assert res.status_code == 200
        assert res.get_json()['restaurant']['code'] == 'EFREI'

    def test_unknown_slug_returns_404(self, app, client):
        _org_with_restaurant()
        res = client.get('/v1/public/nope/today', headers=HOST)
        assert res.status_code == 404

    def test_cross_org_slug_returns_404(self, app, client):
        # 'efrei' exists under crous-test, but is requested via another org's host.
        _org_with_restaurant()
        other = Organization(name='Other', slug='other-org')
        db.session.add(other)
        db.session.commit()
        res = client.get('/v1/public/efrei/today', headers={'Host': 'other-org.mariam.app'})
        assert res.status_code == 404

    def test_draft_menu_not_exposed(self, app, client):
        _, rid = _org_with_restaurant()
        db.session.add(Menu(restaurant_id=rid, date=datetime.date.today(), status='draft'))
        db.session.commit()
        res = client.get('/v1/public/efrei/today', headers=HOST)
        assert res.status_code == 200
        assert res.get_json()['menu'] is None


class TestPublicOtherEndpoints:
    def test_events_and_closures_and_restaurant(self, app, client):
        _org_with_restaurant()
        assert client.get('/v1/public/efrei/events', headers=HOST).status_code == 200
        assert client.get('/v1/public/efrei/closures', headers=HOST).status_code == 200
        assert client.get('/v1/public/efrei/week', headers=HOST).status_code == 200
        res = client.get('/v1/public/efrei/restaurant', headers=HOST)
        assert res.status_code == 200
        assert res.get_json()['restaurant']['code'] == 'EFREI'
