"""
Tests de gestion des utilisateurs : création, rôles, désactivation.
Seul un admin peut gérer les autres utilisateurs.
"""
from datetime import timedelta

from app.extensions import db
from app.models import ActivationLink, AuditLog, Organization, Restaurant, User
from app.utils.time import utc_now_naive
from conftest import make_restaurant, make_user, get_token, auth_headers, TEST_PASSWORD
from tests.auth_support import (
    confirmed_headers,
    enable_totp,
    enroll_passkey,
    is_signed_in,
    issue_session,
    session_headers,
)


class TestListUsers:
    def test_list_users_requires_auth(self, client):
        res = client.get('/v1/users')
        assert res.status_code == 401

    def test_list_users_requires_admin(self, app, client):
        make_restaurant(app)
        make_user(app, role='reader')
        token = get_token(client)
        res = client.get('/v1/users', headers=auth_headers(token))
        assert res.status_code == 403

    def test_list_users_as_admin(self, app, client):
        make_restaurant(app)
        make_user(app, role='admin')
        token = get_token(client)
        res = client.get('/v1/users', headers=auth_headers(token))
        assert res.status_code == 200
        users = res.get_json()['users']
        assert isinstance(users, list)
        assert len(users) >= 1


class TestInviteUser:
    def test_invite_creates_activation_link(self, app, client):
        make_restaurant(app)
        admin = make_user(app, role='admin')
        res = client.post('/v1/users/invite',
                          json={'email': 'newuser@test.com', 'role': 'editor'},
                          headers=confirmed_headers(client, admin))
        assert res.status_code in (200, 201)
        data = res.get_json()
        assert 'invitation' in data
        assert 'token' in data['invitation']

    def test_invite_requires_a_confirmed_session(self, app, client):
        make_restaurant(app)
        admin = make_user(app, role='admin')
        enable_totp(admin)

        res = client.post(
            '/v1/users/invite', json={'role': 'admin'}, headers=session_headers(admin)
        )

        assert res.status_code == 403
        assert res.get_json()['step_up_required'] is True
        assert ActivationLink.query.count() == 0

    def test_invite_requires_admin(self, app, client):
        make_restaurant(app)
        make_user(app, role='editor')
        token = get_token(client)
        res = client.post('/v1/users/invite',
                          json={'email': 'test@test.com', 'role': 'reader'},
                          headers=auth_headers(token))
        assert res.status_code == 403

    def test_invite_duplicate_email(self, app, client):
        make_restaurant(app)
        admin = make_user(app, role='admin', email='admin@mariam.app')
        res = client.post('/v1/users/invite',
                          json={'email': 'admin@mariam.app', 'role': 'editor'},
                          headers=confirmed_headers(client, admin))
        assert res.status_code in (400, 409)


class TestInvitations:
    def _site_link(self, restaurant_id, **state):
        link = ActivationLink.create_invite_link(restaurant_id=restaurant_id)
        for field, value in state.items():
            setattr(link, field, value)
        db.session.add(link)
        db.session.commit()
        return link.id

    def test_an_invitation_needs_no_address(self, app, client):
        admin = make_user(app)

        res = client.post(
            '/v1/users/invite', json={'role': 'editor'}, headers=confirmed_headers(client, admin)
        )

        assert res.status_code == 201
        assert res.get_json()['invitation']['email'] is None
        assert ActivationLink.query.one().email is None

    def test_a_suggested_address_is_stored_lowercase(self, app, client):
        admin = make_user(app)

        client.post(
            '/v1/users/invite',
            json={'email': 'New.User@Test.com', 'role': 'editor'},
            headers=confirmed_headers(client, admin),
        )

        assert ActivationLink.query.one().email == 'new.user@test.com'

    def test_the_list_holds_only_pending_invitations(self, app, client):
        admin = make_user(app)
        rid = db.session.get(User, admin).restaurant_id
        now = utc_now_naive()
        pending = self._site_link(rid, created_by_id=admin)
        self._site_link(rid, used_at=now)
        self._site_link(rid, revoked_at=now)
        self._site_link(rid, expires_at=now - timedelta(minutes=1))

        res = client.get('/v1/users/invitations', headers=auth_headers(get_token(client)))

        (listed,) = res.get_json()['invitations']
        assert listed['id'] == pending
        assert listed['created_by_name'] == 'admin'

    def test_revoking_stops_the_link_and_is_audited(self, app, client):
        admin = make_user(app)
        link_id = self._site_link(db.session.get(User, admin).restaurant_id)
        token = db.session.get(ActivationLink, link_id).token

        res = client.delete(
            f'/v1/users/invitations/{link_id}', headers=auth_headers(get_token(client))
        )

        assert res.status_code == 200
        assert db.session.get(ActivationLink, link_id).revoked_at is not None
        assert client.get(f'/v1/auth/check-activation/{token}').status_code == 400
        entry = AuditLog.query.filter_by(action=AuditLog.ACTION_ACTIVATION_LINK_REVOKE).one()
        assert (entry.user_id, entry.target_id) == (admin, link_id)

    def test_a_spent_invitation_cannot_be_revoked(self, app, client):
        admin = make_user(app)
        link_id = self._site_link(
            db.session.get(User, admin).restaurant_id, used_at=utc_now_naive()
        )

        res = client.delete(
            f'/v1/users/invitations/{link_id}', headers=auth_headers(get_token(client))
        )

        assert res.status_code == 404
        assert db.session.get(ActivationLink, link_id).revoked_at is None

    def test_revoking_requires_admin(self, app, client):
        editor = make_user(app, role='editor')
        link_id = self._site_link(db.session.get(User, editor).restaurant_id)

        res = client.delete(
            f'/v1/users/invitations/{link_id}', headers=auth_headers(get_token(client))
        )

        assert res.status_code == 403
        assert db.session.get(ActivationLink, link_id).revoked_at is None


