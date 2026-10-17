"""Which organization serves a host."""
import pytest

from app.extensions import db
from app.models import Organization


def _org(slug='crous-test', is_active=True):
    db.session.add(Organization(name='Crous Test', slug=slug, is_active=is_active))
    db.session.commit()


@pytest.fixture(autouse=True)
def no_default_org(monkeypatch):
    monkeypatch.delenv('DEFAULT_ORG_SLUG', raising=False)
    monkeypatch.delenv('BASE_DOMAIN', raising=False)


@pytest.mark.parametrize('host', ['crous-test.mariam.app', 'Crous-Test.localhost'])
def test_a_subdomain_names_its_organization(client, host):
    _org()

    res = client.get(f'/v1/domains/{host}')

    assert res.get_json() == {
        'host': host.lower(),
        'organization': {'slug': 'crous-test', 'name': 'Crous Test'},
    }
    assert res.headers['Cache-Control'] == 'public, max-age=300'


def test_another_host_falls_back_to_the_default_organization(client, monkeypatch):
    _org()
    monkeypatch.setenv('DEFAULT_ORG_SLUG', 'crous-test')

    res = client.get('/v1/domains/menus.example.fr')

    assert res.get_json()['organization']['slug'] == 'crous-test'


def test_an_unknown_host_or_an_inactive_organization_is_not_found(client):
    _org(is_active=False)

    for host in ('crous-test.mariam.app', 'menus.example.fr'):
        res = client.get(f'/v1/domains/{host}')
        assert res.status_code == 404
        assert res.get_json()['code'] == 'domain_not_found'
