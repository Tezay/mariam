"""Backend hardening tests: opt-in pagination, auth hardening and the production guard."""
import re

import pyotp
import pytest

from app import create_app
from app.extensions import db
from app.models import Organization, User
from conftest import TEST_PASSWORD, auth_headers, get_token, make_restaurant, make_user
from tests.auth_support import session_headers


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
        db.session.get(User, uid).is_active = False
        db.session.commit()

        res = client.post('/v1/auth/login',
                         json={'email': 'off@mariam.app', 'password': TEST_PASSWORD})
        assert res.status_code == 403


class TestMfaTokenSingleUse:
    def test_mfa_token_cannot_be_replayed(self, app, client, revocations):
        secret = pyotp.random_base32()
        uid = make_user(None, email='mfa@mariam.app', role='admin')
        user = db.session.get(User, uid)
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


class TestAuthenticationComesFirst:
    # Every route a caller without a session may write to.
    OPEN_TO_ANYONE = {
        'auth.login',
        'auth.verify_mfa',
        'auth.activate_account',
        'auth.verify_mfa_setup',
        'auth.passkey_setup_begin',
        'auth.passkey_setup_complete',
        'auth.passkey_login_begin',
        'auth.passkey_login_complete',
        'auth.reset_password',
        'auth.passkey_reset_password_begin',
        'auth.passkey_reset_password_complete',
        'auth.session_transfer_validate',
        'notifications.subscribe',
        'notifications.unsubscribe',
        'notifications.update_preferences',
        'notifications.send_test',
        'public.cast_vote',
        'public.mint_device',
        'public.track_page_view',
        'public.unsubscribe',
    }

    def test_a_guarded_route_answers_401_before_it_reads_the_body(self, app, client):
        answers = {
            f'{method} {rule.rule}': client.open(
                re.sub(r'<[^>]+>', '1', rule.rule), method=method, json=[]
            ).status_code
            for rule in app.url_map.iter_rules()
            if rule.endpoint not in self.OPEN_TO_ANYONE
            for method in sorted(rule.methods & {'POST', 'PUT', 'PATCH', 'DELETE'})
        }

        assert {route: status for route, status in answers.items() if status != 401} == {}

    def test_a_deleted_account_reaches_no_route_that_asks_for_a_session(self, app, client):
        user_id = make_user(app)
        gone = auth_headers(get_token(client))
        db.session.delete(db.session.get(User, user_id))
        db.session.commit()

        answers = {}
        for rule in app.url_map.iter_rules():
            path = re.sub(r'<[^>]+>', '1', rule.rule)
            for method in sorted(rule.methods - {'HEAD', 'OPTIONS'}):
                if client.open(path, method=method, json=[]).status_code == 401:
                    answers[f'{method} {rule.rule}'] = client.open(
                        path, method=method, json=[], headers=gone
                    ).status_code

        assert answers
        assert {route: status for route, status in answers.items() if status != 401} == {}


class TestUnauthorizedSpeaksOfTheSession:
    # Authenticated by the refresh token: an access token is the wrong credential there.
    TAKE_THE_REFRESH_TOKEN = {'auth.refresh', 'auth.logout'}

    def test_a_signed_in_account_is_never_answered_401(self, app, client):
        make_restaurant(app)
        organization = Organization(name='Org', slug='org')
        db.session.add(organization)
        db.session.commit()
        supervisor = make_user(
            app, email='supervisor@mariam.app', role='org_admin', restaurant_id=None
        )
        db.session.get(User, supervisor).organization_id = organization.id
        db.session.commit()
        sessions = {
            'site admin': session_headers(make_user(app, email='admin@mariam.app')),
            'editor': session_headers(make_user(app, email='editor@mariam.app', role='editor')),
            'reader': session_headers(make_user(app, email='reader@mariam.app', role='reader')),
            'supervisor': session_headers(supervisor),
        }

        refused = [
            f'{account}: {method} {rule.rule}'
            for account, headers in sessions.items()
            for rule in app.url_map.iter_rules()
            if rule.endpoint not in self.TAKE_THE_REFRESH_TOKEN
            for method in sorted(rule.methods - {'HEAD', 'OPTIONS'})
            if client.open(
                re.sub(r'<[^>]+>', '1', rule.rule), method=method, json=[], headers=headers
            ).status_code == 401
        ]

        assert refused == []


class TestResponseHeaders:
    def test_responses_forbid_mime_sniffing(self, app, client):
        res = client.get('/health')

        assert res.headers['X-Content-Type-Options'] == 'nosniff'


class TestProductionGuard:
    @pytest.fixture()
    def production_env(self, monkeypatch):
        monkeypatch.delenv('FLASK_DEBUG', raising=False)
        for name, value in {
            'FLASK_ENV': 'production',
            'SECRET_KEY': 'a-production-secret',
            'JWT_SECRET_KEY': 'a-production-jwt-secret',
            'DEVICE_ID_SECRET': 'a-production-device-secret',
            'MFA_ENCRYPTION_KEY': 'a-production-mfa-key',
            'DATABASE_URL': 'postgresql://mariam@db:5432/mariam_db',
            'S3_ENDPOINT_URL': 'https://s3.example.org',
            'S3_ACCESS_KEY_ID': 'key',
            'S3_SECRET_ACCESS_KEY': 'secret',
        }.items():
            monkeypatch.setenv(name, value)
        return monkeypatch

    @pytest.mark.parametrize('redis_url', [None, '', 'memory://'])
    def test_a_production_start_without_redis_is_refused(self, production_env, redis_url):
        if redis_url is None:
            production_env.delenv('REDIS_URL', raising=False)
        else:
            production_env.setenv('REDIS_URL', redis_url)

        with pytest.raises(RuntimeError, match='REDIS_URL'):
            create_app()
