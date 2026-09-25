import pyotp

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


class TestWithTotp:
    def _change(self, client, session, code, current=TEST_PASSWORD, new=NEW_PASSWORD):
        return client.post('/v1/auth/change-password', headers=auth_headers(session['access']), json={
            'current_password': current, 'new_password': new, 'mfa_code': code,
        })

    def test_the_password_changes_and_every_session_ends(self, app, client):
        uid = make_user(app)
        secret = enable_totp(uid)
        session = issue_session(uid)

        assert self._change(client, session, pyotp.TOTP(secret).now()).status_code == 200

        assert db.session.get(User, uid).check_password(NEW_PASSWORD)
        assert not is_signed_in(client, session)

    def test_a_wrong_current_password_is_refused_and_audited(self, app, client):
        uid = make_user(app)
        secret = enable_totp(uid)

        res = self._change(
            client, issue_session(uid), pyotp.TOTP(secret).now(), current='Wrong-Pass123!'
        )

        assert res.status_code == 401
        assert AuditLog.query.filter_by(action=AuditLog.ACTION_PASSWORD_CHANGE).count() == 1

    def test_a_weak_password_is_refused(self, app, client):
        uid = make_user(app)
        secret = enable_totp(uid)

        res = self._change(client, issue_session(uid), pyotp.TOTP(secret).now(), new='weak')

        assert res.status_code == 400


class TestWithPasskey:
    def _begin(self, client, session, current=TEST_PASSWORD):
        return client.post(
            '/v1/auth/passkey/change-password/begin',
            headers=auth_headers(session['access']),
            json={'current_password': current},
        )

    def _complete(self, client, session, begin, authenticator):
        return client.post(
            '/v1/auth/passkey/change-password/complete',
            headers=auth_headers(session['access']),
            json={
                'new_password': NEW_PASSWORD,
                'challenge_token': begin['challenge_token'],
                'credential': authenticator.sign(begin['options']),
            },
        )

    def test_the_password_changes_and_every_session_ends(self, app, client):
        uid = make_user(app)
        authenticator = enroll_passkey(uid)
        session = issue_session(uid)
        begin = self._begin(client, session).get_json()

        assert self._complete(client, session, begin, authenticator).status_code == 200

        assert db.session.get(User, uid).check_password(NEW_PASSWORD)
        assert not is_signed_in(client, session)

    def test_a_wrong_current_password_is_refused(self, app, client):
        uid = make_user(app)
        enroll_passkey(uid)

        res = self._begin(client, issue_session(uid), current='Wrong-Pass123!')

        assert res.status_code == 401

    def test_an_unregistered_passkey_is_refused(self, app, client):
        uid = make_user(app)
        enroll_passkey(uid)
        session = issue_session(uid)
        begin = self._begin(client, session).get_json()

        res = self._complete(client, session, begin, new_authenticator())

        assert res.status_code == 404
        assert db.session.get(User, uid).check_password(TEST_PASSWORD)