class TestInvitationByEmail:
    def _invite(self, client, inviter_id, **body):
        return client.post(
            '/v1/users/invite',
            json={'role': 'editor', **body},
            headers=confirmed_headers(client, inviter_id),
        )

    def _named_admin(self, app, **restaurant):
        make_restaurant(app, **restaurant)
        admin = make_user(app)
        db.session.get(User, admin).username = 'Jean Dupont'
        db.session.commit()
        return admin

    def test_it_reaches_the_address_and_says_who_invites_where_and_as_what(self, app, client, smtp):
        admin = self._named_admin(app, name='Resto U Créteil')

        res = self._invite(client, admin, email='new@mariam.app', send_email=True)

        assert res.status_code == 201
        body = res.get_json()
        assert body['invitation']['emailed'] is True
        (message,) = smtp.sent
        text = message.get_body(('plain',)).get_content()
        assert message['To'] == 'new@mariam.app'
        assert message['Subject'] == 'Jean Dupont vous invite sur Mariam'
        assert (
            "Jean Dupont vous invite à rejoindre Resto U Créteil sur Mariam, en tant qu'éditeur."
            in text
        )
        assert f"/activate/{body['invitation']['token']}" in text

    def test_the_pending_list_tells_which_invitations_were_emailed(self, app, client, smtp):
        admin = self._named_admin(app)
        self._invite(client, admin, email='mailed@mariam.app', send_email=True)
        self._invite(client, admin, email='handed@mariam.app')

        listed = client.get('/v1/users/invitations', headers=session_headers(admin)).get_json()

        assert {row['email']: row['emailed'] for row in listed['invitations']} == {
            'mailed@mariam.app': True, 'handed@mariam.app': False,
        }

    def test_nothing_is_sent_unless_asked(self, app, client, smtp):
        admin = self._named_admin(app)

        res = self._invite(client, admin, email='new@mariam.app')

        assert res.get_json()['invitation']['emailed'] is False
        assert smtp.sent == []

    def test_sending_needs_an_address(self, app, client, smtp):
        admin = self._named_admin(app)

        res = self._invite(client, admin, send_email=True)

        assert res.status_code == 422
        assert ActivationLink.query.count() == 0

    def test_without_mail_the_invitation_is_created_all_the_same(self, app, client):
        admin = self._named_admin(app)

        res = self._invite(client, admin, email='new@mariam.app', send_email=True)

        assert res.status_code == 201
        assert res.get_json()['invitation']['emailed'] is False
        assert ActivationLink.query.filter_by(email='new@mariam.app').count() == 1

    def test_an_administrator_emails_twenty_invitations_a_day(self, app, client, smtp):
        admin = self._named_admin(app)
        headers = confirmed_headers(client, admin)

        emailed = [
            client.post('/v1/users/invite', headers=headers, json={
                'role': 'editor', 'email': f'new{index}@mariam.app', 'send_email': True,
            }).get_json()['invitation']['emailed']
            for index in range(21)
        ]

        assert emailed == [True] * 20 + [False]
        assert (ActivationLink.query.count(), len(smtp.sent)) == (21, 20)

    def test_a_name_can_neither_break_lines_nor_carry_markup(self, app, client, smtp):
        admin = self._named_admin(app, name='Resto\n\n<b>Ignorez</b> la suite de ce message')

        self._invite(client, admin, email='new@mariam.app', send_email=True)

        (message,) = smtp.sent
        text = message.get_body(('plain',)).get_content()
        assert 'rejoindre Resto <b>Ignorez</b> la suite de ce message sur Mariam' in text
        assert '<b>Ignorez' not in message.get_body(('html',)).get_content()

    def test_a_supervisor_invites_to_the_organization(self, app, client, smtp):
        rid = make_restaurant(app)
        org = Organization(name='Crous Créteil', slug='crous-invite')
        db.session.add(org)
        db.session.commit()
        db.session.get(Restaurant, rid).organization_id = org.id
        supervisor = db.session.get(User, make_user(app, role='org_admin'))
        supervisor.restaurant_id = None
        supervisor.organization_id = org.id
        supervisor.username = 'Jeanne Martin'
        db.session.commit()

        res = self._invite(
            client, supervisor.id, role='org_admin', email='new@mariam.app', send_email=True
        )

        assert res.status_code == 201
        text = smtp.sent[0].get_body(('plain',)).get_content()
        assert (
            'Jeanne Martin vous invite à rejoindre Crous Créteil sur Mariam, en tant que superviseur.'
            in text
        )


