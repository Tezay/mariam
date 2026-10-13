"""
Tests de la configuration restaurant : accès refusé sans JWT, CRUD config.
"""
import pytest

from app.extensions import db
from app.models import Restaurant
from conftest import make_restaurant, make_user, get_token, auth_headers


class TestRestaurantAccess:
    def test_get_settings_requires_auth(self, client):
        res = client.get('/v1/settings')
        assert res.status_code == 401

    def test_get_restaurant_info(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        res = client.get('/v1/settings', headers=auth_headers(token))
        assert res.status_code == 200
        data = res.get_json()['restaurant']
        assert data['name'] == 'RU Test'
        assert data['code'] == 'RU_TEST'

    def test_get_restaurant_config(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        res = client.get('/v1/settings', headers=auth_headers(token))
        assert res.status_code == 200
        data = res.get_json()['restaurant']
        assert 'menu_categories' in data['config']
        assert 'dietary_tags' in data['config']
        # Resolved here and not in get_config(): it costs a query the public
        # pages would pay on every menu view.
        assert 'vote_category_ids' in data['config']


class TestRestaurantUpdate:
    def test_update_restaurant_name(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        res = client.put('/v1/settings',
                         json={'name': 'Nouveau Nom'},
                         headers=auth_headers(token))
        assert res.status_code in (200, 204)

    def test_update_restaurant_requires_admin(self, app, client):
        make_restaurant(app)
        make_user(app, role='reader')
        token = get_token(client)
        res = client.put('/v1/settings',
                         json={'name': 'Test'},
                         headers=auth_headers(token))
        assert res.status_code == 403


class TestSiteName:
    def _rename(self, app, client, name):
        rid = make_restaurant(app)
        make_user(app)
        res = client.put(
            '/v1/settings', json={'name': name}, headers=auth_headers(get_token(client))
        )
        return res, db.session.get(Restaurant, rid).name

    @pytest.mark.parametrize('name', [
        "Resto U' Créteil", 'RU n°2 – bât. B', 'R.U. Nord', 'Crous & Go (Saclay)', 'x' * 50,
    ])
    def test_an_ordinary_name_is_kept(self, app, client, name):
        res, stored = self._rename(app, client, name)

        assert res.status_code == 200
        assert stored == name

    def test_stray_whitespace_is_collapsed(self, app, client):
        res, stored = self._rename(app, client, '  RU \n  Nord ')

        assert res.status_code == 200
        assert stored == 'RU Nord'

    @pytest.mark.parametrize('name', [
        '', '   ', 'x' * 51, 'RU https://exemple.com', 'exemple.com', 'www.exemple.com',
        'contact@exemple', 'RU Nord/Sud', 'RU Nord\\Sud', 'RU : Nord', 'St.Denis', 'RU\x00Nord',
    ])
    def test_a_name_empty_too_long_or_carrying_an_address_is_refused(self, app, client, name):
        res, stored = self._rename(app, client, name)

        assert res.status_code == 422
        assert stored == 'RU Test'
