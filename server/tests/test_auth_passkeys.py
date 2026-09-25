from app.models import AuditLog, Passkey
from conftest import make_user
from tests.auth_support import enable_totp, enroll_passkey, new_authenticator, session_headers
from tests.webauthn_authenticator import b64url


class TestRegistration:
    def _begin(self, client, user_id):
        return client.post('/v1/auth/passkey/register/begin', headers=session_headers(user_id))

    def _complete(self, client, user_id, begin, credential, user_agent=''):
        return client.post(
            '/v1/auth/passkey/register/complete',
            headers={**session_headers(user_id), 'User-Agent': user_agent},
            json={'challenge_token': begin['challenge_token'], 'credential': credential},
        )

    def test_a_signed_in_user_registers_a_passkey(self, app, client):
        uid = make_user(app)
        begin = self._begin(client, uid).get_json()

        res = self._complete(client, uid, begin, new_authenticator().register(begin['options']))

        assert res.status_code == 201
        assert Passkey.query.filter_by(user_id=uid).count() == 1
        assert AuditLog.query.filter_by(action=AuditLog.ACTION_PASSKEY_REGISTERED).count() == 1

    def test_an_unnamed_passkey_is_named_after_the_device(self, app, client):
        uid = make_user(app)
        begin = self._begin(client, uid).get_json()

        res = self._complete(
            client, uid, begin, new_authenticator().register(begin['options']),
            user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
        )

        assert res.get_json()['passkey']['device_name'] == 'iPhone'

    def test_the_passkey_must_serve_for_passwordless_login(self, app, client):
        """A passkey added here may become the only factor, so it must be discoverable."""
        options = self._begin(client, make_user(app)).get_json()['options']

        assert options['authenticatorSelection']['residentKey'] == 'required'
        assert options['authenticatorSelection']['userVerification'] == 'required'

    def test_a_device_already_registered_is_excluded(self, app, client):
        uid = make_user(app)
        registered = enroll_passkey(uid)

        options = self._begin(client, uid).get_json()['options']

        assert [c['id'] for c in options['excludeCredentials']] == [b64url(registered.credential_id)]

    def test_a_challenge_issued_to_another_user_is_refused(self, app, client):
        owner = make_user(app, email='owner@mariam.app')
        intruder = make_user(app, email='intruder@mariam.app')
        begin = self._begin(client, owner).get_json()

        res = self._complete(client, intruder, begin, new_authenticator().register(begin['options']))

        assert res.status_code == 401
        assert Passkey.query.count() == 0


class TestManagement:
    def _rename(self, client, user_id, passkey_id, name):
        return client.patch(
            f'/v1/auth/passkey/{passkey_id}',
            headers=session_headers(user_id),
            json={'device_name': name},
        )

    def test_the_list_shows_the_users_passkeys(self, app, client):
        uid = make_user(app)
        enroll_passkey(uid)
        enroll_passkey(make_user(app, email='other@mariam.app'))

        body = client.get('/v1/auth/passkey', headers=session_headers(uid)).get_json()

        assert len(body['passkeys']) == 1

    def test_a_passkey_is_renamed_and_the_change_audited(self, app, client):
        uid = make_user(app)
        enroll_passkey(uid)

        res = self._rename(client, uid, Passkey.query.one().id, 'Téléphone pro')

        assert res.status_code == 200
        assert Passkey.query.one().device_name == 'Téléphone pro'
        assert AuditLog.query.filter_by(action=AuditLog.ACTION_PASSKEY_RENAMED).count() == 1

    def test_a_blank_name_is_refused(self, app, client):
        uid = make_user(app)
        enroll_passkey(uid)

        assert self._rename(client, uid, Passkey.query.one().id, '   ').status_code == 400

    def test_a_name_over_100_characters_is_refused(self, app, client):
        uid = make_user(app)
        enroll_passkey(uid)

        assert self._rename(client, uid, Passkey.query.one().id, 'x' * 101).status_code == 400

    def test_another_users_passkey_is_out_of_reach(self, app, client):
        enroll_passkey(make_user(app, email='owner@mariam.app'))
        intruder = make_user(app, email='intruder@mariam.app')
        passkey_id = Passkey.query.one().id

        assert self._rename(client, intruder, passkey_id, 'Mine').status_code == 404
        assert client.delete(
            f'/v1/auth/passkey/{passkey_id}', headers=session_headers(intruder)
        ).status_code == 404

    def test_the_last_passkey_cannot_go_without_totp(self, app, client):
        uid = make_user(app)
        enroll_passkey(uid)

        res = client.delete(f'/v1/auth/passkey/{Passkey.query.one().id}', headers=session_headers(uid))

        assert res.status_code == 409
        assert Passkey.query.count() == 1

    def test_a_passkey_goes_when_totp_remains(self, app, client):
        uid = make_user(app)
        enable_totp(uid)
        enroll_passkey(uid)

        res = client.delete(f'/v1/auth/passkey/{Passkey.query.one().id}', headers=session_headers(uid))

        assert res.status_code == 200
        assert Passkey.query.count() == 0
        assert AuditLog.query.filter_by(action=AuditLog.ACTION_PASSKEY_DELETED).count() == 1
