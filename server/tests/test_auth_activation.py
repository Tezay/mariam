import pyotp
import pytest
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models import ActivationLink, AuditLog, Organization, Passkey, User
from conftest import make_restaurant, make_user
from tests.auth_support import (
    enroll_passkey,
    invite_link,
    new_authenticator,
    reset_link,
    session_headers,
)

STRONG_PASSWORD = 'NewAccount123!'


def _activate(client, token, **overrides):
    body = {
        'token': token,
        'password': STRONG_PASSWORD,
        'email': 'new@mariam.app',
        'username': 'Newcomer',
        **overrides,
    }
    return client.post('/v1/auth/activate', json=body)


def _activated(client, email='new@mariam.app'):
    setup = _activate(client, invite_link(), email=email).get_json()['mfa_setup']
    return setup['user_id'], setup['secret'], setup['setup_token']


class TestLinkCheck:
    def test_a_valid_invitation_is_described(self, app, client):
        token = invite_link('new@mariam.app', role='admin')

        body = client.get(f'/v1/auth/check-activation/{token}').get_json()

        assert body == {
            'valid': True, 'link_type': 'invite', 'email': 'new@mariam.app', 'role': 'admin',
            'restaurant_name': None, 'organization_name': None,
        }

    def test_the_destination_is_named(self, app, client):
        org = Organization(name='CROUS Test', slug='crous-test')
        db.session.add(org)
        db.session.commit()
        rid = make_restaurant(app, name='RU Central')
        link = ActivationLink.create_invite_link(restaurant_id=rid, organization_id=org.id)
        db.session.add(link)
        db.session.commit()

        body = client.get(f'/v1/auth/check-activation/{link.token}').get_json()

        assert (body['restaurant_name'], body['organization_name']) == ('RU Central', 'CROUS Test')
        assert body['email'] is None

    def test_an_unknown_link_is_not_found(self, app, client):
        assert client.get('/v1/auth/check-activation/nope').status_code == 404

    def test_a_used_link_is_refused(self, app, client):
        token = invite_link('new@mariam.app')
        _activate(client, token)

        assert client.get(f'/v1/auth/check-activation/{token}').status_code == 400

    def test_a_revoked_link_is_refused(self, app, client):
        token = invite_link()
        ActivationLink.query.filter_by(token=token).one().revoke()
        db.session.commit()

        assert client.get(f'/v1/auth/check-activation/{token}').status_code == 400

    def test_a_reset_link_is_not_an_invitation(self, app, client):
        make_user(app, email='owner@mariam.app')

        res = client.get(f"/v1/auth/check-activation/{reset_link('owner@mariam.app')}")

        assert res.status_code == 404


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
        token = invite_link()

        res = _activate(client, token, email='Taken@Mariam.app')

        assert res.status_code == 409
        assert ActivationLink.query.filter_by(token=token).one().used_at is None

    def test_the_invitee_chooses_the_address(self, app, client):
        res = _activate(client, invite_link('suggested@mariam.app'), email='chosen@mariam.app')

        assert res.status_code == 201
        assert User.query.filter_by(email='chosen@mariam.app').count() == 1
        assert User.query.filter_by(email='suggested@mariam.app').count() == 0

    def test_an_invitation_without_address_needs_one_from_the_invitee(self, app, client):
        res = client.post('/v1/auth/activate', json={
            'token': invite_link(), 'password': STRONG_PASSWORD, 'username': 'Newcomer',
        })

        assert res.status_code == 422
        assert User.query.count() == 0

    def test_the_address_is_stored_lowercase_and_signs_in_either_way(self, app, client):
        _activate(client, invite_link(), email='  Jean.Dupont@Mariam.App ')

        res = client.post('/v1/auth/login', json={
            'email': 'JEAN.DUPONT@mariam.app', 'password': STRONG_PASSWORD,
        })

        assert User.query.one().email == 'jean.dupont@mariam.app'
        assert res.status_code == 200

    @pytest.mark.parametrize('email', ['jéan@mariam.app', 'jean@mariаm.app', f"{'a' * 120}@m.app"])
    def test_an_address_outside_ascii_or_too_long_is_refused(self, app, client, email):
        res = _activate(client, invite_link(), email=email)

        assert res.status_code == 422
        assert User.query.count() == 0

    @pytest.mark.parametrize('name', ['Jean Dupont', "Anne-Marie O'Neil", 'Zoë', 'J. Dupont', 'Юлия'])
    def test_a_display_name_made_of_letters_is_kept(self, app, client, name):
        res = _activate(client, invite_link(), username=f'  {name}  ')

        assert res.status_code == 201
        assert User.query.one().username == name

    @pytest.mark.parametrize(
        'name', [None, '', 'J', 'x' * 51, 'jean@mariam.app', 'Agent 007', 'Jean²', '-Jean']
    )
    def test_a_missing_or_malformed_display_name_is_refused(self, app, client, name):
        res = _activate(client, invite_link(), username=name)

        assert res.status_code == 422
        assert User.query.count() == 0

    def test_a_revoked_link_creates_nothing(self, app, client):
        token = invite_link()
        ActivationLink.query.filter_by(token=token).one().revoke()
        db.session.commit()

        assert _activate(client, token).status_code == 400
        assert User.query.count() == 0

    def test_a_link_works_once(self, app, client):
        token = invite_link()
        _activate(client, token)

        res = _activate(client, token, email='second@mariam.app')

        assert res.status_code == 400
        assert User.query.count() == 1

    def test_a_reset_link_creates_no_account(self, app, client):
        make_user(app, email='owner@mariam.app')

        res = _activate(client, reset_link('owner@mariam.app'), email='intruder@mariam.app')

        assert res.status_code == 404
        assert User.query.filter_by(email='intruder@mariam.app').count() == 0

    def test_the_role_and_the_tenant_come_from_the_link(self, app, client):
        rid = make_restaurant(app)
        link = ActivationLink.create_invite_link(role='reader', restaurant_id=rid)
        db.session.add(link)
        db.session.commit()

        _activate(client, link.token, role='admin', restaurant_id=rid + 1)

        user = User.query.one()
        assert (user.role, user.restaurant_id) == ('reader', rid)

    def test_the_audit_entry_ties_the_account_to_its_invitation(self, app, client):
        inviter = make_user(app)
        link = ActivationLink.create_invite_link('suggested@mariam.app', created_by_id=inviter)
        db.session.add(link)
        db.session.commit()

        _activate(client, link.token, email='chosen@mariam.app')

        entry = AuditLog.query.filter_by(action=AuditLog.ACTION_ACCOUNT_ACTIVATE).one()
        assert entry.target_id == User.query.filter_by(email='chosen@mariam.app').one().id
        assert entry.get_details() == {
            'email': 'chosen@mariam.app',
            'invited_email': 'suggested@mariam.app',
            'role': 'editor',
            'link_type': 'invite',
            'invitation_id': link.id,
            'invited_by': inviter,
        }


