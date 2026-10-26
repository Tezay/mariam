"""Changing the password from a session: with the current one and a code, or a passkey."""
import pyotp
import pytest

from app.extensions import db
from app.models import AuditLog, User
from conftest import TEST_PASSWORD, auth_headers, make_user
from tests.auth_support import (
    enable_totp,
    enroll_passkey,
    is_signed_in,
    issue_session,
    new_authenticator,
)

NEW_PASSWORD = 'Changed-Pass123!'


def _put(client, session, **body):
    return client.put(
        '/v1/user/password', headers=auth_headers(session['access']),
        json={'new_password': NEW_PASSWORD, **body},
    )


class TestWithTotp:
    def _change(self, client, session, code, current=TEST_PASSWORD, new=NEW_PASSWORD):
        return _put(client, session, current_password=current, new_password=new, code=code)

    def test_the_password_changes_and_every_session_ends(self, app, client):
        uid = make_user(app)
        secret = enable_totp(uid)
        session = issue_session(uid)

        assert self._change(client, session, pyotp.TOTP(secret).now()).status_code == 204

        assert db.session.get(User, uid).check_password(NEW_PASSWORD)
        assert not is_signed_in(client, session)

    def test_a_wrong_current_password_is_refused_and_audited(self, app, client):
        uid = make_user(app)
        secret = enable_totp(uid)

        res = self._change(
            client, issue_session(uid), pyotp.TOTP(secret).now(), current='Wrong-Pass123!'
        )

        assert res.get_json()['code'] == 'password_invalid'
        assert AuditLog.query.filter_by(action=AuditLog.ACTION_PASSWORD_CHANGE).count() == 1

    def test_a_missing_code_counts_as_a_wrong_one(self, app, client):
        uid = make_user(app)
        enable_totp(uid)

        res = _put(client, issue_session(uid), current_password=TEST_PASSWORD)

        assert res.get_json()['code'] == 'code_invalid'
        assert db.session.get(User, uid).check_password(TEST_PASSWORD)

    def test_a_weak_password_is_refused_with_a_pointer(self, app, client):
        uid = make_user(app)
        secret = enable_totp(uid)

        res = self._change(client, issue_session(uid), pyotp.TOTP(secret).now(), new='weak')

        assert res.status_code == 422
        assert [issue['pointer'] for issue in res.get_json()['errors']] == ['/new_password']


class TestWithoutSecondFactor:
    def test_the_current_password_is_enough(self, app, client):
        uid = make_user(app)

        assert _put(client, issue_session(uid), current_password=TEST_PASSWORD).status_code == 204
        assert db.session.get(User, uid).check_password(NEW_PASSWORD)


class TestOneProof:
    @pytest.mark.parametrize('body', [
        {},
        {'code': '123456'},
        {'challenge_token': 'token'},
        {'current_password': TEST_PASSWORD, 'challenge_token': 'token', 'credential': {}},
        {'current_password': TEST_PASSWORD, 'credential': {}},
    ])
    def test_a_body_without_one_whole_proof_is_refused(self, app, client, body):
        uid = make_user(app)

        res = _put(client, issue_session(uid), **body)

        assert res.status_code == 422
        assert db.session.get(User, uid).check_password(TEST_PASSWORD)


class TestWithPasskey:
    def _begin(self, client, session, current=TEST_PASSWORD):
        return client.post(
            '/v1/user/password/options',
            headers=auth_headers(session['access']),
            json={'current_password': current},
        )

    def _complete(self, client, session, begin, authenticator):
        return _put(
            client, session,
            challenge_token=begin['challenge_token'],
            credential=authenticator.sign(begin['options']),
        )

    def test_the_password_changes_and_every_session_ends(self, app, client):
        uid = make_user(app)
        authenticator = enroll_passkey(uid)
        session = issue_session(uid)
        begin = self._begin(client, session).get_json()

        assert self._complete(client, session, begin, authenticator).status_code == 204

        assert db.session.get(User, uid).check_password(NEW_PASSWORD)
        assert not is_signed_in(client, session)

    def test_the_password_alone_changes_nothing_on_a_passkey_account(self, app, client):
        uid = make_user(app)
        enroll_passkey(uid)

        res = _put(client, issue_session(uid), current_password=TEST_PASSWORD)

        assert res.get_json()['code'] == 'passkey_required'
        assert db.session.get(User, uid).check_password(TEST_PASSWORD)

    def test_a_wrong_current_password_is_refused(self, app, client):
        uid = make_user(app)
        enroll_passkey(uid)

        res = self._begin(client, issue_session(uid), current='Wrong-Pass123!')

        assert res.get_json()['code'] == 'password_invalid'

    def test_an_account_without_a_passkey_has_none_to_challenge(self, app, client):
        res = self._begin(client, issue_session(make_user(app)))

        assert res.get_json()['code'] == 'no_passkey'

    def test_an_unregistered_passkey_is_refused(self, app, client):
        uid = make_user(app)
        enroll_passkey(uid)
        session = issue_session(uid)
        begin = self._begin(client, session).get_json()

        res = self._complete(client, session, begin, new_authenticator())

        assert res.get_json()['code'] == 'passkey_refused'
        assert db.session.get(User, uid).check_password(TEST_PASSWORD)
