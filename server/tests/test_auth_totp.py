import pyotp

from app.extensions import db
from app.models import AuditLog, User
from conftest import make_user
from tests.auth_support import enable_totp, enroll_passkey, session_headers


class TestEnrolment:
    def test_a_new_secret_is_not_active_until_confirmed(self, app, client):
        uid = make_user(app)

        res = client.post('/v1/auth/mfa/setup', headers=session_headers(uid))

        assert res.status_code == 200
        assert res.get_json()['qr_code'].startswith('data:image/png;base64,')
        assert not db.session.get(User, uid).mfa_enabled

    def test_the_first_code_activates_it(self, app, client):
        uid = make_user(app)
        secret = client.post('/v1/auth/mfa/setup', headers=session_headers(uid)).get_json()['secret']

        res = client.post('/v1/auth/mfa/setup/confirm', headers=session_headers(uid), json={
            'code': pyotp.TOTP(secret).now(),
        })

        assert res.status_code == 200
        assert db.session.get(User, uid).mfa_enabled
        assert AuditLog.query.filter_by(action=AuditLog.ACTION_MFA_SETUP, user_id=uid).count() == 1

    def test_a_wrong_code_activates_nothing(self, app, client):
        uid = make_user(app)
        client.post('/v1/auth/mfa/setup', headers=session_headers(uid))

        res = client.post(
            '/v1/auth/mfa/setup/confirm', headers=session_headers(uid), json={'code': '000000'}
        )

        assert res.status_code == 401
        assert not db.session.get(User, uid).mfa_enabled


class TestRemoval:
    def test_totp_cannot_go_without_a_passkey(self, app, client):
        uid = make_user(app)
        enable_totp(uid)

        res = client.delete('/v1/auth/mfa', headers=session_headers(uid))

        assert res.status_code == 409
        assert db.session.get(User, uid).mfa_enabled

    def test_totp_goes_when_a_passkey_remains(self, app, client):
        uid = make_user(app)
        enable_totp(uid)
        enroll_passkey(uid)

        res = client.delete('/v1/auth/mfa', headers=session_headers(uid))

        assert res.status_code == 200
        user = db.session.get(User, uid)
        assert not user.mfa_enabled
        assert user.mfa_secret is None
        assert AuditLog.query.filter_by(action=AuditLog.ACTION_MFA_DISABLED).count() == 1
