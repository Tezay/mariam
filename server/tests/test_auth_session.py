from flask_jwt_extended import decode_token

from app.extensions import db
from app.models import AuditLog, User
from conftest import TEST_PASSWORD, auth_headers, make_user
from tests.auth_support import confirmed_headers, enable_totp, issue_session, session_headers


class TestRefresh:
    def test_an_access_token_cannot_refresh(self, app, client):
        session = issue_session(make_user(app))

        res = client.post('/v1/auth/refresh', headers=auth_headers(session['access']))

        assert res.status_code == 401
        assert 'access_token' not in res.get_json()


    def test_a_disabled_account_has_no_session(self, app, client):
        uid = make_user(app)
        session = issue_session(uid)
        db.session.get(User, uid).is_active = False
        db.session.commit()

        me = client.get('/v1/auth/me', headers=auth_headers(session['access']))
        refresh = client.post('/v1/auth/refresh', headers=auth_headers(session['refresh']))

        assert (me.status_code, refresh.status_code) == (401, 401)

    def test_a_deleted_account_has_no_session(self, app, client):
        uid = make_user(app)
        session = issue_session(uid)
        db.session.delete(db.session.get(User, uid))
        db.session.commit()

        me = client.get('/v1/auth/me', headers=auth_headers(session['access']))
        refresh = client.post('/v1/auth/refresh', headers=auth_headers(session['refresh']))
        logout = client.post('/v1/auth/logout', headers=auth_headers(session['refresh']))

        assert (me.status_code, refresh.status_code, logout.status_code) == (401, 401, 401)


class TestLogout:
    def _logout(self, client, session):
        return client.post('/v1/auth/logout', headers=auth_headers(session['refresh']))

    def test_both_tokens_are_revoked(self, app, client, revocations):
        session = issue_session(make_user(app))

        assert self._logout(client, session).status_code == 200

        assert client.get('/v1/auth/me', headers=auth_headers(session['access'])).status_code == 401
        assert client.post(
            '/v1/auth/refresh', headers=auth_headers(session['refresh'])
        ).status_code == 401

    def test_every_access_token_of_the_session_ends_with_it(self, app, client, revocations):
        uid = make_user(app)
        session = issue_session(uid)
        refreshed = auth_headers(client.post(
            '/v1/auth/refresh', headers=auth_headers(session['refresh'])
        ).get_json()['access_token'])
        confirmed = confirmed_headers(client, uid, refreshed)

        self._logout(client, session)

        assert client.get('/v1/auth/me', headers=refreshed).status_code == 401
        assert client.get('/v1/auth/me', headers=confirmed).status_code == 401

    def test_a_sign_in_ties_the_access_token_to_its_session(self, app, client):
        make_user(app)

        session = client.post('/v1/auth/login', json={
            'email': 'admin@mariam.app', 'password': TEST_PASSWORD,
        }).get_json()

        assert decode_token(session['access_token'])['sid'] == (
            decode_token(session['refresh_token'])['jti']
        )

    def test_the_logout_is_audited(self, app, client, revocations):
        uid = make_user(app)

        self._logout(client, issue_session(uid))

        assert AuditLog.query.filter_by(action=AuditLog.ACTION_LOGOUT, user_id=uid).count() == 1


class TestSessionTransfer:
    def _generate(self, client, headers):
        return client.post('/v1/auth/session-transfer/generate', headers=headers)

    def _transfer_token(self, client, user_id):
        return self._generate(client, session_headers(user_id)).get_json()['transfer_token']

    def _validate(self, client, token):
        return client.post('/v1/auth/session-transfer/validate', json={'transfer_token': token})

    def test_a_transfer_token_opens_a_session_on_another_device(self, app, client, revocations):
        uid = make_user(app)

        res = self._validate(client, self._transfer_token(client, uid))

        assert res.status_code == 200
        assert res.get_json()['user']['id'] == uid
        assert {'access_token', 'refresh_token'} <= res.get_json().keys()

    def test_a_transfer_token_works_once(self, app, client, revocations):
        token = self._transfer_token(client, make_user(app))
        self._validate(client, token)

        assert self._validate(client, token).status_code == 401

    def test_a_transfer_token_is_not_an_access_token(self, app, client, revocations):
        token = self._transfer_token(client, make_user(app))

        assert client.get('/v1/auth/me', headers=auth_headers(token)).status_code == 401

    def test_a_disabled_account_receives_no_session(self, app, client, revocations):
        uid = make_user(app)
        token = self._transfer_token(client, uid)
        db.session.get(User, uid).is_active = False
        db.session.commit()

        assert self._validate(client, token).status_code == 403

    def test_ending_the_sessions_ends_a_transfer_in_flight(self, app, client, revocations):
        uid = make_user(app)
        token = self._transfer_token(client, uid)
        db.session.get(User, uid).revoke_tokens()
        db.session.commit()

        assert self._validate(client, token).status_code == 401

    def test_signing_out_ends_a_transfer_in_flight(self, app, client, revocations):
        session = issue_session(make_user(app))
        token = self._generate(
            client, auth_headers(session['access'])
        ).get_json()['transfer_token']
        client.post('/v1/auth/logout', headers=auth_headers(session['refresh']))

        assert self._validate(client, token).status_code == 401

    def test_an_account_with_a_second_factor_transfers_from_a_confirmed_session(self, app, client):
        uid = make_user(app)
        enable_totp(uid)

        refused = self._generate(client, session_headers(uid))

        assert refused.status_code == 403
        assert refused.get_json()['step_up_required'] is True
        assert self._generate(client, session_headers(uid, confirmed=True)).status_code == 200

    def test_the_other_device_inherits_the_confirmation(self, app, client, revocations):
        uid = make_user(app)
        enable_totp(uid)
        session = issue_session(uid, confirmed=True)
        token = self._generate(client, auth_headers(session['access'])).get_json()['transfer_token']

        received = self._validate(client, token).get_json()['access_token']

        assert decode_token(received)['fresh'] == decode_token(session['access'])['fresh']
        assert client.post(
            '/v1/auth/passkey/register/begin', headers=auth_headers(received)
        ).status_code == 200

    def test_an_unconfirmed_transfer_stays_so_once_the_account_gains_a_factor(
        self, app, client, revocations
    ):
        uid = make_user(app)
        token = self._transfer_token(client, uid)
        enable_totp(uid)

        received = self._validate(client, token).get_json()['access_token']

        assert client.post(
            '/v1/auth/passkey/register/begin', headers=auth_headers(received)
        ).status_code == 403

    def test_a_password_alone_confirms_nothing(self, app, client):
        uid = make_user(app)
        session = client.post('/v1/auth/login', json={
            'email': 'admin@mariam.app', 'password': TEST_PASSWORD,
        }).get_json()
        enable_totp(uid)

        assert self._generate(client, auth_headers(session['access_token'])).status_code == 403
