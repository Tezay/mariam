"""Reminders of a subscription's end: when they are due, who hears of them, and only once."""
from datetime import date, timedelta

import pytest

from app.extensions import db
from app.models import Organization, Restaurant, SubscriptionPeriod, SubscriptionReminder, User
from app.services import subscription_reminders
from app.services.alerts import live_alerts
from app.services.subscription_reminders import send_subscription_reminders
from app.services.subscriptions import Period, due_reminder, standing
from app.utils.time import paris_today
from conftest import join_site, make_restaurant, make_user

TODAY = date(2027, 6, 15)


def _position(days_left, kind='paid', renewal='undecided', tacit_until=None):
    period = Period(
        kind=kind, starts_on=TODAY - timedelta(days=30), ends_on=TODAY + timedelta(days=days_left),
        renewal=renewal, tacit_until=tacit_until, notice_by=None, quote_ref=None, order_ref=None,
        payer_name=None, payer_siret=None, payer_service_code=None,
    )
    return standing([period], TODAY)


class TestDueReminder:
    @pytest.mark.parametrize(('days_left', 'due'), [(91, None), (90, 90), (25, 30), (7, 7), (0, 7)])
    def test_a_period_to_renew_takes_the_tightest_threshold_crossed(self, days_left, due):
        assert due_reminder(_position(days_left)) == due

    def test_a_trial_is_reminded_closer_to_its_end(self):
        assert [due_reminder(_position(days, kind='trial')) for days in (20, 10, 2)] == [None, 14, 3]

    def test_an_announced_end_gives_notice_a_month_ahead(self):
        assert [due_reminder(_position(days, renewal='ending')) for days in (40, 25)] == [None, 30]

    def test_a_covered_end_is_never_reminded(self):
        covered = _position(10, renewal='tacit', tacit_until=TODAY + timedelta(days=400))

        assert (covered.end, due_reminder(covered)) == ('covered', None)


@pytest.fixture()
def no_lock(monkeypatch):
    monkeypatch.setattr(subscription_reminders, 'acquire_job_lock', lambda *_: True)


def _period(site_id, days_left, **terms):
    today = paris_today()
    period = SubscriptionPeriod(
        restaurant_id=site_id, kind=terms.pop('kind', 'paid'),
        starts_on=today - timedelta(days=200), ends_on=today + timedelta(days=days_left), **terms,
    )
    db.session.add(period)
    db.session.commit()
    return period


@pytest.fixture()
def site(app):
    site_id = make_restaurant(app)
    make_user(app, email='admin@mariam.app', restaurant_id=site_id)
    return site_id


def _recipients(smtp):
    return sorted(message['To'] for message in smtp.sent)


class TestTheDailyJob:
    def test_each_admin_gets_one_email_naming_each_of_its_sites(self, app, smtp, no_lock, site):
        other = make_restaurant(app, name='RU Nord', code='RU_NORD')
        admin = User.query.filter_by(email='admin@mariam.app').one()
        join_site(admin.id, other, 'admin')
        _period(site, 25)
        _period(other, 80)

        assert send_subscription_reminders(app) == 2

        (message,) = smtp.sent
        assert message['Subject'] == 'Abonnements : 2 échéances à venir'
        text = message.get_body(('plain',)).get_content()
        assert 'RU Test' in text and 'RU Nord' in text
        assert '/admin/' in text and '/subscription' in text

    def test_editors_supervisors_and_disabled_accounts_hear_nothing(self, app, smtp, no_lock, site):
        organization = db.session.get(Restaurant, site).organization
        make_user(app, email='editor@mariam.app', role='editor', restaurant_id=site)
        make_user(app, email='sup@mariam.app', role='org_admin', organization_id=organization.id)
        gone = db.session.get(User, make_user(app, email='gone@mariam.app', restaurant_id=site))
        gone.is_active = False
        db.session.commit()
        _period(site, 25)

        send_subscription_reminders(app)

        assert _recipients(smtp) == ['admin@mariam.app']

    def test_a_covered_end_sends_nothing(self, app, smtp, no_lock, site):
        _period(site, 25, renewal='tacit', tacit_until=paris_today() + timedelta(days=400))

        assert send_subscription_reminders(app) == 0
        assert smtp.sent == []

    def test_a_threshold_goes_out_once(self, app, smtp, no_lock, site):
        _period(site, 25)

        send_subscription_reminders(app)
        send_subscription_reminders(app)

        assert len(smtp.sent) == 1
        assert SubscriptionReminder.query.one().days == 30

    def test_a_new_last_day_is_a_new_reminder(self, app, smtp, no_lock, site):
        period = _period(site, 25)
        send_subscription_reminders(app)
        period.ends_on -= timedelta(days=5)
        db.session.commit()

        send_subscription_reminders(app)

        assert len(smtp.sent) == 2

    def test_a_reminder_no_admin_received_is_tried_again(self, app, smtp, no_lock, site, monkeypatch):
        _period(site, 25)
        monkeypatch.setattr(subscription_reminders, 'send_email', lambda *_, **__: False)

        send_subscription_reminders(app)

        assert SubscriptionReminder.query.count() == 0

    def test_nothing_leaves_without_smtp(self, app, no_lock, site):
        _period(site, 25)

        assert send_subscription_reminders(app) == 0
        assert SubscriptionReminder.query.count() == 0


