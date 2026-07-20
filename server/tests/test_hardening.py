"""Backend hardening tests: opt-in pagination and auth hardening."""
import pyotp

from app.extensions import db
from app.models import User
from conftest import TEST_PASSWORD, auth_headers, get_token, make_user


class TestPagination:
    def test_users_default_shape_unchanged(self, app, client):
        make_user(None, email='padmin@mariam.app', role='admin')
        make_user(None, email='u1@mariam.app', role='editor')
        token = get_token(client, email='padmin@mariam.app')

        body = client.get('/v1/users', headers=auth_headers(token)).get_json()
        assert 'users' in body
        assert 'total' not in body  # no pagination fields without ?page=

    def test_users_opt_in_pagination(self, app, client):
        make_user(None, email='padmin@mariam.app', role='admin')
        make_user(None, email='u1@mariam.app', role='editor')
        make_user(None, email='u2@mariam.app', role='editor')
        token = get_token(client, email='padmin@mariam.app')

        body = client.get('/v1/users?page=1&per_page=1', headers=auth_headers(token)).get_json()
        assert body['page'] == 1
        assert body['per_page'] == 1
        assert body['total'] >= 3
        assert len(body['users']) == 1
        assert body['has_more'] is True

    def test_per_page_capped(self, app, client):
        make_user(None, email='padmin@mariam.app', role='admin')
        token = get_token(client, email='padmin@mariam.app')
        body = client.get('/v1/users?page=1&per_page=9999', headers=auth_headers(token)).get_json()
        assert body['per_page'] == 200


class TestLoginHardening:
    def test_unknown_email_and_wrong_password_are_indistinguishable(self, app, client):
        make_user(None, email='real@mariam.app', role='admin')

        unknown = client.post('/v1/auth/login',
                              json={'email': 'ghost@mariam.app', 'password': 'whatever12A!'})
        wrong = client.post('/v1/auth/login',
                            json={'email': 'real@mariam.app', 'password': 'WrongPass123!'})

        assert unknown.status_code == wrong.status_code == 401
        assert unknown.get_json()['error'] == wrong.get_json()['error']

    def test_disabled_account_cannot_login(self, app, client):
        uid = make_user(None, email='off@mariam.app', role='admin')
        User.query.get(uid).is_active = False
        db.session.commit()

        res = client.post('/v1/auth/login',
                         json={'email': 'off@mariam.app', 'password': TEST_PASSWORD})
        assert res.status_code == 403


class TestMfaTokenSingleUse:
    def test_mfa_token_cannot_be_replayed(self, app, client, monkeypatch):
        revoked: set[str] = set()
        monkeypatch.setattr('app.routes.auth.blacklist_token',
                            lambda jti, ttl: revoked.add(jti))
        monkeypatch.setattr('app.routes.auth.is_token_blacklisted',
                            lambda jti: jti in revoked)

        secret = pyotp.random_base32()
        uid = make_user(None, email='mfa@mariam.app', role='admin')
        user = User.query.get(uid)
        user.mfa_secret = secret
        user.mfa_enabled = True
        db.session.commit()

        login = client.post('/v1/auth/login',
                           json={'email': 'mfa@mariam.app', 'password': TEST_PASSWORD})
        assert login.get_json()['mfa_required'] is True
        mfa_token = login.get_json()['mfa_token']

        code = pyotp.TOTP(secret).now()
        first = client.post('/v1/auth/mfa/verify', json={'mfa_token': mfa_token, 'code': code})
        assert first.status_code == 200
        assert 'access_token' in first.get_json()

        # Replaying the same MFA token must be rejected (single-use).
        replay = client.post('/v1/auth/mfa/verify',
                            json={'mfa_token': mfa_token, 'code': pyotp.TOTP(secret).now()})
        assert replay.status_code == 401
