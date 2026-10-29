"""The browser's session: two HttpOnly cookies, and a CSRF token for every write."""
from datetime import timedelta

import pyotp
from flask_jwt_extended import decode_token

from app.security import ACCESS_COOKIE, REFRESH_COOKIE
from conftest import TEST_PASSWORD, auth_headers, make_restaurant, make_user, site_path
from tests.auth_support import enable_totp

CSRF_ACCESS = '__Host-csrf-access'
CSRF_REFRESH = '__Host-csrf-refresh'


def _set_cookies(res) -> dict[str, str]:
    return {
        header.split('=', 1)[0]: header for header in res.headers.getlist('Set-Cookie')
    }


def _sign_in(client):
    return client.post('/v1/auth/login', json={
        'email': 'admin@mariam.app', 'password': TEST_PASSWORD,
    })


def _cookie(client, name):
    return client.get_cookie(name).value


class TestSignIn:
    def test_the_session_comes_in_cookies_no_script_reads(self, app, client, monkeypatch):
        monkeypatch.setitem(app.config, 'JWT_ACCESS_TOKEN_EXPIRES', timedelta(minutes=30))
        monkeypatch.setitem(app.config, 'JWT_REFRESH_TOKEN_EXPIRES', timedelta(days=7))
        make_user(app)

        res = _sign_in(client)

        assert res.get_json().keys() == {'user', 'confirmed_for'}
        cookies = _set_cookies(res)
        for name, lifetime in ((ACCESS_COOKIE, 1800), (REFRESH_COOKIE, 604800)):
            assert {'HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/', f'Max-Age={lifetime}'} <= {
                attribute.strip() for attribute in cookies[name].split(';')
            }
            assert 'Domain=' not in cookies[name]
        for name in (CSRF_ACCESS, CSRF_REFRESH):
            assert 'Secure' in cookies[name] and 'HttpOnly' not in cookies[name]

    def test_a_second_factor_confirms_the_session_for_ten_minutes(self, app, client):
        secret = enable_totp(make_user(app))
        mfa_token = _sign_in(client).get_json()['mfa_token']

        res = client.post('/v1/auth/mfa/verify', json={
            'mfa_token': mfa_token, 'code': pyotp.TOTP(secret).now(),
        })

        assert res.get_json()['confirmed_for'] == 600

    def test_a_password_alone_confirms_nothing(self, app, client):
        make_user(app)

        assert _sign_in(client).get_json()['confirmed_for'] == 0


class TestCsrf:
    def test_a_cookie_session_reads_without_its_token(self, app, client):
        make_user(app)
        _sign_in(client)

        assert client.get('/v1/user').status_code == 200

    def test_a_write_carries_the_token_of_its_session(self, app, client):
        make_user(app)
        _sign_in(client)

        def write(headers):
            return client.patch(
                '/v1/user/ui-preferences', json={'tour_done': True}, headers=headers
            )

        assert write({}).get_json()['code'] == 'csrf_invalid'
        assert write({'X-CSRF-TOKEN': 'forged'}).get_json()['code'] == 'csrf_invalid'
        assert write({'X-CSRF-TOKEN': _cookie(client, CSRF_ACCESS)}).status_code == 200

    def test_the_header_needs_no_token(self, app, client):
        make_user(app)
        _sign_in(client)
        token = _cookie(client, ACCESS_COOKIE)
        client.delete_cookie(ACCESS_COOKIE)

        res = client.patch(
            '/v1/user/ui-preferences', json={'tour_done': True}, headers=auth_headers(token)
        )

        assert res.status_code == 200


class TestRefresh:
    def test_the_refresh_cookie_renews_an_unconfirmed_access_cookie(self, app, client):
        secret = enable_totp(make_user(app))
        mfa_token = _sign_in(client).get_json()['mfa_token']
        client.post('/v1/auth/mfa/verify', json={
            'mfa_token': mfa_token, 'code': pyotp.TOTP(secret).now(),
        })
        client.delete_cookie(ACCESS_COOKIE)

        refused = client.post('/v1/auth/refresh')
        res = client.post(
            '/v1/auth/refresh', headers={'X-CSRF-TOKEN': _cookie(client, CSRF_REFRESH)}
        )

        assert refused.get_json()['code'] == 'csrf_invalid'
        assert res.status_code == 204
        assert decode_token(_cookie(client, ACCESS_COOKIE))['fresh'] is False

    def test_a_refused_refresh_clears_the_cookies(self, app, client):
        client.set_cookie(REFRESH_COOKIE, 'not-a-token')
        client.set_cookie(CSRF_REFRESH, 'any')

        res = client.post('/v1/auth/refresh', headers={'X-CSRF-TOKEN': 'any'})

        assert res.status_code == 401
        assert client.get_cookie(REFRESH_COOKIE) is None
        assert client.get_cookie(CSRF_REFRESH) is None


class TestLogout:
    def test_signing_out_ends_the_session_and_its_cookies(
        self, app, client, revocations, monkeypatch
    ):
        # Only a token that expires is revoked.
        monkeypatch.setitem(app.config, 'JWT_REFRESH_TOKEN_EXPIRES', timedelta(days=7))
        make_user(app)
        _sign_in(client)
        token = _cookie(client, ACCESS_COOKIE)

        res = client.post(
            '/v1/auth/logout', headers={'X-CSRF-TOKEN': _cookie(client, CSRF_REFRESH)}
        )

        assert res.status_code == 204
        for name in (ACCESS_COOKIE, REFRESH_COOKIE, CSRF_ACCESS, CSRF_REFRESH):
            assert client.get_cookie(name) is None
        assert client.get('/v1/user', headers=auth_headers(token)).status_code == 401


class TestPublicReads:
    def test_a_read_that_carries_the_session_cookie_is_not_shared(self, app, client):
        path = site_path(make_restaurant(app))
        make_user(app)
        foreign = {'Origin': 'https://intranet.example.edu'}

        anonymous = client.get(path, headers=foreign)
        _sign_in(client)
        signed_in = client.get(path, headers=foreign)

        assert anonymous.headers['Access-Control-Allow-Origin'] == '*'
        assert signed_in.headers.get('Access-Control-Allow-Origin') != '*'
        assert signed_in.headers['Cache-Control'] == 'no-store'
