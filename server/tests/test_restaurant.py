"""
Tests de la configuration restaurant : accès refusé sans JWT, CRUD config.
"""
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
