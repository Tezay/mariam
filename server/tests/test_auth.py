"""
Tests d'authentification : login, refresh, logout, rate limiting, TOTP.
"""
import pytest
from app.extensions import db
from conftest import make_user, make_restaurant, get_token, auth_headers, TEST_PASSWORD


class TestLogin:
    def test_login_success(self, app, client):
        make_restaurant(app)
        make_user(app)
        res = client.post('/v1/auth/login', json={
            'email': 'admin@mariam.app',
            'password': TEST_PASSWORD,
        })
        assert res.status_code == 200
        data = res.get_json()
        assert 'access_token' in data
        assert 'refresh_token' in data
        assert data['user']['email'] == 'admin@mariam.app'

    def test_login_wrong_password(self, app, client):
        make_restaurant(app)
        make_user(app)
        res = client.post('/v1/auth/login', json={
            'email': 'admin@mariam.app',
            'password': 'WrongPass999!',
        })
        assert res.status_code == 401

    def test_login_unknown_email(self, client):
        res = client.post('/v1/auth/login', json={
            'email': 'nobody@test.com',
            'password': TEST_PASSWORD,
        })
        assert res.status_code == 401

    def test_login_missing_fields(self, client):
        res = client.post('/v1/auth/login', json={'email': 'admin@mariam.app'})
        assert res.status_code in (400, 422)

    def test_login_inactive_user(self, app, client):
        from app.models import User
        make_restaurant(app)
        uid = make_user(app)
        user = db.session.get(User, uid)
        user.is_active = False
        db.session.commit()
        res = client.post('/v1/auth/login', json={
            'email': 'admin@mariam.app',
            'password': TEST_PASSWORD,
        })
        assert res.status_code == 403

    def test_login_mfa_required(self, app, client):
        """Un utilisateur avec MFA activé reçoit un mfa_token au lieu du token final."""
        import pyotp
        from app.models import User
        make_restaurant(app)
        uid = make_user(app)
        user = db.session.get(User, uid)
        user.mfa_secret = pyotp.random_base32()
        user.mfa_enabled = True
        db.session.commit()
        res = client.post('/v1/auth/login', json={
            'email': 'admin@mariam.app',
            'password': TEST_PASSWORD,
        })
        assert res.status_code == 200
        data = res.get_json()
        assert data.get('mfa_required') is True
        assert 'mfa_token' in data


class TestMFA:
    def test_mfa_verify_success(self, app, client):
        import pyotp
        from app.models import User
        make_restaurant(app)
        uid = make_user(app)
        secret = pyotp.random_base32()
        user = db.session.get(User, uid)
        user.mfa_secret = secret
        user.mfa_enabled = True
        db.session.commit()

        res = client.post('/v1/auth/login', json={
            'email': 'admin@mariam.app',
            'password': TEST_PASSWORD,
        })
        mfa_token = res.get_json()['mfa_token']

        code = pyotp.TOTP(secret).now()
        res2 = client.post('/v1/auth/mfa/verify', json={
            'mfa_token': mfa_token,
            'code': code,
        })
        assert res2.status_code == 200
        assert 'access_token' in res2.get_json()

    def test_mfa_verify_wrong_code(self, app, client):
        import pyotp
        from app.models import User
        make_restaurant(app)
        uid = make_user(app)
        user = db.session.get(User, uid)
        user.mfa_secret = pyotp.random_base32()
        user.mfa_enabled = True
        db.session.commit()

        res = client.post('/v1/auth/login', json={
            'email': 'admin@mariam.app',
            'password': TEST_PASSWORD,
        })
        mfa_token = res.get_json()['mfa_token']
        res2 = client.post('/v1/auth/mfa/verify', json={
            'mfa_token': mfa_token,
            'code': '000000',
        })
        assert res2.status_code == 401


class TestRefreshAndLogout:
    def test_refresh_token(self, app, client):
        make_restaurant(app)
        make_user(app)
        login_res = client.post('/v1/auth/login', json={
            'email': 'admin@mariam.app',
            'password': TEST_PASSWORD,
        })
        refresh_token = login_res.get_json()['refresh_token']
        res = client.post('/v1/auth/refresh',
                          headers={'Authorization': f'Bearer {refresh_token}'})
        assert res.status_code == 200
        assert 'access_token' in res.get_json()

    def test_get_me(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        res = client.get('/v1/auth/me', headers=auth_headers(token))
        assert res.status_code == 200
        assert res.get_json()['user']['email'] == 'admin@mariam.app'

    def test_protected_route_without_token(self, client):
        res = client.get('/v1/auth/me')
        assert res.status_code == 401
