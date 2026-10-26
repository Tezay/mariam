import pyotp

from app.extensions import db
from app.models import ActivationLink, AuditLog, User
from conftest import TEST_PASSWORD, make_user
from tests.auth_support import (
    enable_totp,
    enroll_passkey,
    invite_link,
    is_signed_in,
    issue_session,
    new_authenticator,
    reset_link,
)

NEW_PASSWORD = 'Reset-Pass123!'


def _link_used(token):
    return ActivationLink.query.filter_by(token=token).one().used_at is not None


class TestLinkCheck:
    def test_a_reset_link_tells_which_second_factor_to_ask_for(self, app, client):
        enroll_passkey(make_user(app))

        body = client.get(f'/v1/auth/check-reset/{reset_link("admin@mariam.app")}').get_json()

        assert body == {'email': 'admin@mariam.app', 'mfa_enabled': False, 'has_passkeys': True}

    def test_an_invitation_is_not_a_reset_link(self, app, client):
        token = invite_link('new@mariam.app')

        assert client.get(f'/v1/auth/check-reset/{token}').get_json()['code'] == 'link_unknown'

    def test_a_used_link_is_gone(self, app, client):
        token = reset_link('admin@mariam.app')
        ActivationLink.query.filter_by(token=token).one().mark_as_used()
        db.session.commit()

        res = client.get(f'/v1/auth/check-reset/{token}')

        assert (res.status_code, res.get_json()['code']) == (410, 'link_expired')


class TestWithTotp:
    def _reset(self, client, token, code):
        return client.post('/v1/auth/reset-password', json={
            'token': token, 'new_password': NEW_PASSWORD, 'code': code,
        })

    def test_the_password_is_reset_and_every_session_ends(self, app, client):
        uid = make_user(app)
        secret = enable_totp(uid)
        session = issue_session(uid)
        token = reset_link('admin@mariam.app')

        assert self._reset(client, token, pyotp.TOTP(secret).now()).status_code == 204

        assert db.session.get(User, uid).check_password(NEW_PASSWORD)
        assert _link_used(token)
        assert not is_signed_in(client, session)

    def test_a_wrong_code_is_refused_and_audited(self, app, client):
        enable_totp(make_user(app))

        res = self._reset(client, reset_link('admin@mariam.app'), '000000')

        assert (res.status_code, res.get_json()['code']) == (401, 'code_invalid')
        entry = AuditLog.query.filter_by(action=AuditLog.ACTION_PASSWORD_RESET).one()
        assert entry.get_details() == {'success': False, 'reason': 'code_invalid'}

    def test_a_passkey_account_is_sent_to_the_passkey_reset(self, app, client):
        enroll_passkey(make_user(app))

        res = self._reset(client, reset_link('admin@mariam.app'), '000000')

        assert (res.status_code, res.get_json()['code']) == (409, 'passkey_required')

    def test_a_weak_password_is_refused_with_a_pointer(self, app, client):
        secret = enable_totp(make_user(app))

        res = client.post('/v1/auth/reset-password', json={
            'token': reset_link('admin@mariam.app'), 'new_password': 'weak',
            'code': pyotp.TOTP(secret).now(),
        })

        assert [issue['pointer'] for issue in res.get_json()['errors']] == ['/new_password']

    def test_a_used_link_is_refused(self, app, client):
        secret = enable_totp(make_user(app))
        token = reset_link('admin@mariam.app')
        self._reset(client, token, pyotp.TOTP(secret).now())

        assert self._reset(client, token, pyotp.TOTP(secret).now()).status_code == 410


class TestWithPasskey:
    def _begin(self, client, token):
        return client.post('/v1/auth/passkey/reset-password/begin', json={'reset_token': token})

    def _complete(self, client, token, begin, authenticator):
        return client.post('/v1/auth/passkey/reset-password/complete', json={
            'new_password': NEW_PASSWORD,
            'reset_token': token,
            'challenge_token': begin['challenge_token'],
            'credential': authenticator.sign(begin['options']),
        })

    def test_the_password_is_reset_and_every_session_ends(self, app, client):
        uid = make_user(app)
        authenticator = enroll_passkey(uid)
        session = issue_session(uid)
        token = reset_link('admin@mariam.app')
        begin = self._begin(client, token).get_json()

        assert self._complete(client, token, begin, authenticator).status_code == 204

        assert db.session.get(User, uid).check_password(NEW_PASSWORD)
        assert _link_used(token)
        assert not is_signed_in(client, session)

    def test_a_challenge_from_another_account_is_refused(self, app, client):
        victim_id = make_user(app, email='victim@mariam.app')
        enroll_passkey(victim_id)
        attacker = enroll_passkey(make_user(app, email='attacker@mariam.app'))
        begin = self._begin(client, reset_link('attacker@mariam.app')).get_json()

        res = self._complete(client, reset_link('victim@mariam.app'), begin, attacker)

        assert res.get_json()['code'] == 'challenge_invalid'
        assert db.session.get(User, victim_id).check_password(TEST_PASSWORD)

    def test_a_refused_assertion_does_not_say_why(self, app, client):
        uid = make_user(app)
        enroll_passkey(uid)
        token = reset_link('admin@mariam.app')
        begin = self._begin(client, token).get_json()

        res = self._complete(client, token, begin, new_authenticator())

        assert res.get_json()['detail'] == "La passkey n'a pas pu être vérifiée."
        assert db.session.get(User, uid).check_password(TEST_PASSWORD)

    def test_an_account_without_a_passkey_has_none_to_challenge(self, app, client):
        enable_totp(make_user(app))

        res = self._begin(client, reset_link('admin@mariam.app'))

        assert res.get_json()['code'] == 'no_passkey'
