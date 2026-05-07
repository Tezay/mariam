"""
Tests de gestion des utilisateurs : création, rôles, désactivation.
Seul un admin peut gérer les autres utilisateurs.
"""
from conftest import make_restaurant, make_user, get_token, auth_headers, TEST_PASSWORD


class TestListUsers:
    def test_list_users_requires_auth(self, client):
        res = client.get('/v1/users')
        assert res.status_code == 401

    def test_list_users_requires_admin(self, app, client):
        make_restaurant(app)
        make_user(app, role='reader')
        token = get_token(client)
        res = client.get('/v1/users', headers=auth_headers(token))
        assert res.status_code == 403

    def test_list_users_as_admin(self, app, client):
        make_restaurant(app)
        make_user(app, role='admin')
        token = get_token(client)
        res = client.get('/v1/users', headers=auth_headers(token))
        assert res.status_code == 200
        users = res.get_json()['users']
        assert isinstance(users, list)
        assert len(users) >= 1


class TestInviteUser:
    def test_invite_creates_activation_link(self, app, client):
        make_restaurant(app)
        make_user(app, role='admin')
        token = get_token(client)
        res = client.post('/v1/users/invite',
                          json={'email': 'newuser@test.com', 'role': 'editor'},
                          headers=auth_headers(token))
        assert res.status_code in (200, 201)
        data = res.get_json()
        assert 'invitation' in data
        assert 'token' in data['invitation']

    def test_invite_requires_admin(self, app, client):
        make_restaurant(app)
        make_user(app, role='editor')
        token = get_token(client)
        res = client.post('/v1/users/invite',
                          json={'email': 'test@test.com', 'role': 'reader'},
                          headers=auth_headers(token))
        assert res.status_code == 403

    def test_invite_duplicate_email(self, app, client):
        make_restaurant(app)
        make_user(app, role='admin', email='admin@mariam.app')
        token = get_token(client)
        res = client.post('/v1/users/invite',
                          json={'email': 'admin@mariam.app', 'role': 'editor'},
                          headers=auth_headers(token))
        assert res.status_code in (400, 409)


class TestDeactivateUser:
    def test_deactivate_user(self, app, client):
        make_restaurant(app)
        make_user(app, role='admin', email='admin@mariam.app')
        editor_id = make_user(app, role='editor', email='editor@test.com')
        token = get_token(client)
        res = client.put(f'/v1/users/{editor_id}',
                           json={'is_active': False},
                           headers=auth_headers(token))
        assert res.status_code in (200, 204)

    def test_cannot_deactivate_self(self, app, client):
        make_restaurant(app)
        uid = make_user(app, role='admin')
        token = get_token(client)
        res = client.put(f'/v1/users/{uid}',
                           json={'is_active': False},
                           headers=auth_headers(token))
        assert res.status_code in (400, 403)


class TestRoleManagement:
    def test_change_user_role(self, app, client):
        make_restaurant(app)
        make_user(app, role='admin', email='admin@mariam.app')
        target_id = make_user(app, role='reader', email='reader@test.com')
        token = get_token(client)
        res = client.put(f'/v1/users/{target_id}',
                           json={'role': 'editor'},
                           headers=auth_headers(token))
        assert res.status_code in (200, 204)

    def test_invalid_role_silently_ignored(self, app, client):
        """Invalid roles are ignored (role unchanged), not rejected with 4xx."""
        from app.models import User
        from app.extensions import db
        make_restaurant(app)
        make_user(app, role='admin', email='admin@mariam.app')
        target_id = make_user(app, role='reader', email='reader@test.com')
        token = get_token(client)
        res = client.put(f'/v1/users/{target_id}',
                         json={'role': 'superuser'},
                         headers=auth_headers(token))
        assert res.status_code == 200
        # Role must remain unchanged
        user = db.session.get(User, target_id)
        assert user.role == 'reader'
