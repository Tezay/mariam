"""
Tests de gestion des utilisateurs : création, rôles, désactivation.
Seul un admin peut gérer les autres utilisateurs.
"""
from datetime import timedelta

from app.extensions import db
from app.models import ActivationLink, AuditLog, User
from app.utils.time import utc_now_naive
from conftest import make_restaurant, make_user, get_token, auth_headers, TEST_PASSWORD
from tests.auth_support import (
    enable_totp,
    enroll_passkey,
    identity_proof,
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
        make_user(app, role='admin')
        token = get_token(client)
        res = client.post('/v1/users/invite',
                          json={'email': 'newuser@test.com', 'role': 'editor'},
                          headers=auth_headers(token))
        assert res.status_code in (200, 201)
        data = res.get_json()
        assert 'invitation' in data
        assert 'token' in data['invitation']

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
        make_user(app, role='admin', email='admin@mariam.app')
        token = get_token(client)
        res = client.post('/v1/users/invite',
                          json={'email': 'admin@mariam.app', 'role': 'editor'},
                          headers=auth_headers(token))
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
        make_user(app)

        res = client.post(
            '/v1/users/invite', json={'role': 'editor'}, headers=auth_headers(get_token(client))
        )

        assert res.status_code == 201
        assert res.get_json()['invitation']['email'] is None
        assert ActivationLink.query.one().email is None

    def test_a_suggested_address_is_stored_lowercase(self, app, client):
        make_user(app)

        client.post(
            '/v1/users/invite',
            json={'email': 'New.User@Test.com', 'role': 'editor'},
            headers=auth_headers(get_token(client)),
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


class TestSecondFactorReset:
    def _reset(self, client, admin_id, target_id, proof=None):
        headers = session_headers(admin_id)
        if proof:
            headers['X-Step-Up-Token'] = proof
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

        res = self._reset(client, admin, target, identity_proof(client, admin))

        assert res.status_code == 200
        user = db.session.get(User, target)
        assert (user.mfa_enabled, user.passkeys.count(), user.is_active) == (False, 0, True)
        assert not is_signed_in(client, session)
        assert ActivationLink.query.count() == 0

    def test_it_is_audited_against_the_target(self, app, client, revocations):
        admin = make_user(app)
        target = self._protected_target(app)

        self._reset(client, admin, target, identity_proof(client, admin))

        entry = AuditLog.query.filter_by(action=AuditLog.ACTION_MFA_DISABLED).one()
        assert (entry.user_id, entry.target_id) == (admin, target)
        assert entry.get_details() == {'totp_removed': True, 'passkeys_removed': 1}

    def test_it_requires_a_proof_of_identity(self, app, client):
        admin = make_user(app)
        target = self._protected_target(app)

        res = self._reset(client, admin, target)

        assert res.status_code == 403
        assert res.get_json()['step_up_required'] is True
        assert db.session.get(User, target).mfa_enabled is True

    def test_a_proof_serves_once(self, app, client, revocations):
        admin = make_user(app)
        first = self._protected_target(app)
        second = make_user(app, role='editor', email='second@mariam.app')
        enable_totp(second)
        proof = identity_proof(client, admin)
        self._reset(client, admin, first, proof)

        res = self._reset(client, admin, second, proof)

        assert res.status_code == 403
        assert db.session.get(User, second).mfa_enabled is True

    def test_an_admin_cannot_reset_its_own(self, app, client, revocations):
        admin = make_user(app)
        proof = identity_proof(client, admin)

        res = self._reset(client, admin, admin, proof)

        assert res.status_code == 400
        assert db.session.get(User, admin).mfa_enabled is True

    def test_the_rescue_account_is_left_alone(self, app, client, revocations):
        admin = make_user(app)
        target = self._protected_target(app)
        db.session.get(User, target).is_rescue_account = True
        db.session.commit()

        res = self._reset(client, admin, target, identity_proof(client, admin))

        assert res.status_code == 403
        assert db.session.get(User, target).mfa_enabled is True


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

    def _token(self, app, user_id):
        """Mint a session directly: password login stops at the 2FA step."""
        from flask_jwt_extended import create_access_token
        with app.app_context():
            return create_access_token(identity=str(user_id))

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

        res = client.delete('/v1/auth/mfa', headers=auth_headers(self._token(app, uid)))

        assert res.status_code == 409
        assert db.session.get(User, uid).mfa_enabled is True

    def test_the_last_passkey_cannot_go_without_totp(self, app, client):
        make_restaurant(app)
        uid = make_user(app)
        passkey_id = self._with_passkey(uid)

        res = client.delete(
            f'/v1/auth/passkey/{passkey_id}', headers=auth_headers(self._token(app, uid))
        )

        assert res.status_code == 409

    def test_a_passkey_goes_when_another_factor_remains(self, app, client):
        from app.extensions import db
        from app.models import User
        make_restaurant(app)
        uid = make_user(app)
        passkey_id = self._with_passkey(uid)
        db.session.get(User, uid).mfa_enabled = True
        db.session.commit()

        res = client.delete(
            f'/v1/auth/passkey/{passkey_id}', headers=auth_headers(self._token(app, uid))
        )

        assert res.status_code == 200
