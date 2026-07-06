"""
Tests du catalogue de plats : CRUD, contrôle des rôles, isolation multi-restaurant.
"""
from conftest import auth_headers, get_token, make_category, make_restaurant, make_user


def _create_dish(client, token, name='poulet rôti', **extra):
    return client.post('/v1/catalog',
                       json={'name': name, **extra},
                       headers=auth_headers(token))


class TestCatalogCrud:
    def test_create_dish(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        res = _create_dish(client, token)
        assert res.status_code == 201
        dish = res.get_json()['dish']
        # Le nom est normalisé : première lettre en majuscule
        assert dish['name'] == 'Poulet rôti'

    def test_create_dish_requires_auth(self, client):
        res = client.post('/v1/catalog', json={'name': 'Poulet'})
        assert res.status_code == 401

    def test_create_dish_invalid_payload(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        res = client.post('/v1/catalog', json={}, headers=auth_headers(token))
        assert res.status_code == 400

    def test_list_dishes(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        _create_dish(client, token, name='Poulet rôti')
        _create_dish(client, token, name='Riz pilaf')
        res = client.get('/v1/catalog', headers=auth_headers(token))
        assert res.status_code == 200
        names = {d['name'] for d in res.get_json()['dishes']}
        assert names == {'Poulet rôti', 'Riz pilaf'}

    def test_get_dish(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        dish_id = _create_dish(client, token).get_json()['dish']['id']
        res = client.get(f'/v1/catalog/{dish_id}', headers=auth_headers(token))
        assert res.status_code == 200
        assert res.get_json()['dish']['id'] == dish_id

    def test_get_dish_not_found(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        res = client.get('/v1/catalog/9999', headers=auth_headers(token))
        assert res.status_code == 404

    def test_update_dish(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        dish_id = _create_dish(client, token).get_json()['dish']['id']
        res = client.put(f'/v1/catalog/{dish_id}',
                         json={'name': 'poulet basquaise'},
                         headers=auth_headers(token))
        assert res.status_code == 200
        assert res.get_json()['dish']['name'] == 'Poulet basquaise'

    def test_update_dish_invalid_payload(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        dish_id = _create_dish(client, token).get_json()['dish']['id']
        res = client.put(f'/v1/catalog/{dish_id}',
                         json={'name': ''},
                         headers=auth_headers(token))
        assert res.status_code == 400

    def test_delete_dish(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        dish_id = _create_dish(client, token).get_json()['dish']['id']
        res = client.delete(f'/v1/catalog/{dish_id}', headers=auth_headers(token))
        assert res.status_code == 200
        assert client.get(f'/v1/catalog/{dish_id}',
                          headers=auth_headers(token)).status_code == 404

    def test_delete_dish_used_in_menu_rejected(self, app, client):
        import datetime
        restaurant_id = make_restaurant(app)
        make_user(app)
        token = get_token(client)
        category_id = make_category(app, restaurant_id)
        client.post('/v1/menus',
                    json={'date': datetime.date.today().isoformat(),
                          'items': [{'category_id': category_id, 'name': 'Poulet rôti'}]},
                    headers=auth_headers(token))
        dishes = client.get('/v1/catalog', headers=auth_headers(token)).get_json()['dishes']
        assert len(dishes) == 1
        res = client.delete(f"/v1/catalog/{dishes[0]['id']}", headers=auth_headers(token))
        assert res.status_code == 409

    def test_menu_items_reuse_existing_dish(self, app, client):
        """Deux menus avec le même nom de plat réutilisent la même entrée du catalogue."""
        import datetime
        restaurant_id = make_restaurant(app)
        make_user(app)
        token = get_token(client)
        category_id = make_category(app, restaurant_id)
        today = datetime.date.today()
        for offset in (0, 1):
            client.post('/v1/menus',
                        json={'date': (today + datetime.timedelta(days=offset)).isoformat(),
                              'items': [{'category_id': category_id, 'name': 'Poulet rôti'}]},
                        headers=auth_headers(token))
        dishes = client.get('/v1/catalog', headers=auth_headers(token)).get_json()['dishes']
        assert len(dishes) == 1

    def test_dish_stats(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        dish_id = _create_dish(client, token).get_json()['dish']['id']
        res = client.get(f'/v1/catalog/{dish_id}/stats', headers=auth_headers(token))
        assert res.status_code == 200
        data = res.get_json()
        for key in ('week', 'month', 'semester', 'year', 'history'):
            assert key in data


class TestCatalogRoles:
    """Les routes d'écriture du catalogue exigent le rôle editor ou admin."""

    def test_reader_cannot_create_dish(self, app, client):
        make_restaurant(app)
        make_user(app, email='reader@mariam.app', role='reader')
        token = get_token(client, email='reader@mariam.app')
        res = _create_dish(client, token)
        assert res.status_code == 403

    def test_reader_cannot_delete_dish(self, app, client):
        make_restaurant(app)
        make_user(app)
        make_user(app, email='reader@mariam.app', role='reader')
        admin_token = get_token(client)
        dish_id = _create_dish(client, admin_token).get_json()['dish']['id']
        reader_token = get_token(client, email='reader@mariam.app')
        res = client.delete(f'/v1/catalog/{dish_id}', headers=auth_headers(reader_token))
        assert res.status_code == 403

    def test_reader_can_list_dishes(self, app, client):
        make_restaurant(app)
        make_user(app, email='reader@mariam.app', role='reader')
        token = get_token(client, email='reader@mariam.app')
        res = client.get('/v1/catalog', headers=auth_headers(token))
        assert res.status_code == 200


class TestCatalogTenantIsolation:
    """Chaque restaurant ne voit et ne modifie que son propre catalogue."""

    def _two_restaurants(self, app, client):
        rid_a = make_restaurant(app, name='RU A', code='RU_A')
        rid_b = make_restaurant(app, name='RU B', code='RU_B')
        make_user(app, email='a@mariam.app', restaurant_id=rid_a)
        make_user(app, email='b@mariam.app', restaurant_id=rid_b)
        return get_token(client, email='a@mariam.app'), get_token(client, email='b@mariam.app')

    def test_dish_not_visible_from_other_restaurant(self, app, client):
        token_a, token_b = self._two_restaurants(app, client)
        dish_id = _create_dish(client, token_a).get_json()['dish']['id']
        assert client.get(f'/v1/catalog/{dish_id}',
                          headers=auth_headers(token_b)).status_code == 404
        assert client.get('/v1/catalog',
                          headers=auth_headers(token_b)).get_json()['dishes'] == []

    def test_cannot_update_other_restaurant_dish(self, app, client):
        token_a, token_b = self._two_restaurants(app, client)
        dish_id = _create_dish(client, token_a).get_json()['dish']['id']
        res = client.put(f'/v1/catalog/{dish_id}',
                         json={'name': 'Piraté'},
                         headers=auth_headers(token_b))
        assert res.status_code == 404

    def test_cannot_delete_other_restaurant_dish(self, app, client):
        token_a, token_b = self._two_restaurants(app, client)
        dish_id = _create_dish(client, token_a).get_json()['dish']['id']
        res = client.delete(f'/v1/catalog/{dish_id}', headers=auth_headers(token_b))
        assert res.status_code == 404
