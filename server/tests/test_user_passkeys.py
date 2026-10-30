"""The account's passkeys: registering, renaming, removing."""
import uuid

import pytest
from webauthn.helpers import base64url_to_bytes

from app.extensions import db
from app.models import AuditLog, Passkey, User
from conftest import make_user
from tests.auth_support import enable_totp, enroll_passkey, new_authenticator, session_headers
from tests.webauthn_authenticator import b64url


class TestRegistration:
    def _begin(self, client, user_id, confirmed=False):
        return client.post(
            '/v1/user/passkeys/options',
            headers=session_headers(user_id, confirmed=confirmed),
        )

    def _complete(self, client, user_id, begin, credential, user_agent='', confirmed=False):
        return client.post(
            '/v1/user/passkeys',
            headers={**session_headers(user_id, confirmed=confirmed), 'User-Agent': user_agent},
            json={'challenge_token': begin['challenge_token'], 'credential': credential},
        )

    def test_a_signed_in_user_registers_a_passkey(self, app, client):
        uid = make_user(app)
        begin = self._begin(client, uid).get_json()

        res = self._complete(client, uid, begin, new_authenticator().register(begin['options']))

        assert res.status_code == 201
        assert Passkey.query.filter_by(user_id=uid).count() == 1
        assert AuditLog.query.filter_by(action=AuditLog.ACTION_PASSKEY_REGISTERED).count() == 1

    def test_the_offer_after_a_sign_in_asks_for_this_device_only(self, app, client):
        uid = make_user(app)

        offered = client.post(
            '/v1/user/passkeys/options', headers=session_headers(uid), json={'this_device': True}
        ).get_json()['options']
        plain = self._begin(client, uid).get_json()['options']

        assert offered['authenticatorSelection']['authenticatorAttachment'] == 'platform'
        assert offered['hints'] == ['client-device']
        assert 'authenticatorAttachment' not in plain['authenticatorSelection']
        assert 'hints' not in plain

    @pytest.mark.parametrize('aaguid, provider', [
        ('ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4', 'Gestionnaire de mots de passe Google'),
        ('00000000-0000-0000-0000-000000000000', None),
        ('0d4b6b44-1f5a-4b0a-9a2e-6f1e8c0b9a7d', None),
    ])
    def test_a_passkey_names_its_password_manager_when_known(self, app, client, aaguid, provider):
        uid = make_user(app)
        begin = self._begin(client, uid).get_json()
        authenticator = new_authenticator(uuid.UUID(aaguid).bytes)
        self._complete(client, uid, begin, authenticator.register(begin['options']))

        [passkey] = client.get('/v1/user/passkeys', headers=session_headers(uid)).get_json()['items']

        assert passkey['provider'] == provider
        assert passkey['credential_id'] == b64url(authenticator.credential_id)

    def test_the_list_carries_the_account_as_its_passkeys_know_it(self, app, client):
        uid = make_user(app)
        options = self._begin(client, uid).get_json()['options']

        listed = client.get('/v1/user/passkeys', headers=session_headers(uid)).get_json()

        assert listed['rp_id'] == options['rp']['id']
        assert listed['user'] == {
            'id': options['user']['id'],
            'name': options['user']['name'],
            'display_name': options['user']['displayName'],
        }

    def test_each_account_gets_a_random_handle_of_its_own_that_stays(self, app, client):
        first, second = make_user(app), make_user(app, email='second@example.org')

        handle = self._begin(client, first).get_json()['options']['user']['id']
        # The suite's requests share one session: a rollback stands for the end of the request.
        db.session.rollback()

        assert len(base64url_to_bytes(handle)) == 32
        assert self._begin(client, first).get_json()['options']['user']['id'] == handle
        assert self._begin(client, second).get_json()['options']['user']['id'] != handle

    def test_an_account_keeps_the_handle_its_passkeys_carry(self, app, client):
        uid = make_user(app)
        db.session.get(User, uid).webauthn_user_id = str(uid).encode()
        db.session.commit()

        options = self._begin(client, uid).get_json()['options']

        assert base64url_to_bytes(options['user']['id']) == str(uid).encode()

    def test_an_unnamed_passkey_is_named_after_the_device(self, app, client):
        uid = make_user(app)
        begin = self._begin(client, uid).get_json()

        res = self._complete(
            client, uid, begin, new_authenticator().register(begin['options']),
            user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
        )

        assert res.get_json()['device_name'] == 'iPhone'

    def test_a_name_over_100_characters_is_refused_by_the_schema(self, app, client):
        uid = make_user(app)
        begin = self._begin(client, uid).get_json()

        res = client.post(
            '/v1/user/passkeys',
            headers=session_headers(uid),
            json={
                'challenge_token': begin['challenge_token'],
                'credential': new_authenticator().register(begin['options']),
                'device_name': 'x' * 101,
            },
        )

        assert res.status_code == 422
        assert Passkey.query.filter_by(user_id=uid).count() == 0

    def test_the_passkey_must_serve_for_passwordless_login(self, app, client):
        """A passkey added here may become the only factor, so it must be discoverable."""
        options = self._begin(client, make_user(app)).get_json()['options']

        assert options['authenticatorSelection']['residentKey'] == 'required'
        assert options['authenticatorSelection']['userVerification'] == 'required'

    def test_a_device_already_registered_is_excluded(self, app, client):
        uid = make_user(app)
        registered = enroll_passkey(uid)

        options = self._begin(client, uid, confirmed=True).get_json()['options']

        assert [c['id'] for c in options['excludeCredentials']] == [b64url(registered.credential_id)]

    def test_a_challenge_issued_to_another_user_is_refused(self, app, client):
        owner = make_user(app, email='owner@mariam.app')
        intruder = make_user(app, email='intruder@mariam.app')
        begin = self._begin(client, owner).get_json()

        res = self._complete(client, intruder, begin, new_authenticator().register(begin['options']))

        assert res.status_code == 403
        assert res.get_json()['code'] == 'challenge_invalid'
        assert Passkey.query.count() == 0

    def test_an_account_with_a_factor_starts_from_a_confirmed_session(self, app, client):
        uid = make_user(app)
        enable_totp(uid)

        res = self._begin(client, uid)

        assert res.status_code == 403
        assert res.get_json()['code'] == 'step_up_required'

    def test_a_confirmed_session_adds_a_factor_to_an_account_that_has_one(self, app, client):
        uid = make_user(app)
        enable_totp(uid)
        begin = self._begin(client, uid, confirmed=True).get_json()

        res = self._complete(
            client, uid, begin, new_authenticator().register(begin['options']), confirmed=True
        )

        assert res.status_code == 201
        assert Passkey.query.filter_by(user_id=uid).count() == 1

    def test_a_challenge_obtained_unconfirmed_ends_with_the_first_factor(self, app, client):
        uid = make_user(app)
        begin = self._begin(client, uid).get_json()
        enable_totp(uid)

        res = self._complete(client, uid, begin, new_authenticator().register(begin['options']))

        assert res.status_code == 403
        assert res.get_json()['code'] == 'step_up_required'
        assert Passkey.query.count() == 0

    def test_a_challenge_registers_one_passkey(self, app, client, revocations):
        uid = make_user(app)
        begin = self._begin(client, uid).get_json()
        self._complete(client, uid, begin, new_authenticator().register(begin['options']))

        res = self._complete(
            client, uid, begin, new_authenticator().register(begin['options']), confirmed=True
        )

        assert res.status_code == 403
        assert res.get_json()['code'] == 'challenge_invalid'
        assert Passkey.query.filter_by(user_id=uid).count() == 1

    def test_a_refused_attestation_does_not_say_why(self, app, client):
        uid = make_user(app)
        begin = self._begin(client, uid).get_json()
        credential = new_authenticator().register(begin['options'])
        credential['response']['clientDataJSON'] = b64url(b'{"type": "webauthn.get"}')

        res = self._complete(client, uid, begin, credential)

        assert res.status_code == 403
        assert res.get_json()['detail'] == "La passkey n'a pas pu être vérifiée."
        assert Passkey.query.count() == 0


