import pytest
from flask_jwt_extended import decode_token

from app.extensions import db
from app.models import ActivationLink, AuditLog, User
from conftest import auth_headers, make_user
from tests.auth_support import (
    confirmed_headers,
    identity_proof,
    is_signed_in,
    issue_session,
    reset_link,
    session_headers,
)

NEW_ADDRESS = 'moved@mariam.app'


def _update(client, user_id, **changes):
    return client.patch(
        '/v1/auth/me', json=changes, headers=confirmed_headers(client, user_id)
    )


def _update_from(client, user_id, access_token, **changes):
    """From a session an earlier change kept: one minted here, within the second
    of that change, would fall under its revocation.
    """
    headers = auth_headers(access_token)
    headers['X-Step-Up-Token'] = identity_proof(client, user_id, headers)
    return client.patch('/v1/auth/me', json=changes, headers=headers)


def _refresh(client, refresh_token):
    return client.post('/v1/auth/refresh', headers=auth_headers(refresh_token))


class TestProof:
    def test_nothing_changes_without_a_proof(self, app, client):
        uid = make_user(app)

        res = client.patch(
            '/v1/auth/me', json={'username': 'Jean Dupont'}, headers=session_headers(uid)
        )

        assert res.status_code == 403
        assert res.get_json()['step_up_required'] is True
        assert db.session.get(User, uid).username == 'admin'

    def test_a_refused_change_spends_the_proof_all_the_same(self, app, client, revocations):
        uid = make_user(app)
        make_user(app, email='taken@mariam.app')
        headers = confirmed_headers(client, uid)

        refused = client.patch('/v1/auth/me', json={'email': 'taken@mariam.app'}, headers=headers)
        again = client.patch('/v1/auth/me', json={'email': NEW_ADDRESS}, headers=headers)

        assert (refused.status_code, again.status_code) == (409, 403)
        assert db.session.get(User, uid).email == 'admin@mariam.app'

    def test_a_proof_belongs_to_one_account(self, app, client):
        owner = make_user(app)
        other = make_user(app, email='other@mariam.app')

        res = client.patch(
            '/v1/auth/me',
            json={'username': 'Jean Dupont'},
            headers={**session_headers(other), 'X-Step-Up-Token': identity_proof(client, owner)},
        )

        assert res.status_code == 403
        assert db.session.get(User, other).username == 'other'


class TestName:
    def test_the_name_changes_and_the_session_stays(self, app, client):
        uid = make_user(app)
        session = issue_session(uid)

        res = _update(client, uid, username='  Jean   Dupont ')

        assert res.status_code == 200
        assert res.get_json()['user']['username'] == 'Jean Dupont'
        assert 'access_token' not in res.get_json()
        assert is_signed_in(client, session)
        entry = AuditLog.query.filter_by(action=AuditLog.ACTION_USER_UPDATE).one()
        assert entry.get_details() == {'field': 'username', 'old': 'admin', 'new': 'Jean Dupont'}

    @pytest.mark.parametrize('changes', [{}, {'username': 'J'}, {'username': 'Agent 007'}])
    def test_an_empty_or_malformed_change_is_refused(self, app, client, changes):
        uid = make_user(app)

        assert _update(client, uid, **changes).status_code == 422
        assert db.session.get(User, uid).username == 'admin'


