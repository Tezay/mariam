"""The signed-in account: its interface state, and the second factor it always keeps."""
from conftest import auth_headers, get_token, make_restaurant, make_user
from tests.auth_support import session_headers


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

        res = client.delete('/v1/auth/mfa', headers=session_headers(uid, confirmed=True))

        assert res.status_code == 409
        assert db.session.get(User, uid).mfa_enabled is True

    def test_the_last_passkey_cannot_go_without_totp(self, app, client):
        make_restaurant(app)
        uid = make_user(app)
        passkey_id = self._with_passkey(uid)

        res = client.delete(f'/v1/auth/passkey/{passkey_id}', headers=session_headers(uid, confirmed=True))

        assert res.status_code == 409

    def test_a_passkey_goes_when_another_factor_remains(self, app, client):
        from app.extensions import db
        from app.models import User
        make_restaurant(app)
        uid = make_user(app)
        passkey_id = self._with_passkey(uid)
        db.session.get(User, uid).mfa_enabled = True
        db.session.commit()

        res = client.delete(f'/v1/auth/passkey/{passkey_id}', headers=session_headers(uid, confirmed=True))

        assert res.status_code == 200
