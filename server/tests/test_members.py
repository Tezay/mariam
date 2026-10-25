"""Accounts and invitations: a site's by its admin, the supervisors' by the supervisors."""
from datetime import timedelta

from app.extensions import db
from app.models import ActivationLink, AuditLog, Organization, User
from app.utils.time import utc_now_naive
from conftest import auth_headers, get_token, make_restaurant, make_user, site_path
from tests.auth_support import (
    confirmed_headers,
    enable_totp,
    enroll_passkey,
    is_signed_in,
    issue_session,
    session_headers,
)


def _site_admin(app):
    admin = make_user(app)
    return admin, site_path(db.session.get(User, admin).restaurant_id)


def _org(slug='crous-test', name='Crous Créteil'):
    org = Organization(name=name, slug=slug)
    db.session.add(org)
    db.session.commit()
    return org


def _supervisor(org, email='sup@mariam.app', name=None):
    user = db.session.get(User, make_user(None, email=email, role='org_admin', restaurant_id=None))
    user.organization_id = org.id
    user.username = name or user.username
    db.session.commit()
    return user.id


def _site_link(restaurant_id, **state):
    link = ActivationLink.create_invite_link(restaurant_id=restaurant_id)
    for field, value in state.items():
        setattr(link, field, value)
    db.session.add(link)
    db.session.commit()
    return link.id


