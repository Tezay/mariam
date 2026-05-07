"""
Tests CRUD des catégories de menu : création, lecture, mise à jour,
suppression, ordre, hiérarchie parent/enfant, protection.
"""
import pytest
from conftest import make_restaurant, make_user, get_token, auth_headers


class TestListCategories:
    def test_list_requires_auth(self, client):
        res = client.get('/v1/settings/categories')
        assert res.status_code == 401

    def test_list_returns_categories(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        res = client.get('/v1/settings/categories', headers=auth_headers(token))
        assert res.status_code == 200
        assert isinstance(res.get_json()['categories'], list)


class TestCreateCategory:
    def test_create_category(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        res = client.post('/v1/settings/categories',
                          json={'label': 'Soupes', 'order': 5},
                          headers=auth_headers(token))
        assert res.status_code == 201
        data = res.get_json()['category']
        assert data['label'] == 'Soupes'
        assert 'id' in data

    def test_create_subcategory(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        parent_res = client.post('/v1/settings/categories',
                                 json={'label': 'Plat', 'order': 1},
                                 headers=auth_headers(token))
        parent_id = parent_res.get_json()['category']['id']
        res = client.post('/v1/settings/categories',
                          json={'label': 'Viande', 'order': 1, 'parent_id': parent_id},
                          headers=auth_headers(token))
        assert res.status_code == 201
        assert res.get_json()['category']['parent_id'] == parent_id

    def test_create_requires_label(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        res = client.post('/v1/settings/categories',
                          json={'order': 1},
                          headers=auth_headers(token))
        assert res.status_code in (400, 422)

    def test_create_requires_admin(self, app, client):
        make_restaurant(app)
        make_user(app, role='reader')
        token = get_token(client)
        res = client.post('/v1/settings/categories',
                          json={'label': 'Test', 'order': 1},
                          headers=auth_headers(token))
        assert res.status_code == 403


class TestUpdateCategory:
    def test_update_label(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        create_res = client.post('/v1/settings/categories',
                                 json={'label': 'Original', 'order': 1},
                                 headers=auth_headers(token))
        cat_id = create_res.get_json()['category']['id']
        res = client.put(f'/v1/settings/categories/{cat_id}',
                         json={'label': 'Modifié'},
                         headers=auth_headers(token))
        assert res.status_code == 200
        assert res.get_json()['category']['label'] == 'Modifié'

    def test_update_nonexistent(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        res = client.put('/v1/settings/categories/99999',
                         json={'label': 'Test'},
                         headers=auth_headers(token))
        assert res.status_code == 404


class TestDeleteCategory:
    def test_delete_category(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        create_res = client.post('/v1/settings/categories',
                                 json={'label': 'À supprimer', 'order': 9},
                                 headers=auth_headers(token))
        cat_id = create_res.get_json()['category']['id']
        res = client.delete(f'/v1/settings/categories/{cat_id}',
                            headers=auth_headers(token))
        assert res.status_code in (200, 204)

    def test_delete_protected_category_forbidden(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)

        list_res = client.get('/v1/settings/categories', headers=auth_headers(token))
        categories = list_res.get_json()['categories']
        protected = next((c for c in categories if c.get('is_protected')), None)
        if not protected:
            pytest.skip('Aucune catégorie protégée trouvée')

        res = client.delete(f'/v1/settings/categories/{protected["id"]}',
                            headers=auth_headers(token))
        assert res.status_code == 403
