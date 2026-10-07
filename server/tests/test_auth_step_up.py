from datetime import timedelta

import pyotp
from flask_jwt_extended import create_access_token

from app.extensions import db
from app.models import User
from conftest import TEST_PASSWORD, auth_headers, make_user
from tests.auth_support import enable_totp, enroll_passkey, new_authenticator, session_headers


def _delete(client, target_id, headers):
    return client.delete(f'/v1/users/{target_id}', headers=headers)


class TestPassword:
    def _step_up(self, client, user_id, code):
        return client.post('/v1/auth/step-up/password', headers=session_headers(user_id), json={
            'password': TEST_PASSWORD, 'mfa_code': code,
        })

    def test_the_totp_code_is_required_once_enabled(self, app, client):
        uid = make_user(app)
        secret = enable_totp(uid)

        assert self._step_up(client, uid, '000000').status_code == 403
        assert 'access_token' in self._step_up(client, uid, pyotp.TOTP(secret).now()).get_json()

    def test_the_password_alone_confirms_nothing_on_a_passkey_account(self, app, client):
        uid = make_user(app)
        enroll_passkey(uid)

        res = self._step_up(client, uid, '000000')

        assert res.status_code == 403
        assert res.get_json()['passkey_required'] is True

    def test_an_account_without_second_factor_cannot_confirm(self, app, client):
        uid = make_user(app)

        res = self._step_up(client, uid, '000000')

        assert res.status_code == 403
        assert res.get_json()['second_factor_required'] is True
        assert 'access_token' not in res.get_json()


class TestPasskey:
    def _begin(self, client, user_id):
        return client.post('/v1/auth/step-up/passkey/begin', headers=session_headers(user_id))

    def _complete(self, client, user_id, begin, authenticator):
        return client.post('/v1/auth/step-up/passkey/complete', headers=session_headers(user_id), json={
            'challenge_token': begin['challenge_token'],
            'credential': authenticator.sign(begin['options']),
        })

    def test_a_passkey_confirms_the_session(self, app, client, revocations):
        admin = make_user(app)
        target = make_user(app, email='target@mariam.app')
        authenticator = enroll_passkey(admin)
        begin = self._begin(client, admin).get_json()

        confirmed = self._complete(client, admin, begin, authenticator).get_json()['access_token']

        assert _delete(client, target, auth_headers(confirmed)).status_code == 200

    def test_a_signed_challenge_cannot_be_replayed(self, app, client, revocations):
        uid = make_user(app)
        authenticator = enroll_passkey(uid)
        begin = self._begin(client, uid).get_json()
        signed = {
            'challenge_token': begin['challenge_token'],
            'credential': authenticator.sign(begin['options']),
        }
        url, headers = '/v1/auth/step-up/passkey/complete', session_headers(uid)

        first = client.post(url, headers=headers, json=signed)
        replay = client.post(url, headers=headers, json=signed)

        assert (first.status_code, replay.status_code) == (200, 403)

    def test_an_account_without_passkey_gets_no_challenge(self, app, client):
        assert self._begin(client, make_user(app)).status_code == 404

    def test_a_challenge_issued_to_another_user_is_refused(self, app, client):
        owner = make_user(app, email='owner@mariam.app')
        intruder = make_user(app, email='intruder@mariam.app')
        enroll_passkey(owner)
        begin = self._begin(client, owner).get_json()

        res = self._complete(client, intruder, begin, enroll_passkey(intruder))

        assert res.status_code == 403

    def test_an_unregistered_passkey_is_refused(self, app, client):
        uid = make_user(app)
        enroll_passkey(uid)
        begin = self._begin(client, uid).get_json()

        assert self._complete(client, uid, begin, new_authenticator()).status_code == 404


class TestConfirmedSession:
    def _sign_in(self, client, secret):
        mfa_token = client.post('/v1/auth/login', json={
            'email': 'admin@mariam.app', 'password': TEST_PASSWORD,
        }).get_json()['mfa_token']
        return client.post('/v1/auth/mfa/verify', json={
            'mfa_token': mfa_token, 'code': pyotp.TOTP(secret).now(),
        }).get_json()

    def test_an_unconfirmed_session_is_refused(self, app, client):
        admin = make_user(app)
        target = make_user(app, email='target@mariam.app')
        enable_totp(admin)

        res = _delete(client, target, session_headers(admin))

        assert res.status_code == 403
        assert res.get_json()['step_up_required'] is True
        assert db.session.get(User, target) is not None

    def test_one_confirmation_covers_several_actions(self, app, client):
        admin = make_user(app)
        target = make_user(app, email='target@mariam.app')
        other = make_user(app, email='other@mariam.app')
        enable_totp(admin)
        headers = session_headers(admin, confirmed=True)

        assert _delete(client, target, headers).status_code == 200
        assert _delete(client, other, headers).status_code == 200

    def test_a_sign_in_with_a_second_factor_is_confirmed(self, app, client, revocations):
        admin = make_user(app)
        target = make_user(app, email='target@mariam.app')
        session = self._sign_in(client, enable_totp(admin))

        assert _delete(client, target, auth_headers(session['access_token'])).status_code == 200

    def test_a_refreshed_session_is_not(self, app, client, revocations):
        admin = make_user(app)
        target = make_user(app, email='target@mariam.app')
        session = self._sign_in(client, enable_totp(admin))

        refreshed = client.post(
            '/v1/auth/refresh', headers=auth_headers(session['refresh_token'])
        ).get_json()['access_token']

        assert _delete(client, target, auth_headers(refreshed)).status_code == 403

    def test_a_confirmation_lapses(self, app, client):
        admin = make_user(app)
        target = make_user(app, email='target@mariam.app')
        enable_totp(admin)
        lapsed = create_access_token(identity=str(admin), fresh=timedelta(seconds=-1))

        assert _delete(client, target, auth_headers(lapsed)).status_code == 403

    def test_an_account_without_second_factor_is_never_confirmed(self, app, client):
        admin = make_user(app)
        target = make_user(app, email='target@mariam.app')

        res = _delete(client, target, session_headers(admin, confirmed=True))

        assert res.status_code == 403
