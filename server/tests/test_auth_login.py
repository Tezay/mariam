from app.extensions import db
from app.models import AuditLog, Passkey, User
from conftest import TEST_PASSWORD, auth_headers, make_user
from tests.auth_support import enable_totp, enroll_passkey, new_authenticator


def _login(client, password=TEST_PASSWORD):
    return client.post('/v1/auth/login', json={'email': 'admin@mariam.app', 'password': password})


def _passkey_login(client, authenticator):
    begin = client.post('/v1/auth/passkey/login/begin').get_json()
    return client.post('/v1/auth/passkey/login/complete', json={
        'challenge_token': begin['challenge_token'],
        'credential': authenticator.sign(begin['options']),
    })


class TestPasswordLogin:
    def test_a_passkey_only_account_is_sent_to_passkey_login(self, app, client):
        enroll_passkey(make_user(app))

        res = _login(client)

        assert res.status_code == 403
        assert res.get_json()['passkey_only'] is True
        assert 'access_token' not in res.get_json()

    def test_a_failed_attempt_is_audited(self, app, client):
        make_user(app)

        _login(client, password='WrongPass123!')

        assert AuditLog.query.filter_by(action=AuditLog.ACTION_LOGIN_FAILED).count() == 1

    def test_the_mfa_token_does_not_open_a_session(self, app, client):
        enable_totp(make_user(app))
        mfa_token = _login(client).get_json()['mfa_token']

        res = client.get('/v1/auth/me', headers=auth_headers(mfa_token))

        assert res.status_code == 401


class TestPasskeyLogin:
    def test_a_registered_passkey_opens_a_session(self, app, client):
        uid = make_user(app)
        authenticator = enroll_passkey(uid)

        res = _passkey_login(client, authenticator)

        assert res.status_code == 200
        assert res.get_json()['user']['id'] == uid
        assert AuditLog.query.filter_by(action=AuditLog.ACTION_LOGIN, user_id=uid).count() == 1

    def test_the_signature_counter_is_recorded(self, app, client):
        uid = make_user(app)
        authenticator = enroll_passkey(uid)

        _passkey_login(client, authenticator)
        _passkey_login(client, authenticator)

        assert Passkey.query.filter_by(user_id=uid).one().sign_count == 2

    def test_a_body_without_credential_is_refused_by_its_schema(self, app, client):
        res = client.post('/v1/auth/passkey/login/complete', json={'challenge_token': 'x'})

        assert res.status_code == 422

    def test_an_unknown_passkey_is_refused(self, app, client):
        make_user(app)

        res = _passkey_login(client, new_authenticator())

        assert res.status_code == 404

    def test_a_signature_from_another_key_is_refused_and_audited(self, app, client):
        uid = make_user(app)
        registered = enroll_passkey(uid)
        impostor = new_authenticator()
        impostor.credential_id = registered.credential_id

        res = _passkey_login(client, impostor)

        assert res.status_code == 401
        assert AuditLog.query.filter_by(
            action=AuditLog.ACTION_LOGIN_FAILED, user_id=uid
        ).count() == 1

    def test_a_disabled_account_is_refused(self, app, client):
        uid = make_user(app)
        authenticator = enroll_passkey(uid)
        db.session.get(User, uid).is_active = False
        db.session.commit()

        res = _passkey_login(client, authenticator)

        assert res.status_code == 404