class TestManagement:
    def _rename(self, client, user_id, passkey_id, name):
        return client.patch(
            f'/v1/user/passkeys/{passkey_id}',
            headers=session_headers(user_id),
            json={'device_name': name},
        )

    def test_the_list_shows_the_users_passkeys(self, app, client):
        uid = make_user(app)
        enroll_passkey(uid)
        enroll_passkey(make_user(app, email='other@mariam.app'))

        body = client.get('/v1/user/passkeys', headers=session_headers(uid)).get_json()

        assert [passkey['device_name'] for passkey in body['items']] == ['Test device']

    def test_a_passkey_is_renamed_and_the_change_audited(self, app, client):
        uid = make_user(app)
        enroll_passkey(uid)

        res = self._rename(client, uid, Passkey.query.one().id, 'Téléphone pro')

        assert res.get_json()['device_name'] == 'Téléphone pro'
        assert Passkey.query.one().device_name == 'Téléphone pro'
        assert AuditLog.query.filter_by(action=AuditLog.ACTION_PASSKEY_RENAMED).count() == 1

    def test_spaces_are_trimmed(self, app, client):
        uid = make_user(app)
        enroll_passkey(uid)

        self._rename(client, uid, Passkey.query.one().id, '  Téléphone   pro ')

        assert Passkey.query.one().device_name == 'Téléphone pro'

    @pytest.mark.parametrize('name', ['   ', 'x' * 101])
    def test_a_blank_or_long_name_is_refused_with_a_pointer(self, app, client, name):
        uid = make_user(app)
        enroll_passkey(uid)

        res = self._rename(client, uid, Passkey.query.one().id, name)

        assert res.status_code == 422
        assert [issue['pointer'] for issue in res.get_json()['errors']] == ['/device_name']
        assert Passkey.query.one().device_name == 'Test device'

    def test_another_users_passkey_is_out_of_reach(self, app, client):
        enroll_passkey(make_user(app, email='owner@mariam.app'))
        intruder = make_user(app, email='intruder@mariam.app')
        enable_totp(intruder)
        passkey_id = Passkey.query.one().id

        assert self._rename(client, intruder, passkey_id, 'Mine').get_json()['code'] == (
            'passkey_not_found'
        )
        assert client.delete(
            f'/v1/user/passkeys/{passkey_id}', headers=session_headers(intruder, confirmed=True)
        ).status_code == 404
        assert Passkey.query.count() == 1

    def test_removing_a_passkey_needs_a_confirmed_session(self, app, client):
        uid = make_user(app)
        enable_totp(uid)
        enroll_passkey(uid)

        res = client.delete(
            f'/v1/user/passkeys/{Passkey.query.one().id}', headers=session_headers(uid)
        )

        assert res.get_json()['code'] == 'step_up_required'
        assert Passkey.query.count() == 1

    def test_the_last_passkey_cannot_go_without_totp(self, app, client):
        uid = make_user(app)
        enroll_passkey(uid)

        res = client.delete(
            f'/v1/user/passkeys/{Passkey.query.one().id}',
            headers=session_headers(uid, confirmed=True),
        )

        assert res.get_json()['code'] == 'last_second_factor'
        assert Passkey.query.count() == 1

    def test_a_passkey_goes_when_totp_remains(self, app, client):
        uid = make_user(app)
        enable_totp(uid)
        enroll_passkey(uid)

        res = client.delete(
            f'/v1/user/passkeys/{Passkey.query.one().id}',
            headers=session_headers(uid, confirmed=True),
        )

        assert res.status_code == 204
        assert Passkey.query.count() == 0
        assert AuditLog.query.filter_by(action=AuditLog.ACTION_PASSKEY_DELETED).count() == 1