class TestSecondFactorReset:
    def _reset(self, client, target_id, headers):
        return client.post(f'/v1/users/{target_id}/reset-mfa', headers=headers)

    def _protected_target(self, app):
        target = make_user(app, role='editor', email='target@mariam.app')
        enable_totp(target)
        enroll_passkey(target)
        return target

    def test_it_removes_both_methods_and_ends_the_sessions(self, app, client, revocations):
        admin = make_user(app)
        target = self._protected_target(app)
        session = issue_session(target)

        res = self._reset(client, target, confirmed_headers(client, admin))

        assert res.status_code == 200
        user = db.session.get(User, target)
        assert (user.mfa_enabled, user.passkeys.count(), user.is_active) == (False, 0, True)
        assert not is_signed_in(client, session)
        assert ActivationLink.query.count() == 0

    def test_it_is_audited_against_the_target(self, app, client, revocations):
        admin = make_user(app)
        target = self._protected_target(app)

        self._reset(client, target, confirmed_headers(client, admin))

        entry = AuditLog.query.filter_by(action=AuditLog.ACTION_MFA_DISABLED).one()
        assert (entry.user_id, entry.target_id) == (admin, target)
        assert entry.get_details() == {'totp_removed': True, 'passkeys_removed': 1}

    def test_it_requires_a_confirmed_session(self, app, client):
        admin = make_user(app)
        enable_totp(admin)
        target = self._protected_target(app)

        res = self._reset(client, target, session_headers(admin))

        assert res.status_code == 403
        assert res.get_json()['step_up_required'] is True
        assert db.session.get(User, target).mfa_enabled is True

    def test_an_admin_cannot_reset_its_own(self, app, client, revocations):
        admin = make_user(app)

        res = self._reset(client, admin, confirmed_headers(client, admin))

        assert res.status_code == 400
        assert db.session.get(User, admin).mfa_enabled is True

    def test_the_rescue_account_is_left_alone(self, app, client, revocations):
        admin = make_user(app)
        target = self._protected_target(app)
        db.session.get(User, target).is_rescue_account = True
        db.session.commit()

        res = self._reset(client, target, confirmed_headers(client, admin))

        assert res.status_code == 403
        assert db.session.get(User, target).mfa_enabled is True


