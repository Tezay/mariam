import pyotp
from cryptography.fernet import Fernet
from flask_jwt_extended import decode_token

from app.extensions import db
from app.models import AuditLog, User
from conftest import auth_headers, make_user
from tests.auth_support import enable_totp, enroll_passkey, session_headers


def _setup(client, headers):
    return client.post('/v1/auth/mfa/setup', headers=headers)


def _confirm(client, user_id, enrolment, code=None, confirmed=False):
    headers = session_headers(user_id, confirmed=confirmed)
    return client.post('/v1/auth/mfa/setup/confirm', headers=headers, json={
        'enrolment_token': enrolment['enrolment_token'],
        'code': code or pyotp.TOTP(enrolment['secret']).now(),
    })


class TestEnrolment:
    def test_nothing_is_stored_before_the_first_code(self, app, client):
        uid = make_user(app)

        res = _setup(client, session_headers(uid))

        assert res.status_code == 200
        assert res.get_json()['qr_code'].startswith('data:image/png;base64,')
        user = db.session.get(User, uid)
        assert (user.mfa_secret, user.mfa_enabled) == (None, False)

    def test_the_first_code_activates_it(self, app, client):
        uid = make_user(app)
        enrolment = _setup(client, session_headers(uid)).get_json()

        res = _confirm(client, uid, enrolment)

        assert res.status_code == 200
        user = db.session.get(User, uid)
        assert (user.mfa_secret, user.mfa_enabled) == (enrolment['secret'], True)
        entry = AuditLog.query.filter_by(action=AuditLog.ACTION_MFA_SETUP, user_id=uid).one()
        assert entry.get_details() == {'replaced': False}

    def test_a_wrong_code_can_be_tried_again(self, app, client):
        uid = make_user(app)
        enrolment = _setup(client, session_headers(uid)).get_json()

        wrong = _confirm(client, uid, enrolment, code='000000')
        right = _confirm(client, uid, enrolment)

        assert (wrong.status_code, right.status_code) == (403, 200)

    def test_an_enrolment_belongs_to_one_account(self, app, client):
        owner = make_user(app, email='owner@mariam.app')
        other = make_user(app, email='other@mariam.app')
        enrolment = _setup(client, session_headers(owner)).get_json()

        res = _confirm(client, other, enrolment)

        assert res.status_code == 400
        assert not db.session.get(User, other).mfa_enabled

    def test_the_secret_travels_encrypted(self, app, client, monkeypatch):
        monkeypatch.setenv('MFA_ENCRYPTION_KEY', Fernet.generate_key().decode())
        uid = make_user(app)

        enrolment = _setup(client, session_headers(uid)).get_json()

        carried = decode_token(enrolment['enrolment_token'])['totp_enrolment']
        assert enrolment['secret'] not in carried
        assert _confirm(client, uid, enrolment).status_code == 200
        assert db.session.get(User, uid).mfa_secret == enrolment['secret']

    def test_the_enrolment_token_opens_no_session(self, app, client):
        token = _setup(client, session_headers(make_user(app))).get_json()['enrolment_token']

        assert client.get('/v1/auth/me', headers=auth_headers(token)).status_code == 401


class TestReplacement:
    def test_an_account_with_a_factor_starts_from_a_confirmed_session(self, app, client):
        uid = make_user(app)
        enable_totp(uid)

        res = _setup(client, session_headers(uid))

        assert res.status_code == 403
        assert res.get_json()['step_up_required'] is True

    def test_the_secret_in_use_survives_until_the_new_one_is_confirmed(self, app, client):
        uid = make_user(app)
        in_use = enable_totp(uid)

        _setup(client, session_headers(uid, confirmed=True))

        assert db.session.get(User, uid).mfa_secret == in_use

    def test_the_new_device_replaces_the_old_one(self, app, client):
        uid = make_user(app)
        enable_totp(uid)
        enrolment = _setup(client, session_headers(uid, confirmed=True)).get_json()

        res = _confirm(client, uid, enrolment, confirmed=True)

        assert res.status_code == 200
        assert db.session.get(User, uid).mfa_secret == enrolment['secret']
        entry = AuditLog.query.filter_by(action=AuditLog.ACTION_MFA_SETUP, user_id=uid).one()
        assert entry.get_details() == {'replaced': True}

    def test_a_refused_code_is_no_matter_for_the_session(self, app, client):
        uid = make_user(app)
        enable_totp(uid)
        headers = session_headers(uid, confirmed=True)
        enrolment = _setup(client, headers).get_json()
        attempt = {'enrolment_token': enrolment['enrolment_token']}

        wrong = client.post(
            '/v1/auth/mfa/setup/confirm', headers=headers, json={**attempt, 'code': '000000'}
        )
        right = client.post(
            '/v1/auth/mfa/setup/confirm',
            headers=headers,
            json={**attempt, 'code': pyotp.TOTP(enrolment['secret']).now()},
        )

        assert (wrong.status_code, right.status_code) == (403, 200)
        assert 'step_up_required' not in wrong.get_json()

    def test_finishing_needs_the_confirmed_session_too(self, app, client):
        uid = make_user(app)
        in_use = enable_totp(uid)
        enrolment = _setup(client, session_headers(uid, confirmed=True)).get_json()

        res = _confirm(client, uid, enrolment)

        assert res.status_code == 403
        assert db.session.get(User, uid).mfa_secret == in_use

    def test_an_enrolment_started_unconfirmed_ends_with_the_first_factor(self, app, client):
        uid = make_user(app)
        enrolment = _setup(client, session_headers(uid)).get_json()
        enroll_passkey(uid)

        res = _confirm(client, uid, enrolment)

        assert res.status_code == 403
        assert res.get_json()['step_up_required'] is True
        assert not db.session.get(User, uid).mfa_enabled


class TestRemoval:
    def test_disabling_needs_a_confirmed_session(self, app, client):
        uid = make_user(app)
        enable_totp(uid)
        enroll_passkey(uid)

        res = client.delete('/v1/auth/mfa', headers=session_headers(uid))

        assert res.status_code == 403
        assert db.session.get(User, uid).mfa_enabled

    def test_totp_cannot_go_without_a_passkey(self, app, client):
        uid = make_user(app)
        enable_totp(uid)

        res = client.delete('/v1/auth/mfa', headers=session_headers(uid, confirmed=True))

        assert res.status_code == 409
        assert db.session.get(User, uid).mfa_enabled

    def test_totp_goes_when_a_passkey_remains(self, app, client):
        uid = make_user(app)
        enable_totp(uid)
        enroll_passkey(uid)

        res = client.delete('/v1/auth/mfa', headers=session_headers(uid, confirmed=True))

        assert res.status_code == 200
        user = db.session.get(User, uid)
        assert not user.mfa_enabled
        assert user.mfa_secret is None
        assert AuditLog.query.filter_by(action=AuditLog.ACTION_MFA_DISABLED).count() == 1