class TestSiteMembers:
    def test_a_session_is_required(self, app, client):
        _, path = _site_admin(app)
        assert client.get(f'{path}/members').status_code == 401

    def test_only_an_admin_lists_them(self, app, client):
        reader = make_user(app, role='reader')
        path = site_path(db.session.get(User, reader).restaurant_id)

        res = client.get(f'{path}/members', headers=session_headers(reader))

        assert res.status_code == 403

    def test_the_list_holds_the_site_accounts_one_page_at_a_time(self, app, client):
        admin, path = _site_admin(app)
        make_user(app, role='editor', email='editor@mariam.app')
        make_user(app, role='org_admin', email='director@mariam.app')

        res = client.get(f'{path}/members?per_page=1', headers=session_headers(admin))

        body = res.get_json()
        assert body['total_count'] == 2
        assert len(body['items']) == 1
        assert 'rel="next"' in res.headers['Link']
        assert body['items'][0]['site'] == {'slug': 'ru-auto', 'name': 'RU Test Auto'}

    def test_another_site_is_not_found(self, app, client):
        admin, _ = _site_admin(app)
        elsewhere = make_restaurant(app, name='Autre', code='RU_OTHER')

        res = client.get(f'{site_path(elsewhere)}/members', headers=session_headers(admin))

        assert res.status_code == 404
        assert res.get_json()['code'] == 'site_not_found'

    def test_a_role_changes(self, app, client):
        admin, path = _site_admin(app)
        target = make_user(app, role='reader', email='reader@mariam.app')

        res = client.patch(
            f'{path}/members/{target}', json={'role': 'editor'}, headers=session_headers(admin)
        )

        assert res.get_json()['role'] == 'editor'
        assert db.session.get(User, target).role == 'editor'

    def test_a_role_outside_those_of_a_site_is_refused(self, app, client):
        admin, path = _site_admin(app)
        target = make_user(app, role='reader', email='reader@mariam.app')

        for role in ('superuser', 'org_admin'):
            res = client.patch(
                f'{path}/members/{target}', json={'role': role}, headers=session_headers(admin)
            )
            assert res.status_code == 422
        assert db.session.get(User, target).role == 'reader'

    def test_an_admin_cannot_rename_another_account(self, app, client):
        admin, path = _site_admin(app)
        target = make_user(app, role='reader', email='reader@mariam.app')

        client.patch(
            f'{path}/members/{target}', json={'username': 'Someone Else'},
            headers=session_headers(admin),
        )

        assert db.session.get(User, target).username == 'reader'

    def test_a_suspension_ends_the_sessions_for_good(self, app, client):
        admin, path = _site_admin(app)
        editor = make_user(app, role='editor', email='editor@mariam.app')
        session = issue_session(editor)
        headers = session_headers(admin)

        client.patch(f'{path}/members/{editor}', json={'is_active': False}, headers=headers)
        suspended = is_signed_in(client, session)
        refresh = client.post('/v1/auth/refresh', headers=auth_headers(session['refresh']))
        client.patch(f'{path}/members/{editor}', json={'is_active': True}, headers=headers)

        assert not suspended
        assert refresh.status_code == 401
        assert not is_signed_in(client, session)

    def test_an_admin_keeps_its_own_account(self, app, client):
        admin, path = _site_admin(app)
        headers = confirmed_headers(client, admin)

        answers = [
            client.patch(f'{path}/members/{admin}', json={'is_active': False}, headers=headers),
            client.patch(f'{path}/members/{admin}', json={'role': 'editor'}, headers=headers),
            client.delete(f'{path}/members/{admin}', headers=headers),
        ]

        assert [res.get_json()['code'] for res in answers] == ['own_account'] * 3
        assert db.session.get(User, admin).role == 'admin'

    def test_a_deletion_needs_a_confirmed_session(self, app, client):
        admin, path = _site_admin(app)
        enable_totp(admin)
        target = make_user(app, role='editor', email='editor@mariam.app')

        refused = client.delete(f'{path}/members/{target}', headers=session_headers(admin))
        deleted = client.delete(f'{path}/members/{target}', headers=confirmed_headers(client, admin))

        assert refused.get_json()['code'] == 'step_up_required'
        assert deleted.status_code == 204
        assert db.session.get(User, target) is None

    def test_the_rescue_account_is_left_alone(self, app, client):
        admin, path = _site_admin(app)
        target = make_user(app, role='editor', email='rescue@mariam.app')
        db.session.get(User, target).is_rescue_account = True
        db.session.commit()
        headers = confirmed_headers(client, admin)

        answers = [
            client.patch(f'{path}/members/{target}', json={'is_active': False}, headers=headers),
            client.delete(f'{path}/members/{target}', headers=headers),
        ]

        assert [res.get_json()['code'] for res in answers] == ['rescue_account'] * 2
        assert db.session.get(User, target).is_active is True

    def test_a_supervisor_reads_them_but_never_changes_them(self, app, client):
        org = _org()
        rid = make_restaurant(None, name='RU Nord', code='RU_NORD', organization_id=org.id)
        target = make_user(None, role='editor', email='editor@mariam.app', restaurant_id=rid)
        headers = confirmed_headers(client, _supervisor(org))
        path = site_path(rid)

        listed = client.get(f'{path}/members', headers=headers)
        answers = [
            client.patch(f'{path}/members/{target}', json={'is_active': False}, headers=headers),
            client.delete(f'{path}/members/{target}', headers=headers),
            client.post(f'{path}/invitations', json={'role': 'editor'}, headers=headers),
        ]

        assert [m['email'] for m in listed.get_json()['items']] == ['editor@mariam.app']
        assert [res.get_json()['code'] for res in answers] == ['supervisor_read_only'] * 3
        assert db.session.get(User, target).is_active is True

    def test_a_supervisor_reads_no_site_invitation(self, app, client):
        org = _org()
        rid = make_restaurant(None, name='RU Nord', code='RU_NORD', organization_id=org.id)
        token = db.session.get(ActivationLink, _site_link(rid)).token

        res = client.get(
            f'{site_path(rid)}/invitations', headers=session_headers(_supervisor(org))
        )

        assert res.get_json()['code'] == 'supervisor_read_only'
        assert token not in res.get_data(as_text=True)


