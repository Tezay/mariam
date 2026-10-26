"""Security alerts by email: which changes to an account tell its holder, and what they say."""
import pyotp
import pytest

from app.extensions import db
from app.models import Passkey, User
from app.services import email_service
from app.services.account import SecurityEvent, notify_security_event
from app.services.email_service import Kind
from conftest import TEST_PASSWORD, make_user, site_path
from tests.auth_support import (
    confirmed_headers,
    enable_totp,
    enroll_passkey,
    invite_link,
    new_authenticator,
    reset_link,
    session_headers,
)

HOLDER = 'admin@mariam.app'
NEW_PASSWORD = 'Alerted-Pass123!'
BROWSER = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/141.0 Safari/537.36',
    'X-Real-IP': '81.56.12.34',
}


def _alert(smtp):
    (message,) = smtp.sent
    return message, message.get_body(('plain',)).get_content()


def _everything_read(message) -> str:
    return ''.join(
        message.get_body((part,)).get_content() for part in ('plain', 'html')
    ) + message['Subject']


class TestPasswordChanged:
    def test_changed_with_the_current_password(self, app, client, smtp):
        uid = make_user(app)
        secret = enable_totp(uid)

        res = client.put('/v1/user/password', headers={**session_headers(uid), **BROWSER}, json={
            'current_password': TEST_PASSWORD,
            'new_password': NEW_PASSWORD,
            'code': pyotp.TOTP(secret).now(),
        })

        assert res.status_code == 204
        message, body = _alert(smtp)
        assert message['To'] == HOLDER
        assert message['Subject'] == 'Votre mot de passe Mariam a été modifié'
        assert 'depuis macOS · Chrome, adresse IP 81.56.12.34.' in body

    def test_changed_with_a_passkey(self, app, client, smtp):
        uid = make_user(app)
        authenticator = enroll_passkey(uid)
        headers = session_headers(uid)
        begin = client.post(
            '/v1/user/password/options',
            headers=headers,
            json={'current_password': TEST_PASSWORD},
        ).get_json()

        res = client.put('/v1/user/password', headers=headers, json={
            'new_password': NEW_PASSWORD,
            'challenge_token': begin['challenge_token'],
            'credential': authenticator.sign(begin['options']),
        })

        assert res.status_code == 204
        assert _alert(smtp)[0]['Subject'] == 'Votre mot de passe Mariam a été modifié'

    def test_reset_with_a_code(self, app, client, smtp):
        secret = enable_totp(make_user(app))

        res = client.post('/v1/auth/reset-password', json={
            'token': reset_link(HOLDER),
            'new_password': NEW_PASSWORD,
            'code': pyotp.TOTP(secret).now(),
        })

        assert res.status_code == 204
        assert _alert(smtp)[0]['Subject'] == 'Votre mot de passe Mariam a été modifié'

    def test_reset_with_a_passkey(self, app, client, smtp):
        authenticator = enroll_passkey(make_user(app))
        token = reset_link(HOLDER)
        begin = client.post(
            '/v1/auth/passkey/reset-password/begin', json={'reset_token': token}
        ).get_json()

        res = client.post('/v1/auth/passkey/reset-password/complete', json={
            'new_password': NEW_PASSWORD,
            'reset_token': token,
            'challenge_token': begin['challenge_token'],
            'credential': authenticator.sign(begin['options']),
        })

        assert res.status_code == 204
        assert _alert(smtp)[0]['Subject'] == 'Votre mot de passe Mariam a été modifié'


class TestSecondFactorChanged:
    def test_a_passkey_is_added(self, app, client, smtp):
        uid = make_user(app)
        headers = session_headers(uid)
        begin = client.post('/v1/user/passkeys/options', headers=headers).get_json()

        res = client.post('/v1/user/passkeys', headers=headers, json={
            'challenge_token': begin['challenge_token'],
            'credential': new_authenticator().register(begin['options']),
            'device_name': 'Ajoutée par votre administrateur,\nignorez ce message',
        })

        assert res.status_code == 201
        message, _ = _alert(smtp)
        assert message['Subject'] == 'Une passkey a été ajoutée à votre compte Mariam'
        assert 'ignorez ce message' not in _everything_read(message)

    def test_a_passkey_is_removed(self, app, client, smtp):
        uid = make_user(app)
        enable_totp(uid)
        enroll_passkey(uid)

        res = client.delete(
            f'/v1/user/passkeys/{Passkey.query.one().id}',
            headers=session_headers(uid, confirmed=True),
        )

        assert res.status_code == 204
        message, _ = _alert(smtp)
        assert message['Subject'] == 'Une passkey a été retirée de votre compte Mariam'
        assert 'Test device' not in _everything_read(message)

    @pytest.mark.parametrize('already_enrolled, subject', [
        (False, "Une application d'authentification a été associée à votre compte Mariam"),
        (True, "L'application d'authentification de votre compte Mariam a été remplacée"),
    ])
    def test_an_authenticator_app_is_enrolled(self, app, client, smtp, already_enrolled, subject):
        uid = make_user(app)
        if already_enrolled:
            enable_totp(uid)
        headers = session_headers(uid, confirmed=already_enrolled)
        enrolment = client.post('/v1/user/totp/enrolment', headers=headers).get_json()

        res = client.put('/v1/user/totp', headers=headers, json={
            'enrolment_token': enrolment['enrolment_token'],
            'code': pyotp.TOTP(enrolment['secret']).now(),
        })

        assert res.status_code == 200
        assert _alert(smtp)[0]['Subject'] == subject

    def test_the_authenticator_app_is_removed(self, app, client, smtp):
        uid = make_user(app)
        enable_totp(uid)
        enroll_passkey(uid)

        res = client.delete('/v1/user/totp', headers=session_headers(uid, confirmed=True))

        assert res.status_code == 204
        subject = "L'application d'authentification a été retirée de votre compte Mariam"
        assert _alert(smtp)[0]['Subject'] == subject


