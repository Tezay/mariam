import pyotp

from app.extensions import db
from app.models import User
from conftest import TEST_PASSWORD, make_user
from tests.auth_support import enable_totp, enroll_passkey, new_authenticator, session_headers


def _delete(client, admin_id, target_id, proof):
    return client.delete(
        f'/v1/users/{target_id}', headers={**session_headers(admin_id), 'X-Step-Up-Token': proof}
    )


class TestPassword:
    def _step_up(self, client, user_id, code):
        return client.post('/v1/auth/step-up/password', headers=session_headers(user_id), json={
            'password': TEST_PASSWORD, 'mfa_code': code,
        })

    def test_the_totp_code_is_required_once_enabled(self, app, client):
        uid = make_user(app)
        secret = enable_totp(uid)

        assert self._step_up(client, uid, '000000').status_code == 401
        assert 'step_up_token' in self._step_up(client, uid, pyotp.TOTP(secret).now()).get_json()

    def test_the_password_alone_is_not_a_proof_on_a_passkey_account(self, app, client):
        uid = make_user(app)
        enroll_passkey(uid)

        res = self._step_up(client, uid, '000000')

        assert res.status_code == 403
        assert res.get_json()['passkey_required'] is True

    def test_an_account_without_second_factor_gets_no_proof(self, app, client):
        uid = make_user(app)

        res = self._step_up(client, uid, '000000')

        assert res.status_code == 403
        assert res.get_json()['second_factor_required'] is True
        assert 'step_up_token' not in res.get_json()


class TestPasskey:
    def _begin(self, client, user_id):
        return client.post('/v1/auth/step-up/passkey/begin', headers=session_headers(user_id))

    def _complete(self, client, user_id, begin, authenticator):
        return client.post('/v1/auth/step-up/passkey/complete', headers=session_headers(user_id), json={
            'challenge_token': begin['challenge_token'],
            'credential': authenticator.sign(begin['options']),
        })

    def test_a_passkey_confirms_a_sensitive_action_once(self, app, client, revocations):
        admin = make_user(app)
        target = make_user(app, email='target@mariam.app')
        other = make_user(app, email='other@mariam.app')
        authenticator = enroll_passkey(admin)
        begin = self._begin(client, admin).get_json()
        proof = self._complete(client, admin, begin, authenticator).get_json()['step_up_token']

        assert _delete(client, admin, target, proof).status_code == 200
        assert _delete(client, admin, other, proof).status_code == 403
        assert db.session.get(User, other) is not None

    def test_an_account_without_passkey_gets_no_challenge(self, app, client):
        assert self._begin(client, make_user(app)).status_code == 404

    def test_a_challenge_issued_to_another_user_is_refused(self, app, client):
        owner = make_user(app, email='owner@mariam.app')
        intruder = make_user(app, email='intruder@mariam.app')
        enroll_passkey(owner)
        begin = self._begin(client, owner).get_json()

        res = self._complete(client, intruder, begin, enroll_passkey(intruder))

        assert res.status_code == 401

    def test_an_unregistered_passkey_is_refused(self, app, client):
        uid = make_user(app)
        enroll_passkey(uid)
        begin = self._begin(client, uid).get_json()

        assert self._complete(client, uid, begin, new_authenticator()).status_code == 404