class TestOrgMembers:
    def test_a_supervisor_lists_every_account_of_the_organization(self, app, client):
        org = _org()
        rid = make_restaurant(None, name='RU Nord', code='RU_NORD', organization_id=org.id)
        make_user(None, role='editor', email='editor@mariam.app', restaurant_id=rid)
        supervisor = _supervisor(org)
        outsider = make_restaurant(None, name='Ailleurs', code='RU_OUT')
        make_user(None, role='admin', email='outsider@mariam.app', restaurant_id=outsider)

        res = client.get(f'/v1/orgs/{org.slug}/members', headers=session_headers(supervisor))

        assert {m['email']: m['site'] for m in res.get_json()['items']} == {
            'editor@mariam.app': {'slug': 'ru-nord', 'name': 'RU Nord'},
            'sup@mariam.app': None,
        }

    def test_a_site_admin_reaches_none_of_it(self, app, client):
        admin, _ = _site_admin(app)

        res = client.get('/v1/orgs/test-org/members', headers=session_headers(admin))

        assert res.get_json()['code'] == 'supervisor_required'

    def test_another_organization_is_not_found(self, app, client):
        supervisor = _supervisor(_org())
        other = _org(slug='other', name='Autre')

        res = client.get(f'/v1/orgs/{other.slug}/members', headers=session_headers(supervisor))

        assert res.get_json()['code'] == 'org_not_found'

    def test_a_supervisor_turns_another_off_but_no_site_account(self, app, client):
        org = _org()
        rid = make_restaurant(None, name='RU Nord', code='RU_NORD', organization_id=org.id)
        editor = make_user(None, role='editor', email='editor@mariam.app', restaurant_id=rid)
        peer = _supervisor(org, email='peer@mariam.app')
        headers = session_headers(_supervisor(org))
        path = f'/v1/orgs/{org.slug}/members'

        turned_off = client.patch(f'{path}/{peer}', json={'is_active': False}, headers=headers)
        refused = client.patch(f'{path}/{editor}', json={'is_active': False}, headers=headers)

        assert turned_off.get_json()['is_active'] is False
        assert refused.get_json()['code'] == 'supervisor_read_only'
        assert db.session.get(User, editor).is_active is True


class TestInvitations:
    def test_an_invitation_needs_no_address(self, app, client):
        admin, path = _site_admin(app)

        res = client.post(
            f'{path}/invitations', json={'role': 'editor'}, headers=confirmed_headers(client, admin)
        )

        assert res.status_code == 201
        assert res.get_json()['email'] is None
        assert ActivationLink.query.one().restaurant_id == db.session.get(User, admin).restaurant_id

    def test_it_needs_a_confirmed_session(self, app, client):
        admin, path = _site_admin(app)
        enable_totp(admin)

        res = client.post(f'{path}/invitations', json={'role': 'admin'}, headers=session_headers(admin))

        assert res.get_json()['code'] == 'step_up_required'
        assert ActivationLink.query.count() == 0

    def test_it_needs_an_admin(self, app, client):
        editor = make_user(app, role='editor')
        path = site_path(db.session.get(User, editor).restaurant_id)

        res = client.post(
            f'{path}/invitations', json={'role': 'reader'}, headers=confirmed_headers(client, editor)
        )

        assert res.status_code == 403

    def test_a_site_invites_none_but_its_own_roles(self, app, client):
        admin, path = _site_admin(app)

        res = client.post(
            f'{path}/invitations', json={'role': 'org_admin'},
            headers=confirmed_headers(client, admin),
        )

        assert res.status_code == 422

    def test_an_address_in_use_is_refused(self, app, client):
        admin, path = _site_admin(app)

        res = client.post(
            f'{path}/invitations', json={'email': 'admin@mariam.app', 'role': 'editor'},
            headers=confirmed_headers(client, admin),
        )

        assert res.get_json()['code'] == 'email_taken'

    def test_a_suggested_address_is_stored_lowercase(self, app, client):
        admin, path = _site_admin(app)

        client.post(
            f'{path}/invitations', json={'email': 'New.User@Test.com', 'role': 'editor'},
            headers=confirmed_headers(client, admin),
        )

        assert ActivationLink.query.one().email == 'new.user@test.com'

    def test_the_list_holds_only_pending_invitations(self, app, client):
        admin, path = _site_admin(app)
        rid = db.session.get(User, admin).restaurant_id
        now = utc_now_naive()
        pending = _site_link(rid, created_by_id=admin)
        _site_link(rid, used_at=now)
        _site_link(rid, revoked_at=now)
        _site_link(rid, expires_at=now - timedelta(minutes=1))

        res = client.get(f'{path}/invitations', headers=session_headers(admin))

        (listed,) = res.get_json()['items']
        assert (listed['id'], listed['created_by_name']) == (pending, 'admin')

    def test_revoking_stops_the_link_and_is_audited(self, app, client):
        admin, path = _site_admin(app)
        link_id = _site_link(db.session.get(User, admin).restaurant_id)
        token = db.session.get(ActivationLink, link_id).token

        res = client.delete(f'{path}/invitations/{link_id}', headers=session_headers(admin))

        assert res.status_code == 204
        assert client.get(f'/v1/auth/check-activation/{token}').status_code == 400
        entry = AuditLog.query.filter_by(action=AuditLog.ACTION_ACTIVATION_LINK_REVOKE).one()
        assert (entry.user_id, entry.target_id) == (admin, link_id)

    def test_a_spent_invitation_cannot_be_revoked(self, app, client):
        admin, path = _site_admin(app)
        link_id = _site_link(db.session.get(User, admin).restaurant_id, used_at=utc_now_naive())

        res = client.delete(f'{path}/invitations/{link_id}', headers=session_headers(admin))

        assert res.get_json()['code'] == 'invitation_not_found'
        assert db.session.get(ActivationLink, link_id).revoked_at is None

    def test_a_supervisor_invites_supervisors_under_the_organization(self, app, client):
        org = _org()
        supervisor = _supervisor(org)
        headers = confirmed_headers(client, supervisor)

        res = client.post(f'/v1/orgs/{org.slug}/invitations', json={}, headers=headers)
        listed = client.get(f'/v1/orgs/{org.slug}/invitations', headers=headers)

        link = ActivationLink.query.one()
        assert res.get_json()['role'] == 'org_admin'
        assert (link.restaurant_id, link.organization_id) == (None, org.id)
        assert [row['id'] for row in listed.get_json()['items']] == [link.id]

    def test_a_site_admin_invites_no_supervisor(self, app, client):
        admin, _ = _site_admin(app)

        res = client.post(
            '/v1/orgs/test-org/invitations', json={}, headers=confirmed_headers(client, admin)
        )

        assert res.get_json()['code'] == 'supervisor_required'
        assert ActivationLink.query.count() == 0