class TestAddress:
    def test_the_address_changes_and_signs_in(self, app, client):
        uid = make_user(app)

        res = _update(client, uid, email=' Moved@Mariam.App ')

        assert res.status_code == 200
        assert db.session.get(User, uid).email == NEW_ADDRESS
        entry = AuditLog.query.filter_by(action=AuditLog.ACTION_EMAIL_CHANGE).one()
        assert entry.get_details() == {
            'success': True, 'old': 'admin@mariam.app', 'new': NEW_ADDRESS,
        }

    def test_every_other_session_ends_and_the_caller_keeps_one(self, app, client):
        uid = make_user(app)
        elsewhere = issue_session(uid)

        kept = _update(client, uid, email=NEW_ADDRESS).get_json()

        assert not is_signed_in(client, elsewhere)
        assert _refresh(client, elsewhere['refresh']).status_code == 401
        assert client.get('/v1/auth/me', headers=auth_headers(kept['access_token'])).status_code == 200

    def test_the_kept_session_refreshes(self, app, client):
        uid = make_user(app)
        kept = _update(client, uid, email=NEW_ADDRESS).get_json()

        refreshed = _refresh(client, kept['refresh_token']).get_json()['access_token']

        assert client.get('/v1/auth/me', headers=auth_headers(refreshed)).status_code == 200
        assert decode_token(refreshed)[User.REVOCATION_MARKER] == (
            db.session.get(User, uid).revocation_marker()
        )

    def test_a_later_revocation_ends_the_session_an_earlier_one_kept(self, app, client):
        uid = make_user(app)
        kept = _update(client, uid, email=NEW_ADDRESS).get_json()

        db.session.get(User, uid).revoke_tokens()
        db.session.commit()

        assert client.get('/v1/auth/me', headers=auth_headers(kept['access_token'])).status_code == 401
        assert _refresh(client, kept['refresh_token']).status_code == 401

    def test_an_address_in_use_is_refused_and_audited(self, app, client):
        uid = make_user(app)
        make_user(app, email='taken@mariam.app')

        res = _update(client, uid, email='Taken@Mariam.app')

        assert res.status_code == 409
        assert db.session.get(User, uid).email == 'admin@mariam.app'
        entry = AuditLog.query.filter_by(action=AuditLog.ACTION_EMAIL_CHANGE).one()
        assert entry.get_details() == {'success': False, 'reason': 'address_in_use'}

    def test_the_rescue_account_keeps_its_address_but_not_its_name(self, app, client):
        uid = make_user(app)
        db.session.get(User, uid).is_rescue_account = True
        db.session.commit()

        assert _update(client, uid, email=NEW_ADDRESS).status_code == 403
        assert _update(client, uid, username='Jean Dupont').status_code == 200
        user = db.session.get(User, uid)
        assert (user.email, user.username) == ('admin@mariam.app', 'Jean Dupont')

    def test_the_profile_says_when_the_address_is_frozen(self, app, client):
        uid = make_user(app)
        before = client.get('/v1/auth/me', headers=session_headers(uid)).get_json()['user']
        db.session.get(User, uid).is_rescue_account = True
        db.session.commit()

        after = client.get('/v1/auth/me', headers=session_headers(uid)).get_json()['user']

        assert (before['is_rescue_account'], after['is_rescue_account']) == (False, True)

    def test_a_third_change_within_a_day_is_refused(self, app, client):
        uid = make_user(app)
        first = _update(client, uid, email='first@mariam.app').get_json()
        second = _update_from(
            client, uid, first['access_token'], email='second@mariam.app'
        ).get_json()

        res = _update_from(client, uid, second['access_token'], email='third@mariam.app')

        assert res.status_code == 429
        assert db.session.get(User, uid).email == 'second@mariam.app'

    def test_a_refused_address_does_not_count_against_the_day(self, app, client):
        uid = make_user(app)
        make_user(app, email='taken@mariam.app')
        for _ in range(3):
            assert _update(client, uid, email='taken@mariam.app').status_code == 409

        assert _update(client, uid, email=NEW_ADDRESS).status_code == 200

    def test_the_same_address_is_no_change(self, app, client):
        uid = make_user(app)
        session = issue_session(uid)

        res = _update(client, uid, email='admin@mariam.app')

        assert res.status_code == 200
        assert 'access_token' not in res.get_json()
        assert is_signed_in(client, session)

    def test_pending_reset_links_are_spent(self, app, client):
        uid = make_user(app)
        token = reset_link('admin@mariam.app')

        _update(client, uid, email=NEW_ADDRESS)

        assert ActivationLink.query.filter_by(token=token).one().used_at is not None


class TestAlert:
    def test_the_old_address_is_told_without_the_new_one_in_full(self, app, client, smtp):
        uid = make_user(app)

        _update(client, uid, email=NEW_ADDRESS)

        (message,) = smtp.sent
        body = message.get_body(('plain',)).get_content()
        assert message['To'] == 'admin@mariam.app'
        assert 'm•••@mariam.app' in body
        assert NEW_ADDRESS not in message.as_string()

    def test_a_name_change_sends_nothing(self, app, client, smtp):
        _update(client, make_user(app), username='Jean Dupont')

        assert smtp.sent == []

    def test_a_relay_that_fails_does_not_undo_the_change(self, app, client, monkeypatch):
        def refuse(*_args, **_kwargs):
            raise OSError('relay unreachable')

        monkeypatch.setenv('SMTP_HOST', 'smtp.example.org')
        monkeypatch.setenv('SMTP_SENDER', 'mariam@example.org')
        monkeypatch.setattr('smtplib.SMTP', refuse)
        uid = make_user(app)

        res = _update(client, uid, email=NEW_ADDRESS)

        assert res.status_code == 200
        assert db.session.get(User, uid).email == NEW_ADDRESS
