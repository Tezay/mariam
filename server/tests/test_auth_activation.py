import pyotp

from app.extensions import db
from app.models import ActivationLink, AuditLog, Passkey, User
from conftest import make_user
from tests.auth_support import enroll_passkey, invite_link, new_authenticator, reset_link

STRONG_PASSWORD = 'NewAccount123!'


def _activate(client, token, **overrides):
    body = {'token': token, 'password': STRONG_PASSWORD, 'username': 'newcomer', **overrides}
    return client.post('/v1/auth/activate', json=body)


def _activated(client, email='new@mariam.app'):
    setup = _activate(client, invite_link(email)).get_json()['mfa_setup']
    return setup['user_id'], setup['secret'], setup['setup_token']


class TestLinkCheck:
    def test_a_valid_invitation_is_described(self, app, client):
        token = invite_link('new@mariam.app', role='admin')

        body = client.get(f'/v1/auth/check-activation/{token}').get_json()

        assert body == {
            'valid': True, 'link_type': 'invite', 'email': 'new@mariam.app', 'role': 'admin',
        }

    def test_an_unknown_link_is_not_found(self, app, client):
        assert client.get('/v1/auth/check-activation/nope').status_code == 404

    def test_a_used_link_is_refused(self, app, client):
        token = invite_link('new@mariam.app')
        _activate(client, token)

        assert client.get(f'/v1/auth/check-activation/{token}').status_code == 400


class TestActivation:
    def test_an_invitation_creates_the_account_and_consumes_the_link(self, app, client):
        token = invite_link('new@mariam.app', role='editor')

        res = _activate(client, token)

        assert res.status_code == 201
        user = User.query.filter_by(email='new@mariam.app').one()
        assert user.role == 'editor'
        assert not user.mfa_enabled
        assert ActivationLink.query.filter_by(token=token).one().used_at is not None
        setup = res.get_json()['mfa_setup']
        assert setup['qr_code'].startswith('data:image/png;base64,')
        assert setup['user_id'] == user.id

    def test_a_weak_password_is_refused(self, app, client):
        res = _activate(client, invite_link('new@mariam.app'), password='short')

        assert res.status_code == 400
        assert User.query.filter_by(email='new@mariam.app').count() == 0

    def test_an_email_already_in_use_is_refused(self, app, client):
        make_user(app, email='taken@mariam.app')

        res = _activate(client, invite_link('taken@mariam.app'))

        assert res.status_code == 409


class TestTotpSetup:
    def test_the_first_code_enables_totp_and_opens_a_session(self, app, client):
        user_id, secret, setup_token = _activated(client)

        res = client.post('/v1/auth/mfa/verify-setup', json={
            'user_id': user_id, 'code': pyotp.TOTP(secret).now(), 'setup_token': setup_token,
        })

        assert res.status_code == 200
        assert 'access_token' in res.get_json()
        assert db.session.get(User, user_id).mfa_enabled

    def test_a_wrong_code_is_refused(self, app, client):
        user_id, _, setup_token = _activated(client)

        res = client.post('/v1/auth/mfa/verify-setup', json={
            'user_id': user_id, 'code': '000000', 'setup_token': setup_token,
        })

        assert res.status_code == 401

    def test_a_setup_token_belongs_to_one_account(self, app, client):
        first_id, _, first_token = _activated(client, 'first@mariam.app')
        second_id, second_secret, _ = _activated(client, 'second@mariam.app')

        res = client.post('/v1/auth/mfa/verify-setup', json={
            'user_id': second_id, 'code': pyotp.TOTP(second_secret).now(),
            'setup_token': first_token,
        })

        assert res.status_code == 401


class TestPasskeySetup:
    def _begin(self, client, user_id, setup_token):
        return client.post('/v1/auth/passkey/setup/begin', json={
            'user_id': user_id, 'setup_token': setup_token,
        })

    def _complete(self, client, user_id, challenge_token, credential):
        return client.post('/v1/auth/passkey/setup/complete', json={
            'user_id': user_id, 'challenge_token': challenge_token, 'credential': credential,
        })

    def test_a_passkey_created_at_activation_opens_a_session(self, app, client):
        user_id, _, setup_token = _activated(client)
        begin = self._begin(client, user_id, setup_token).get_json()

        res = self._complete(
            client, user_id, begin['challenge_token'], new_authenticator().register(begin['options'])
        )

        assert res.status_code == 200
        assert 'access_token' in res.get_json()
        assert Passkey.query.filter_by(user_id=user_id).count() == 1
        assert AuditLog.query.filter_by(action=AuditLog.ACTION_PASSKEY_SETUP).count() == 1

    def test_the_passkey_must_be_discoverable_and_verified(self, app, client):
        user_id, _, setup_token = _activated(client)

        options = self._begin(client, user_id, setup_token).get_json()['options']

        assert options['authenticatorSelection']['residentKey'] == 'required'
        assert options['authenticatorSelection']['userVerification'] == 'required'

    def test_the_setup_requires_the_activation_token(self, app, client):
        user_id, _, _ = _activated(client)

        assert self._begin(client, user_id, 'forged').status_code == 401

    def test_a_reset_link_cannot_enrol_a_passkey(self, app, client):
        """On an account protected by a passkey only, that would hand the account over."""
        victim_id = make_user(app, email='victim@mariam.app')
        enroll_passkey(victim_id)
        begin = client.post('/v1/auth/passkey/reset-password/begin', json={
            'reset_token': reset_link('victim@mariam.app'),
        }).get_json()

        res = self._complete(
            client, victim_id, begin['challenge_token'],
            new_authenticator().register({'challenge': begin['options']['challenge']}),
        )

        assert res.status_code == 401
        assert Passkey.query.filter_by(user_id=victim_id).count() == 1
