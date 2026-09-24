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


class TestUiPreferences:
    def test_defaults_when_never_set(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)

        res = client.get('/v1/users/me/ui-preferences', headers=auth_headers(token))

        assert res.status_code == 200
        assert res.get_json()['tour_done'] is False

    def test_an_update_is_kept_and_merged(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)

        res = client.put(
            '/v1/users/me/ui-preferences',
            json={'tour_done': True},
            headers=auth_headers(token),
        )

        assert res.status_code == 200
        body = res.get_json()
        assert body['tour_done'] is True
        assert body['tour_catalog_done'] is False

    def test_an_unknown_key_is_ignored(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)

        res = client.put(
            '/v1/users/me/ui-preferences',
            json={'is_admin': True},
            headers=auth_headers(token),
        )

        assert res.status_code == 200
        assert 'is_admin' not in res.get_json()

    def test_preferences_require_a_session(self, client):
        assert client.get('/v1/users/me/ui-preferences').status_code == 401


class TestLastFactorGuard:
    """One 2FA method must always remain active on an account."""

    def _token(self, app, user_id):
        """Mint a session directly: password login stops at the 2FA step."""
        from flask_jwt_extended import create_access_token
        with app.app_context():
            return create_access_token(identity=str(user_id))

    def _with_passkey(self, user_id, credential=b'cred-1'):
        from app.extensions import db
        from app.models.passkey import Passkey
        db.session.add(Passkey(
            user_id=user_id,
            credential_id=credential,
            public_key=b'key',
            device_name='Test device',
        ))
        db.session.commit()
        return Passkey.query.filter_by(credential_id=credential).first().id

    def test_totp_cannot_go_without_a_passkey(self, app, client):
        from app.extensions import db
        from app.models import User
        make_restaurant(app)
        uid = make_user(app)
        db.session.get(User, uid).mfa_enabled = True
        db.session.commit()

        res = client.delete('/v1/auth/mfa', headers=auth_headers(self._token(app, uid)))

        assert res.status_code == 409
        assert db.session.get(User, uid).mfa_enabled is True

    def test_the_last_passkey_cannot_go_without_totp(self, app, client):
        make_restaurant(app)
        uid = make_user(app)
        passkey_id = self._with_passkey(uid)

        res = client.delete(
            f'/v1/auth/passkey/{passkey_id}', headers=auth_headers(self._token(app, uid))
        )

        assert res.status_code == 409

    def test_a_passkey_goes_when_another_factor_remains(self, app, client):
        from app.extensions import db
        from app.models import User
        make_restaurant(app)
        uid = make_user(app)
        passkey_id = self._with_passkey(uid)
        db.session.get(User, uid).mfa_enabled = True
        db.session.commit()

        res = client.delete(
            f'/v1/auth/passkey/{passkey_id}', headers=auth_headers(self._token(app, uid))
        )

        assert res.status_code == 200