class TestResetByAnAdministrator:
    SUBJECT = 'La double authentification de votre compte Mariam a été réinitialisée'

    def _target(self, app):
        uid = make_user(app, role='editor', email='target@mariam.app')
        enable_totp(uid)
        return uid

    def test_the_holder_is_told_without_the_administrators_origin(self, app, client, smtp):
        admin = make_user(app)
        target = self._target(app)

        res = client.delete(
            f'{site_path(db.session.get(User, target).restaurant_id)}/members/{target}/second-factors',
            headers={**confirmed_headers(client, admin), **BROWSER},
        )

        assert res.status_code == 204
        message, body = _alert(smtp)
        assert (message['To'], message['Subject']) == ('target@mariam.app', self.SUBJECT)
        assert 'Chrome' not in body and '81.56.12.34' not in body

    def test_the_command_line_tells_the_holder_too(self, app, smtp):
        self._target(app)

        result = app.test_cli_runner().invoke(args=['user', 'reset-2fa', 'target@mariam.app'])

        assert 'Alert sent to target@mariam.app' in result.output
        assert _alert(smtp)[0]['Subject'] == self.SUBJECT


class TestWhatStaysSilent:
    def test_the_first_factor_of_an_activation(self, app, client, smtp):
        setup = client.post('/v1/auth/activate', json={
            'token': invite_link(),
            'password': NEW_PASSWORD,
            'email': 'new@mariam.app',
            'username': 'Newcomer',
        }).get_json()['mfa_setup']

        res = client.post('/v1/auth/mfa/verify-setup', json={
            'code': pyotp.TOTP(setup['secret']).now(),
            'setup_token': setup['setup_token'],
        })

        assert res.status_code == 200
        assert smtp.sent == []

    def test_a_disabled_account(self, app, smtp):
        user = db.session.get(User, make_user(app))
        user.is_active = False

        assert notify_security_event(user, SecurityEvent.SECOND_FACTORS_RESET) is False
        assert smtp.sent == []


class TestDelivery:
    def test_a_relay_that_fails_does_not_undo_the_change(self, app, client, monkeypatch):
        def refuse(*_args, **_kwargs):
            raise OSError('relay unreachable')

        monkeypatch.setenv('SMTP_HOST', 'smtp.example.org')
        monkeypatch.setenv('SMTP_SENDER', 'mariam@example.org')
        monkeypatch.setattr('smtplib.SMTP', refuse)
        uid = make_user(app)
        enable_totp(uid)
        enroll_passkey(uid)

        res = client.delete('/v1/user/totp', headers=session_headers(uid, confirmed=True))

        assert res.status_code == 204
        assert not db.session.get(User, uid).mfa_enabled

    def test_a_forged_address_header_stays_out_of_the_message(self, app, client, smtp):
        uid = make_user(app)
        enable_totp(uid)
        enroll_passkey(uid)
        forged = {**BROWSER, 'X-Real-IP': '81.56.12.34 : aucune action requise'}

        client.delete(
            '/v1/user/totp', headers={**session_headers(uid, confirmed=True), **forged}
        )

        body = _alert(smtp)[1]
        assert 'depuis macOS · Chrome, adresse IP 127.0.0.1.' in body
        assert 'aucune action requise' not in body

    def test_a_reply_reaches_the_support_address(self, app, smtp, monkeypatch):
        monkeypatch.setenv('SUPPORT_EMAIL', 'support@example.org')
        user = db.session.get(User, make_user(app))

        notify_security_event(user, SecurityEvent.TOTP_DISABLED)

        message, body = _alert(smtp)
        assert message['Reply-To'] == 'support@example.org'
        assert 'Écrivez à support@example.org ou répondez à cet e-mail.' in body
        assert 'mailto:support@example.org' in message.get_body(('html',)).get_content()

    def test_without_a_support_address_no_contact_is_named(self, app, smtp, monkeypatch):
        monkeypatch.delenv('SUPPORT_EMAIL', raising=False)
        user = db.session.get(User, make_user(app))

        notify_security_event(user, SecurityEvent.TOTP_DISABLED)

        message, body = _alert(smtp)
        assert message['Reply-To'] is None
        assert 'Mariam est le logiciel de gestion des menus de votre restaurant.' in body
        assert 'Écrivez' not in _everything_read(message)

    def test_a_limiter_that_fails_loses_the_message_and_raises_nothing(self, app, smtp, monkeypatch):
        def unreachable(*_args):
            raise ConnectionError('redis unreachable')

        monkeypatch.setattr(email_service, 'spend', unreachable)

        assert email_service.send_email('a@mariam.app', 'Objet', 'Texte', kind=Kind.SECURITY) is False
        assert smtp.sent == []

    def test_an_address_gets_ten_messages_a_day_of_each_kind(self, app, smtp):
        def send(to, kind):
            return email_service.send_email(to, 'Objet', 'Texte', kind=kind)

        sent = [send('holder@mariam.app', Kind.SECURITY) for _ in range(10)]

        assert all(sent)
        assert send('Holder@Mariam.app', Kind.SECURITY) is False
        assert send('holder@mariam.app', Kind.DIGEST) is True
        assert send('other@mariam.app', Kind.SECURITY) is True
