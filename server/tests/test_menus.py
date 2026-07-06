"""
Tests de gestion des menus : création, publication, brouillon.
"""
import datetime
import pytest
from conftest import make_restaurant, make_user, make_category, get_token, auth_headers


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
    def _create_menu(self, client, token, items=None):
        res = client.post('/v1/menus',
                          json={'date': _today_iso(), 'items': items or []},
                          headers=auth_headers(token))
        data = res.get_json()
        return data.get('menu', {}).get('id')

    def _create_menu_with_item(self, app, client, token, restaurant_id):
        """Un menu publiable doit contenir au moins un item (plat du catalogue)."""
        category_id = make_category(app, restaurant_id)
        return self._create_menu(client, token, items=[
            {'category_id': category_id, 'name': 'Plat test'},
        ])

    def test_publish_menu(self, app, client):
        restaurant_id = make_restaurant(app)
        make_user(app)
        token = get_token(client)
        menu_id = self._create_menu_with_item(app, client, token, restaurant_id)
        if not menu_id:
            pytest.skip('Menu ID non disponible dans la réponse')
        res = client.post(f'/v1/menus/{menu_id}/publish',
                          headers=auth_headers(token))
        assert res.status_code in (200, 204)

    def test_publish_empty_menu_rejected(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        menu_id = self._create_menu(client, token)
        if not menu_id:
            pytest.skip('Menu ID non disponible dans la réponse')
        res = client.post(f'/v1/menus/{menu_id}/publish',
                          headers=auth_headers(token))
        assert res.status_code == 400

    def test_unpublish_menu(self, app, client):
        restaurant_id = make_restaurant(app)
        make_user(app)
        token = get_token(client)
        menu_id = self._create_menu_with_item(app, client, token, restaurant_id)
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


class TestMenuTenantIsolation:
    """Un éditeur ne peut accéder qu'aux menus de son propre restaurant."""

    def _menu_for_restaurant_a(self, app, client):
        rid_a = make_restaurant(app, name='RU A', code='RU_A')
        rid_b = make_restaurant(app, name='RU B', code='RU_B')
        make_user(app, email='a@mariam.app', restaurant_id=rid_a)
        make_user(app, email='b@mariam.app', restaurant_id=rid_b)
        token_a = get_token(client, email='a@mariam.app')
        category_id = make_category(app, rid_a)
        res = client.post('/v1/menus',
                          json={'date': _today_iso(),
                                'items': [{'category_id': category_id, 'name': 'Plat A'}]},
                          headers=auth_headers(token_a))
        menu_id = res.get_json()['menu']['id']
        token_b = get_token(client, email='b@mariam.app')
        return menu_id, token_a, token_b

    def test_cannot_read_other_restaurant_menu(self, app, client):
        menu_id, _, token_b = self._menu_for_restaurant_a(app, client)
        res = client.get(f'/v1/menus/{menu_id}', headers=auth_headers(token_b))
        assert res.status_code == 404

    def test_cannot_update_other_restaurant_menu(self, app, client):
        menu_id, _, token_b = self._menu_for_restaurant_a(app, client)
        res = client.put(f'/v1/menus/{menu_id}',
                         json={'chef_note': 'piraté'},
                         headers=auth_headers(token_b))
        assert res.status_code == 404

    def test_cannot_publish_other_restaurant_menu(self, app, client):
        menu_id, _, token_b = self._menu_for_restaurant_a(app, client)
        res = client.post(f'/v1/menus/{menu_id}/publish', headers=auth_headers(token_b))
        assert res.status_code == 404

    def test_cannot_delete_other_restaurant_menu(self, app, client):
        menu_id, token_a, token_b = self._menu_for_restaurant_a(app, client)
        res = client.delete(f'/v1/menus/{menu_id}', headers=auth_headers(token_b))
        assert res.status_code == 404
        # Le propriétaire y accède toujours
        assert client.get(f'/v1/menus/{menu_id}',
                          headers=auth_headers(token_a)).status_code == 200

    def test_list_menus_scoped_to_own_restaurant(self, app, client):
        self._menu_for_restaurant_a(app, client)
        token_b = get_token(client, email='b@mariam.app')
        menus = client.get('/v1/menus', headers=auth_headers(token_b)).get_json()['menus']
        assert menus == []


class TestNotificationPayloads:
    """Le corps des notifications push est construit à partir du format
    d'items actuel (dish imbriqué, category_id)."""

    def _items(self):
        return [
            {'id': 1, 'category_id': 10, 'dish_id': 5,
             'dish': {'id': 5, 'name': 'Poulet rôti'}, 'order': 0, 'is_out_of_stock': False},
            {'id': 2, 'category_id': 10, 'dish_id': 6,
             'dish': {'id': 6, 'name': 'Riz pilaf'}, 'order': 1, 'is_out_of_stock': False},
            {'id': 3, 'category_id': 20, 'dish_id': 7,
             'dish': {'id': 7, 'name': 'Tarte aux pommes'}, 'order': 0, 'is_out_of_stock': False},
        ]

    def test_format_menu_body_one_item_per_category(self):
        from app.services.notification_service import _format_menu_body
        body = _format_menu_body(self._items())
        assert body == '• Poulet rôti\n• Tarte aux pommes'

    def test_format_menu_body_skips_out_of_stock(self):
        from app.services.notification_service import _format_menu_body
        items = self._items()
        items[0]['is_out_of_stock'] = True
        body = _format_menu_body(items)
        assert body == '• Riz pilaf\n• Tarte aux pommes'

    def test_format_menu_body_empty(self):
        from app.services.notification_service import _format_menu_body
        assert _format_menu_body([]) is None

    def test_today_payload(self):
        from app.services.notification_service import build_today_menu_payload
        payload = build_today_menu_payload(self._items())
        assert payload is not None
        assert 'Poulet rôti' in payload['body']


class TestMenuAudit:
    """Les saves de brouillon (auto-save onboarding) ne sont pas audités ;
    la création et les modifications d'un menu publié le sont."""

    def _save(self, client, token, items):
        return client.post('/v1/menus',
                           json={'date': _today_iso(), 'items': items},
                           headers=auth_headers(token))

    def test_draft_updates_not_audited(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        self._save(client, token, [])   # création : menu_create
        self._save(client, token, [])   # update brouillon : pas de log
        self._save(client, token, [])
        from app.models import AuditLog
        assert AuditLog.query.filter_by(action='menu_create').count() == 1
        assert AuditLog.query.filter_by(action='menu_update').count() == 0

    def test_published_update_audited(self, app, client):
        restaurant_id = make_restaurant(app)
        make_user(app)
        token = get_token(client)
        category_id = make_category(app, restaurant_id)
        res = self._save(client, token, [{'category_id': category_id, 'name': 'Plat test'}])
        menu_id = res.get_json()['menu']['id']
        client.post(f'/v1/menus/{menu_id}/publish', headers=auth_headers(token))
        # Modification d'un menu publié → menu_update
        self._save(client, token, [{'category_id': category_id, 'name': 'Plat remplaçant'}])
        from app.models import AuditLog
        assert AuditLog.query.filter_by(action='menu_update').count() == 1