class TestInvitationByEmail:
    def _named_admin(self, app, **restaurant):
        make_restaurant(app, **restaurant)
        admin, path = _site_admin(app)
        db.session.get(User, admin).username = 'Jean Dupont'
        db.session.commit()
        return admin, path

    def _invite(self, client, admin, path, **body):
        return client.post(
            f'{path}/invitations', json={'role': 'editor', **body},
            headers=confirmed_headers(client, admin),
        )

    def test_it_reaches_the_address_and_says_who_invites_where_and_as_what(self, app, client, smtp):
        admin, path = self._named_admin(app, name='Resto U Créteil')

        res = self._invite(client, admin, path, email='new@mariam.app', send_email=True)

        body = res.get_json()
        assert body['emailed'] is True
        (message,) = smtp.sent
        text = message.get_body(('plain',)).get_content()
        assert message['To'] == 'new@mariam.app'
        assert message['Subject'] == 'Jean Dupont vous invite sur Mariam'
        assert (
            "Jean Dupont vous invite à rejoindre Resto U Créteil sur Mariam, en tant qu'éditeur."
            in text
        )
        assert f"/activate/{body['token']}" in text

    def test_the_pending_list_tells_which_invitations_were_emailed(self, app, client, smtp):
        admin, path = self._named_admin(app)
        self._invite(client, admin, path, email='mailed@mariam.app', send_email=True)
        self._invite(client, admin, path, email='handed@mariam.app')

        listed = client.get(f'{path}/invitations', headers=session_headers(admin)).get_json()

        assert {row['email']: row['emailed'] for row in listed['items']} == {
            'mailed@mariam.app': True, 'handed@mariam.app': False,
        }

    def test_nothing_is_sent_unless_asked(self, app, client, smtp):
        admin, path = self._named_admin(app)

        res = self._invite(client, admin, path, email='new@mariam.app')

        assert res.get_json()['emailed'] is False
        assert smtp.sent == []

    def test_sending_needs_an_address(self, app, client, smtp):
        admin, path = self._named_admin(app)

        res = self._invite(client, admin, path, send_email=True)

        assert res.status_code == 422
        assert ActivationLink.query.count() == 0

    def test_without_mail_the_invitation_is_created_all_the_same(self, app, client):
        admin, path = self._named_admin(app)

        res = self._invite(client, admin, path, email='new@mariam.app', send_email=True)

        assert res.status_code == 201
        assert res.get_json()['emailed'] is False

    def test_an_administrator_emails_twenty_invitations_a_day(self, app, client, smtp):
        admin, path = self._named_admin(app)
        headers = confirmed_headers(client, admin)

        emailed = [
            client.post(f'{path}/invitations', headers=headers, json={
                'role': 'editor', 'email': f'new{index}@mariam.app', 'send_email': True,
            }).get_json()['emailed']
            for index in range(21)
        ]

        assert emailed == [True] * 20 + [False]
        assert (ActivationLink.query.count(), len(smtp.sent)) == (21, 20)

    def test_a_name_can_neither_break_lines_nor_carry_markup(self, app, client, smtp):
        admin, path = self._named_admin(app, name='Resto\n\n<b>Ignorez</b> la suite de ce message')

        self._invite(client, admin, path, email='new@mariam.app', send_email=True)

        (message,) = smtp.sent
        text = message.get_body(('plain',)).get_content()
        assert 'rejoindre Resto <b>Ignorez</b> la suite de ce message sur Mariam' in text
        assert '<b>Ignorez' not in message.get_body(('html',)).get_content()

    def test_a_supervisor_invites_to_the_organization(self, app, client, smtp):
        org = _org()
        supervisor = _supervisor(org, name='Jeanne Martin')

        res = client.post(
            f'/v1/orgs/{org.slug}/invitations',
            json={'email': 'new@mariam.app', 'send_email': True},
            headers=confirmed_headers(client, supervisor),
        )

        assert res.status_code == 201
        text = smtp.sent[0].get_body(('plain',)).get_content()
        assert (
            'Jeanne Martin vous invite à rejoindre Crous Créteil sur Mariam, en tant que superviseur.'
            in text
        )