class TestStoredAddress:
    def test_the_model_normalizes_what_no_schema_saw(self, app):
        uid = make_user(app, email='  Mixed.Case@Mariam.App ')

        assert db.session.get(User, uid).email == 'mixed.case@mariam.app'

    @pytest.mark.parametrize(
        'email', ['', '   ', 'no-at-sign', 'two words@mariam.app', 'line\nbreak@mariam.app']
    )
    def test_a_malformed_address_is_not_storable(self, app, email):
        with pytest.raises(ValueError):
            User(email=email)

    def test_the_database_refuses_an_uppercase_address(self, app):
        uid = make_user(app)

        with pytest.raises(IntegrityError):
            db.session.execute(
                db.text("UPDATE users SET email = 'Admin@mariam.app' WHERE id = :id"), {'id': uid}
            )
        db.session.rollback()

    @pytest.mark.parametrize('email', ['rené@mariam.app', 'two words@mariam.app', 'no-at-sign'])
    def test_the_database_refuses_an_address_outside_the_stored_shape(self, app, email):
        uid = make_user(app)

        with pytest.raises(IntegrityError):
            db.session.execute(
                db.text('UPDATE users SET email = :email WHERE id = :id'),
                {'email': email, 'id': uid},
            )
        db.session.rollback()


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

    def test_the_setup_token_enrols_a_first_factor_only(self, app, client):
        user_id, secret, setup_token = _activated(client)
        enroll_passkey(user_id)

        res = client.post('/v1/auth/mfa/verify-setup', json={
            'user_id': user_id, 'code': pyotp.TOTP(secret).now(), 'setup_token': setup_token,
        })

        assert res.status_code == 400
        assert 'access_token' not in res.get_json()
        assert not db.session.get(User, user_id).mfa_enabled

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

    def test_the_setup_token_enrols_a_first_factor_only(self, app, client):
        user_id, _, setup_token = _activated(client)
        enroll_passkey(user_id)

        assert self._begin(client, user_id, setup_token).status_code == 400

    def test_a_challenge_obtained_before_the_first_factor_registers_nothing_after_it(
        self, app, client
    ):
        user_id, _, setup_token = _activated(client)
        begin = self._begin(client, user_id, setup_token).get_json()
        enroll_passkey(user_id)

        res = self._complete(
            client, user_id, begin['challenge_token'], new_authenticator().register(begin['options'])
        )

        assert res.status_code == 400
        assert Passkey.query.filter_by(user_id=user_id).count() == 1

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

        assert res.status_code == 400
        assert Passkey.query.filter_by(user_id=victim_id).count() == 1

    def test_a_challenge_from_another_ceremony_is_refused(self, app, client):
        user_id, _, _ = _activated(client)
        begin = client.post(
            '/v1/auth/passkey/register/begin', headers=session_headers(user_id)
        ).get_json()

        res = self._complete(
            client, user_id, begin['challenge_token'], new_authenticator().register(begin['options'])
        )

        assert res.status_code == 401
        assert Passkey.query.filter_by(user_id=user_id).count() == 0