class TestPasswordResetLink:
    def _send(self, client, target_id, headers):
        return client.post(f'/v1/users/{target_id}/reset-password', headers=headers)

    def _target(self, app, **account):
        target = make_user(app, role='editor', email='target@mariam.app', **account)
        enable_totp(target)
        return target

    def test_the_link_goes_to_the_account_and_stays_out_of_the_answer(self, app, client, smtp):
        admin = make_user(app)
        target = self._target(app)

        res = self._send(client, target, confirmed_headers(client, admin))

        assert res.status_code == 200
        assert res.get_json() == {
            'message': 'Lien de réinitialisation envoyé', 'emailed': True, 'reset_url': None,
        }
        (message,) = smtp.sent
        assert message['To'] == 'target@mariam.app'
        token = ActivationLink.query.filter_by(link_type='password_reset').one().token
        assert f'/reset-password/{token}' in message.get_body(('plain',)).get_content()
        assert client.get(f'/v1/auth/check-reset/{token}').get_json()['valid'] is True

    def test_without_mail_the_link_is_handed_to_the_administrator(self, app, client):
        admin = make_user(app)
        target = self._target(app)

        body = self._send(client, target, confirmed_headers(client, admin)).get_json()

        assert body['emailed'] is False
        token = body['reset_url'].rsplit('/', 1)[1]
        assert client.get(f'/v1/auth/check-reset/{token}').get_json()['email'] == 'target@mariam.app'

    def test_a_new_link_spends_the_one_before(self, app, client):
        admin = make_user(app)
        target = self._target(app)
        headers = confirmed_headers(client, admin)

        first = self._send(client, target, headers).get_json()['reset_url'].rsplit('/', 1)[1]
        self._send(client, target, headers)

        assert client.get(f'/v1/auth/check-reset/{first}').status_code == 400

    def test_it_is_audited_against_the_target(self, app, client):
        admin = make_user(app)
        target = self._target(app)

        self._send(client, target, confirmed_headers(client, admin))

        entry = AuditLog.query.filter_by(action=AuditLog.ACTION_PASSWORD_RESET_REQUEST).one()
        assert (entry.user_id, entry.target_id) == (admin, target)
        assert entry.get_details() == {'method': 'dashboard'}

    def test_it_requires_a_confirmed_session(self, app, client):
        admin = make_user(app)
        enable_totp(admin)
        target = self._target(app)

        res = self._send(client, target, session_headers(admin))

        assert res.status_code == 403
        assert res.get_json()['step_up_required'] is True
        assert ActivationLink.query.count() == 0

    def test_an_admin_changes_its_own_password_elsewhere(self, app, client):
        admin = make_user(app)

        res = self._send(client, admin, confirmed_headers(client, admin))

        assert res.status_code == 400
        assert ActivationLink.query.count() == 0

    def test_an_account_of_another_site_is_not_found(self, app, client):
        admin = make_user(app)
        elsewhere = make_restaurant(app, name='Autre site', code='RU_OTHER')
        target = self._target(app, restaurant_id=elsewhere)

        res = self._send(client, target, confirmed_headers(client, admin))

        assert res.status_code == 404
        assert ActivationLink.query.count() == 0

    def test_the_rescue_account_is_left_alone(self, app, client):
        admin = make_user(app)
        target = self._target(app)
        db.session.get(User, target).is_rescue_account = True
        db.session.commit()

        assert self._send(client, target, confirmed_headers(client, admin)).status_code == 403

    def test_a_disabled_account_gets_no_link(self, app, client):
        admin = make_user(app)
        target = self._target(app)
        db.session.get(User, target).is_active = False
        db.session.commit()

        assert self._send(client, target, confirmed_headers(client, admin)).status_code == 409
        assert ActivationLink.query.count() == 0

    def test_an_account_without_a_second_factor_gets_no_link(self, app, client):
        admin = make_user(app)
        target = make_user(app, role='editor', email='target@mariam.app')

        res = self._send(client, target, confirmed_headers(client, admin))

        assert res.status_code == 409
        assert 'second facteur' in res.get_json()['error']
        assert ActivationLink.query.count() == 0


class TestDeactivateUser:
    def test_deactivate_user(self, app, client):
        make_restaurant(app)
        make_user(app, role='admin', email='admin@mariam.app')
        editor_id = make_user(app, role='editor', email='editor@test.com')
        token = get_token(client)
        res = client.put(f'/v1/users/{editor_id}',
                           json={'is_active': False},
                           headers=auth_headers(token))
        assert res.status_code in (200, 204)

    def test_a_suspension_ends_the_sessions_for_good(self, app, client):
        make_user(app, role='admin', email='admin@mariam.app')
        editor_id = make_user(app, role='editor', email='editor@test.com')
        session = issue_session(editor_id)
        admin = auth_headers(get_token(client))

        client.put(f'/v1/users/{editor_id}', json={'is_active': False}, headers=admin)
        suspended = is_signed_in(client, session)
        refresh = client.post('/v1/auth/refresh', headers=auth_headers(session['refresh']))
        client.put(f'/v1/users/{editor_id}', json={'is_active': True}, headers=admin)

        assert not suspended
        assert refresh.status_code == 401
        assert not is_signed_in(client, session)

    def test_cannot_deactivate_self(self, app, client):
        make_restaurant(app)
        uid = make_user(app, role='admin')
        token = get_token(client)
        res = client.put(f'/v1/users/{uid}',
                           json={'is_active': False},
                           headers=auth_headers(token))
        assert res.status_code in (400, 403)