class TestSecondFactorReset:
    def _target(self, app):
        target = make_user(app, role='editor', email='target@mariam.app')
        enable_totp(target)
        enroll_passkey(target)
        return target

    def test_it_removes_both_methods_and_ends_the_sessions(self, app, client, revocations):
        admin, path = _site_admin(app)
        target = self._target(app)
        session = issue_session(target)

        res = client.delete(
            f'{path}/members/{target}/second-factors', headers=confirmed_headers(client, admin)
        )

        assert res.status_code == 204
        user = db.session.get(User, target)
        assert (user.mfa_enabled, user.passkeys.count(), user.is_active) == (False, 0, True)
        assert not is_signed_in(client, session)

    def test_it_is_audited_against_the_target(self, app, client, revocations):
        admin, path = _site_admin(app)
        target = self._target(app)

        client.delete(
            f'{path}/members/{target}/second-factors', headers=confirmed_headers(client, admin)
        )

        entry = AuditLog.query.filter_by(action=AuditLog.ACTION_MFA_DISABLED).one()
        assert (entry.user_id, entry.target_id) == (admin, target)
        assert entry.restaurant_id == db.session.get(User, admin).restaurant_id
        assert entry.get_details() == {'totp_removed': True, 'passkeys_removed': 1}

    def test_it_needs_a_confirmed_session(self, app, client):
        admin, path = _site_admin(app)
        enable_totp(admin)
        target = self._target(app)

        res = client.delete(f'{path}/members/{target}/second-factors', headers=session_headers(admin))

        assert res.get_json()['code'] == 'step_up_required'
        assert db.session.get(User, target).mfa_enabled is True

    def test_an_admin_resets_its_own_elsewhere(self, app, client, revocations):
        admin, path = _site_admin(app)

        res = client.delete(
            f'{path}/members/{admin}/second-factors', headers=confirmed_headers(client, admin)
        )

        assert res.get_json()['code'] == 'own_account'
        assert db.session.get(User, admin).mfa_enabled is True


