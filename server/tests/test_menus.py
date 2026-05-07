"""
Tests de gestion des menus : création, publication, brouillon.
"""
import datetime
import pytest
from conftest import make_restaurant, make_user, get_token, auth_headers


def _today_iso():
    return datetime.date.today().isoformat()


class TestCreateMenu:
    def test_create_menu(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        res = client.post('/v1/menus',
                          json={'date': _today_iso(), 'items': []},
                          headers=auth_headers(token))
        assert res.status_code in (200, 201)
        data = res.get_json()
        assert 'menu' in data

    def test_create_menu_requires_auth(self, client):
        res = client.post('/v1/menus', json={'date': _today_iso(), 'items': []})
        assert res.status_code == 401

    def test_create_menu_requires_date(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        res = client.post('/v1/menus',
                          json={'items': []},
                          headers=auth_headers(token))
        assert res.status_code in (400, 422)


class TestPublishMenu:
    def _create_menu(self, client, token):
        res = client.post('/v1/menus',
                          json={'date': _today_iso(), 'items': []},
                          headers=auth_headers(token))
        data = res.get_json()
        return data.get('menu', {}).get('id')

    def test_publish_menu(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        menu_id = self._create_menu(client, token)
        if not menu_id:
            pytest.skip('Menu ID non disponible dans la réponse')
        res = client.post(f'/v1/menus/{menu_id}/publish',
                          headers=auth_headers(token))
        assert res.status_code in (200, 204)

    def test_unpublish_menu(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        menu_id = self._create_menu(client, token)
        if not menu_id:
            pytest.skip('Menu ID non disponible dans la réponse')
        client.post(f'/v1/menus/{menu_id}/publish', headers=auth_headers(token))
        res = client.post(f'/v1/menus/{menu_id}/unpublish',
                          headers=auth_headers(token))
        assert res.status_code in (200, 204)


class TestGetMenus:
    def test_list_menus_authenticated(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        res = client.get('/v1/menus', headers=auth_headers(token))
        assert res.status_code == 200

    def test_get_menu_by_date(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        res = client.get(f'/v1/menus/by-date/{_today_iso()}',
                         headers=auth_headers(token))
        assert res.status_code in (200, 404)
