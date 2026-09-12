"""Weekly digest: who receives it, what it carries, and what happens unconfigured."""
from datetime import date

import pytest

from app.extensions import db
from app.models import Organization, Restaurant, User
from app.services import email_service
from app.utils.time import paris_now
from conftest import make_restaurant, make_user


class _Recorder:
    """Stands in for smtplib.SMTP, keeping what would have been sent."""

    sent: list = []

    def __init__(self, host, port):
        self.host = host
        self.port = port

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def starttls(self):
        pass

    def login(self, username, password):
        pass

    def send_message(self, message):
        _Recorder.sent.append(message)


@pytest.fixture
def smtp(monkeypatch):
    _Recorder.sent = []
    monkeypatch.setenv('SMTP_HOST', 'smtp.example.org')
    monkeypatch.setenv('SMTP_SENDER', 'mariam@example.org')
    monkeypatch.setattr('smtplib.SMTP', _Recorder)
    return _Recorder


def _subscribe(user_id, value=True, slot='now'):
    """Subscribe a user, by default in the slot the job is about to serve."""
    now = paris_now()
    hour = now.hour if slot == 'now' else (now.hour + 1) % 24
    user = User.query.get(user_id)
    user.notification_preferences = {
        'weekly_digest': value, 'digest_day': now.weekday(), 'digest_hour': hour,
    }
    db.session.commit()
    return user_id


class TestConfiguration:
    def test_without_smtp_nothing_is_sent(self, app, monkeypatch):
        monkeypatch.delenv('SMTP_HOST', raising=False)
        make_restaurant(app)
        _subscribe(make_user(app))

        assert email_service.send_weekly_digest(app) == 0

    def test_a_send_reaches_the_relay(self, app, smtp):
        make_restaurant(app)
        _subscribe(make_user(app))

        assert email_service.send_weekly_digest(app) == 1
        assert smtp.sent[0]['To'] == 'admin@mariam.app'


class TestRecipients:
    def test_only_subscribers_receive_it(self, app, smtp):
        rid = make_restaurant(app)
        _subscribe(make_user(app))
        _subscribe(make_user(app, email='quiet@mariam.app', restaurant_id=rid), value=False)

        assert email_service.send_weekly_digest(app) == 1

    def test_a_recipient_waits_for_its_own_slot(self, app, smtp):
        make_restaurant(app)
        _subscribe(make_user(app), slot='later')

        assert email_service.send_weekly_digest(app) == 0

    def test_an_editor_is_never_a_recipient(self, app, smtp):
        rid = make_restaurant(app)
        _subscribe(make_user(app, email='editor@mariam.app', role='editor', restaurant_id=rid))

        assert email_service.send_weekly_digest(app) == 0


class TestContent:
    def test_a_site_admin_reads_about_its_restaurant(self, app, client):
        rid = make_restaurant(app)
        user = User.query.get(make_user(app))
        start, end = email_service.last_week()

        digest = email_service.build_digest(user, [rid], start, end)

        assert 'RU Test' in digest['text']
        assert 'Publication' in digest['text']
        assert '/admin/stats' in digest['text']
        assert start.strftime('%d/%m') in digest['subject']

    def test_a_director_reads_about_the_organization(self, app, client):
        org = Organization(name='Org', slug='org-digest')
        db.session.add(org)
        db.session.commit()
        first = make_restaurant(app, name='Créteil', code='RU_A')
        second = make_restaurant(app, name='Villejuif', code='RU_B')
        for rid in (first, second):
            Restaurant.query.get(rid).organization_id = org.id
        director = User.query.get(
            make_user(app, email='dir@mariam.app', role='org_admin', restaurant_id=first)
        )
        director.restaurant_id = None
        director.organization_id = org.id
        db.session.commit()

        digest = email_service.build_digest(
            director, [first, second], *email_service.last_week()
        )

        assert '2 sites' in digest['text']
        assert 'Couverture' in digest['text']
        assert '/org' in digest['text']
        assert '<html' in digest['html']


class TestWeek:
    def test_last_week_runs_monday_to_sunday(self):
        start, end = email_service.last_week(date(2026, 9, 12))

        assert (start.isoformat(), end.isoformat()) == ('2026-08-31', '2026-09-06')


class TestUnsubscribe:
    def test_one_click_turns_the_digest_off(self, app, client):
        make_restaurant(app)
        uid = _subscribe(make_user(app))
        with app.app_context():
            token = email_service.unsubscribe_token(uid)

        assert client.post(f'/v1/public/unsubscribe/{token}').status_code == 204
        assert User.query.get(uid).get_notification_preferences()['weekly_digest'] is False

    def test_the_link_renders_a_confirmation(self, app, client):
        make_restaurant(app)
        uid = _subscribe(make_user(app))
        with app.app_context():
            token = email_service.unsubscribe_token(uid)

        res = client.get(f'/v1/public/unsubscribe/{token}')

        assert res.status_code == 200
        assert 'désactivé' in res.get_data(as_text=True)

    def test_a_forged_token_changes_nothing(self, app, client):
        make_restaurant(app)
        uid = _subscribe(make_user(app))

        res = client.get('/v1/public/unsubscribe/MQ.forged-signature')

        assert res.status_code == 200
        assert "n'est plus valide" in res.get_data(as_text=True)
        assert User.query.get(uid).get_notification_preferences()['weekly_digest'] is True