class TestTheBell:
    def test_the_admin_and_the_supervisor_see_it_the_editor_does_not(self, app, site):
        organization = db.session.get(Restaurant, site).organization
        admin = User.query.filter_by(email='admin@mariam.app').one()
        editor = db.session.get(
            User, make_user(app, email='editor@mariam.app', role='editor', restaurant_id=site)
        )
        supervisor = db.session.get(User, make_user(
            app, email='sup@mariam.app', role='org_admin', organization_id=organization.id
        ))
        _period(site, 25)

        def keys(user):
            return [alert['key'].split(':')[0] for alert in live_alerts(user, [site])]

        assert 'subscription_renewal' in keys(admin)
        assert 'subscription_renewal' in keys(supervisor)
        assert 'subscription_renewal' not in keys(editor)

    def test_a_period_past_its_end_warns(self, app, site):
        admin = User.query.filter_by(email='admin@mariam.app').one()
        _period(site, -3)

        (alert,) = [a for a in live_alerts(admin, [site]) if a['key'].startswith('subscription')]

        assert alert['severity'] == 'warning'
        assert 'est arrivé à échéance' in alert['body']

    def test_the_weekly_summary_leaves_it_out(self, app, site):
        admin = User.query.filter_by(email='admin@mariam.app').one()
        _period(site, 25)

        alerts = live_alerts(admin, [site], digest=True)

        assert not any(alert['key'].startswith('subscription') for alert in alerts)


class TestSendReminder:
    def _run(self, app, *args):
        return app.test_cli_runner().invoke(args=['subscription', 'send-reminder', 'ru-test', *args])

    def test_a_covered_end_is_refused(self, app, smtp, site):
        _period(site, 25, renewal='tacit', tacit_until=paris_today() + timedelta(days=400))

        result = self._run(app)

        assert result.exit_code != 0
        assert 'Nothing to remind' in result.output
        assert smtp.sent == []

    def test_a_dry_run_shows_the_email_and_sends_nothing(self, app, smtp, site):
        _period(site, 120, kind='trial')

        result = self._run(app, '--dry-run')

        assert result.exit_code == 0, result.output
        assert 'To: admin@mariam.app' in result.output
        assert "L'essai gratuit de RU Test se termine" in result.output
        assert smtp.sent == []

    def test_it_sends_now_and_counts_no_threshold(self, app, smtp, site):
        _period(site, 120)

        result = self._run(app)

        assert result.exit_code == 0, result.output
        assert _recipients(smtp) == ['admin@mariam.app']
        assert SubscriptionReminder.query.count() == 0


def test_an_organization_elsewhere_is_never_named(app, smtp, no_lock, site):
    elsewhere = Organization(name='Ailleurs', slug='ailleurs')
    db.session.add(elsewhere)
    db.session.commit()
    other = make_restaurant(app, name='RU Ailleurs', code='RU_AILLEURS', organization_id=elsewhere.id)
    make_user(app, email='other@mariam.app', restaurant_id=other)
    _period(site, 25)
    _period(other, 25)

    send_subscription_reminders(app)

    by_recipient = {
        message['To']: message.get_body(('plain',)).get_content() for message in smtp.sent
    }
    assert 'RU Ailleurs' not in by_recipient['admin@mariam.app']
    assert 'RU Test' not in by_recipient['other@mariam.app']