class TestRoleManagement:
    def test_change_user_role(self, app, client):
        make_restaurant(app)
        make_user(app, role='admin', email='admin@mariam.app')
        target_id = make_user(app, role='reader', email='reader@test.com')
        token = get_token(client)
        res = client.put(f'/v1/users/{target_id}',
                           json={'role': 'editor'},
                           headers=auth_headers(token))
        assert res.status_code in (200, 204)

    def test_an_admin_cannot_rename_another_account(self, app, client):
        make_user(app, role='admin', email='admin@mariam.app')
        target_id = make_user(app, role='reader', email='reader@test.com')

        res = client.put(
            f'/v1/users/{target_id}',
            json={'username': 'Someone Else'},
            headers=auth_headers(get_token(client)),
        )

        assert res.status_code == 200
        assert db.session.get(User, target_id).username == 'reader'

    def test_invalid_role_silently_ignored(self, app, client):
        """Invalid roles are ignored (role unchanged), not rejected with 4xx."""
        from app.models import User
        from app.extensions import db
        make_restaurant(app)
        make_user(app, role='admin', email='admin@mariam.app')
        target_id = make_user(app, role='reader', email='reader@test.com')
        token = get_token(client)
        res = client.put(f'/v1/users/{target_id}',
                         json={'role': 'superuser'},
                         headers=auth_headers(token))
        assert res.status_code == 200
        # Role must remain unchanged
        user = db.session.get(User, target_id)
        assert user.role == 'reader'


class TestUiPreferences:
    def test_defaults_when_never_set(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)

        res = client.get('/v1/users/me/ui-preferences', headers=auth_headers(token))

        assert res.status_code == 200
        assert res.get_json()['tour_done'] is False

    def test_an_update_is_kept_and_merged(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)

        res = client.put(
            '/v1/users/me/ui-preferences',
            json={'tour_done': True},
            headers=auth_headers(token),
        )

        assert res.status_code == 200
        body = res.get_json()
        assert body['tour_done'] is True
        assert body['tour_catalog_done'] is False

    def test_an_unknown_key_is_ignored(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)

        res = client.put(
            '/v1/users/me/ui-preferences',
            json={'is_admin': True},
            headers=auth_headers(token),
        )

        assert res.status_code == 200
        assert 'is_admin' not in res.get_json()

    def test_preferences_require_a_session(self, client):
        assert client.get('/v1/users/me/ui-preferences').status_code == 401


class TestLastFactorGuard:
    """One 2FA method must always remain active on an account."""

    def _with_passkey(self, user_id, credential=b'cred-1'):
        from app.extensions import db
        from app.models.passkey import Passkey
        db.session.add(Passkey(
            user_id=user_id,
            credential_id=credential,
            public_key=b'key',
            device_name='Test device',
        ))
        db.session.commit()
        return Passkey.query.filter_by(credential_id=credential).first().id

    def test_totp_cannot_go_without_a_passkey(self, app, client):
        from app.extensions import db
        from app.models import User
        make_restaurant(app)
        uid = make_user(app)
        db.session.get(User, uid).mfa_enabled = True
        db.session.commit()

        res = client.delete('/v1/auth/mfa', headers=session_headers(uid, confirmed=True))

        assert res.status_code == 409
        assert db.session.get(User, uid).mfa_enabled is True

    def test_the_last_passkey_cannot_go_without_totp(self, app, client):
        make_restaurant(app)
        uid = make_user(app)
        passkey_id = self._with_passkey(uid)

        res = client.delete(f'/v1/auth/passkey/{passkey_id}', headers=session_headers(uid, confirmed=True))

        assert res.status_code == 409

    def test_a_passkey_goes_when_another_factor_remains(self, app, client):
        from app.extensions import db
        from app.models import User
        make_restaurant(app)
        uid = make_user(app)
        passkey_id = self._with_passkey(uid)
        db.session.get(User, uid).mfa_enabled = True
        db.session.commit()

        res = client.delete(f'/v1/auth/passkey/{passkey_id}', headers=session_headers(uid, confirmed=True))

        assert res.status_code == 200