class TestPasswordResetLink:
    def _target(self, app, **account):
        target = make_user(app, role='editor', email='target@mariam.app', **account)
        enable_totp(target)
        return target

    def _send(self, client, path, target, headers):
        return client.post(f'{path}/members/{target}/password-reset', headers=headers)

    def test_the_link_goes_to_the_account_and_stays_out_of_the_answer(self, app, client, smtp):
        admin, path = _site_admin(app)
        target = self._target(app)

        res = self._send(client, path, target, confirmed_headers(client, admin))

        assert res.status_code == 201
        assert res.get_json() == {'emailed': True, 'reset_url': None}
        (message,) = smtp.sent
        assert message['To'] == 'target@mariam.app'
        token = ActivationLink.query.filter_by(link_type='password_reset').one().token
        assert f'/reset-password/{token}' in message.get_body(('plain',)).get_content()
        assert client.get(f'/v1/auth/check-reset/{token}').get_json()['valid'] is True

    def test_without_mail_the_link_is_handed_to_the_administrator(self, app, client):
        admin, path = _site_admin(app)
        target = self._target(app)

        body = self._send(client, path, target, confirmed_headers(client, admin)).get_json()

        assert body['emailed'] is False
        token = body['reset_url'].rsplit('/', 1)[1]
        assert client.get(f'/v1/auth/check-reset/{token}').get_json()['email'] == 'target@mariam.app'

    def test_a_new_link_spends_the_one_before(self, app, client):
        admin, path = _site_admin(app)
        target = self._target(app)
        headers = confirmed_headers(client, admin)

        first = self._send(client, path, target, headers).get_json()['reset_url'].rsplit('/', 1)[1]
        self._send(client, path, target, headers)

        assert client.get(f'/v1/auth/check-reset/{first}').status_code == 400

    def test_it_is_audited_against_the_target(self, app, client):
        admin, path = _site_admin(app)
        target = self._target(app)

        self._send(client, path, target, confirmed_headers(client, admin))

        entry = AuditLog.query.filter_by(action=AuditLog.ACTION_PASSWORD_RESET_REQUEST).one()
        assert (entry.user_id, entry.target_id) == (admin, target)
        assert entry.get_details() == {'method': 'dashboard'}

    def test_it_needs_a_confirmed_session(self, app, client):
        admin, path = _site_admin(app)
        enable_totp(admin)
        target = self._target(app)

        res = self._send(client, path, target, session_headers(admin))

        assert res.get_json()['code'] == 'step_up_required'
        assert ActivationLink.query.count() == 0

    def test_an_admin_changes_its_own_password_elsewhere(self, app, client):
        admin, path = _site_admin(app)

        res = self._send(client, path, admin, confirmed_headers(client, admin))

        assert res.get_json()['code'] == 'own_account'
        assert ActivationLink.query.count() == 0

    def test_an_account_of_another_site_is_not_found(self, app, client):
        admin, path = _site_admin(app)
        elsewhere = make_restaurant(app, name='Autre site', code='RU_OTHER')
        target = self._target(app, restaurant_id=elsewhere)

        res = self._send(client, path, target, confirmed_headers(client, admin))

        assert res.get_json()['code'] == 'member_not_found'
        assert ActivationLink.query.count() == 0

    def test_the_rescue_account_is_left_alone(self, app, client):
        admin, path = _site_admin(app)
        target = self._target(app)
        db.session.get(User, target).is_rescue_account = True
        db.session.commit()

        res = self._send(client, path, target, confirmed_headers(client, admin))

        assert res.get_json()['code'] == 'rescue_account'

    def test_a_disabled_account_gets_no_link(self, app, client):
        admin, path = _site_admin(app)
        target = self._target(app)
        db.session.get(User, target).is_active = False
        db.session.commit()

        res = self._send(client, path, target, confirmed_headers(client, admin))

        assert res.get_json()['code'] == 'member_inactive'
        assert ActivationLink.query.count() == 0

    def test_an_account_without_a_second_factor_gets_no_link(self, app, client):
        admin, path = _site_admin(app)
        target = make_user(app, role='editor', email='target@mariam.app')

        res = self._send(client, path, target, confirmed_headers(client, admin))

        assert res.get_json()['code'] == 'second_factor_missing'
        assert ActivationLink.query.count() == 0

    def test_a_supervisor_sends_one_to_another_supervisor(self, app, client, smtp):
        org = _org()
        peer = _supervisor(org, email='peer@mariam.app')
        enable_totp(peer)

        res = self._send(
            client, f'/v1/orgs/{org.slug}', peer, confirmed_headers(client, _supervisor(org))
        )

        assert res.get_json()['emailed'] is True
        assert smtp.sent[0]['To'] == 'peer@mariam.app'
