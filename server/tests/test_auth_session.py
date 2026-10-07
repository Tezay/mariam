from app.extensions import db
from app.models import AuditLog, User
from conftest import auth_headers, make_user
from tests.auth_support import issue_session, session_headers


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


class TestLogout:
    def _logout(self, client, session):
        return client.post(
            '/v1/auth/logout',
            json={'access_token': session['access']},
            headers=auth_headers(session['refresh']),
        )

    def test_both_tokens_are_revoked(self, app, client, revocations):
        session = issue_session(make_user(app))

        assert self._logout(client, session).status_code == 200

        assert client.get('/v1/auth/me', headers=auth_headers(session['access'])).status_code == 401
        assert client.post(
            '/v1/auth/refresh', headers=auth_headers(session['refresh'])
        ).status_code == 401

    def test_the_logout_is_audited(self, app, client, revocations):
        uid = make_user(app)

        self._logout(client, issue_session(uid))

        assert AuditLog.query.filter_by(action=AuditLog.ACTION_LOGOUT, user_id=uid).count() == 1


class TestSessionTransfer:
    def _transfer_token(self, client, user_id):
        res = client.post('/v1/auth/session-transfer/generate', headers=session_headers(user_id))
        return res.get_json()['transfer_token']

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
