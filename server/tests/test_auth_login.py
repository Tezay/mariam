import time
from datetime import UTC, datetime

import pyotp
import pytest

from app.extensions import db
from app.models import AuditLog, Passkey, User
from conftest import TEST_PASSWORD, auth_headers, make_user, session_tokens
from tests.auth_support import enable_totp, enroll_passkey, new_authenticator


def _login(client, password=TEST_PASSWORD):
    return client.post('/v1/auth/login', json={'email': 'admin@mariam.app', 'password': password})


@pytest.fixture()
def paris_clock(monkeypatch):
    monkeypatch.setenv('TZ', 'Europe/Paris')
    time.tzset()
    yield
    monkeypatch.undo()
    time.tzset()


def _passkey_login(client, authenticator):
    begin = client.post('/v1/auth/passkey/login/begin').get_json()
    return client.post('/v1/auth/passkey/login/complete', json={
        'challenge_token': begin['challenge_token'],
        'credential': authenticator.sign(begin['options']),
    })


class TestPasswordLogin:
    def test_a_passkey_only_account_is_sent_to_passkey_login(self, app, client):
        enroll_passkey(make_user(app))

        res = _login(client)

        assert res.status_code == 403
        assert res.get_json()['code'] == 'passkey_only'
        assert session_tokens(client)['access_token'] is None

    def test_the_address_is_matched_whatever_its_case(self, app, client):
        make_user(app)

        res = client.post('/v1/auth/login', json={
            'email': ' Admin@MARIAM.app ', 'password': TEST_PASSWORD,
        })

        assert res.status_code == 200

    def test_a_failed_attempt_is_audited(self, app, client):
        make_user(app)

        res = _login(client, password='WrongPass123!')

        assert res.get_json()['code'] == 'credentials_invalid'
        assert AuditLog.query.filter_by(action=AuditLog.ACTION_LOGIN_FAILED).count() == 1

    def test_the_mfa_token_does_not_open_a_session(self, app, client):
        enable_totp(make_user(app))
        mfa_token = _login(client).get_json()['mfa_token']

        res = client.get('/v1/user', headers=auth_headers(mfa_token))

        assert res.status_code == 401


class TestTotpStep:
    def _verify(self, client, mfa_token, code):
        return client.post('/v1/auth/mfa/verify', json={'mfa_token': mfa_token, 'code': code})

    def test_a_password_step_taken_before_the_sessions_ended_does_not_finish(
        self, app, client, revocations
    ):
        uid = make_user(app)
        secret = enable_totp(uid)
        mfa_token = _login(client).get_json()['mfa_token']
        db.session.get(User, uid).revoke_tokens()
        db.session.commit()

        res = self._verify(client, mfa_token, pyotp.TOTP(secret).now())

        assert res.status_code == 401
        assert session_tokens(client)['access_token'] is None

    def test_no_code_matches_once_totp_is_off(self, app, client, revocations):
        uid = make_user(app)
        enable_totp(uid)
        mfa_token = _login(client).get_json()['mfa_token']
        db.session.get(User, uid).disable_mfa()
        db.session.commit()

        assert self._verify(client, mfa_token, '123456').status_code == 401

    def test_a_code_serves_once(self, app, client, revocations):
        secret = enable_totp(make_user(app))
        code = pyotp.TOTP(secret).now()
        first, second = (_login(client).get_json()['mfa_token'] for _ in range(2))

        accepted = self._verify(client, first, code)
        replayed = self._verify(client, second, code)

        assert accepted.status_code == 200
        assert (replayed.status_code, replayed.get_json()['code']) == (401, 'code_used')

    def test_a_code_holds_the_night_the_clocks_go_back(
        self, app, client, paris_clock, monkeypatch
    ):
        # 02:30 in Paris for the second time that night.
        instant = datetime(2026, 10, 25, 1, 30, tzinfo=UTC)

        class Frozen(datetime):
            @classmethod
            def now(cls, tz=None):
                return instant.astimezone(tz) if tz else instant.astimezone().replace(tzinfo=None)

        monkeypatch.setattr('app.services.totp.datetime', Frozen)
        secret = enable_totp(make_user(app))
        mfa_token = _login(client).get_json()['mfa_token']

        res = self._verify(client, mfa_token, pyotp.TOTP(secret).at(instant))

        assert res.status_code == 200

    def test_ten_wrong_codes_close_the_account_to_codes_for_a_while(self, app, client):
        secret = enable_totp(make_user(app))
        mfa_token = _login(client).get_json()['mfa_token']

        wrong = [self._verify(client, mfa_token, '000000').status_code for _ in range(10)]
        right = self._verify(client, mfa_token, pyotp.TOTP(secret).now())

        assert wrong == [401] * 10
        assert (right.status_code, right.get_json()['code']) == (429, 'too_many_attempts')
        assert int(right.headers['Retry-After']) > 0


class TestPasskeyLogin:
    def test_a_registered_passkey_opens_a_session(self, app, client):
        uid = make_user(app)
        authenticator = enroll_passkey(uid)

        res = _passkey_login(client, authenticator)

        assert res.status_code == 200
        assert res.get_json()['user']['id'] == uid
        assert AuditLog.query.filter_by(action=AuditLog.ACTION_LOGIN, user_id=uid).count() == 1

    def test_the_signature_counter_is_recorded(self, app, client):
        uid = make_user(app)
        authenticator = enroll_passkey(uid)

        _passkey_login(client, authenticator)
        _passkey_login(client, authenticator)

        assert Passkey.query.filter_by(user_id=uid).one().sign_count == 2

    def test_a_body_without_credential_is_refused_by_its_schema(self, app, client):
        res = client.post('/v1/auth/passkey/login/complete', json={'challenge_token': 'x'})

        assert res.status_code == 422

    def test_an_unknown_passkey_is_refused(self, app, client):
        make_user(app)

        res = _passkey_login(client, new_authenticator())

        assert res.get_json()['code'] == 'passkey_unknown'

    def test_a_signature_from_another_key_is_refused_and_audited(self, app, client):
        uid = make_user(app)
        registered = enroll_passkey(uid)
        impostor = new_authenticator()
        impostor.credential_id = registered.credential_id

        res = _passkey_login(client, impostor)

        assert res.get_json()['code'] == 'passkey_refused'
        assert 'signature' not in res.get_json()['detail'].lower()
        assert AuditLog.query.filter_by(
            action=AuditLog.ACTION_LOGIN_FAILED, user_id=uid
        ).count() == 1

    def test_a_disabled_account_is_told_once_its_passkey_is_verified(self, app, client):
        uid = make_user(app)
        authenticator = enroll_passkey(uid)
        db.session.get(User, uid).is_active = False
        db.session.commit()

        res = _passkey_login(client, authenticator)

        assert (res.status_code, res.get_json()['code']) == (403, 'account_disabled')
