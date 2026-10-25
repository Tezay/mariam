"""Weekly digest: who receives it, when it pauses, and what it carries."""
from datetime import date, timedelta
from urllib.parse import urlsplit

import pytest

from app.extensions import db
from app.models import ExceptionalClosure, Menu, Organization, Restaurant, User
from app.services import email_service
from app.utils.time import paris_now
from conftest import make_restaurant, make_user


def _subscribe(user_id, value=True, slot='now'):
    """Subscribe a user, by default in the slot the job is about to serve."""
    now = paris_now()
    hour = now.hour if slot == 'now' else (now.hour + 1) % 24
    user = db.session.get(User, user_id)
    user.notification_preferences = {
        'weekly_digest': value, 'digest_day': now.weekday(), 'digest_hour': hour,
    }
    db.session.commit()
    return user_id


def _publish(restaurant_id, *days):
    for day in days:
        db.session.add(Menu(restaurant_id=restaurant_id, date=day, status='published'))
    db.session.commit()


def _close(restaurant_id, first, last):
    db.session.add(ExceptionalClosure(
        restaurant_id=restaurant_id, start_date=first, end_date=last, is_active=True
    ))
    db.session.commit()


def _served_last_week(app, **restaurant):
    """A restaurant with a menu published in the week the job is about to report."""
    rid = make_restaurant(app, **restaurant)
    _publish(rid, email_service.last_week()[0])
    return rid


def _director(app, *site_ids, slug='org-digest'):
    org = Organization(name='Org', slug=slug)
    db.session.add(org)
    db.session.commit()
    for rid in site_ids:
        db.session.get(Restaurant, rid).organization_id = org.id
    director = db.session.get(
        User, make_user(app, email='dir@mariam.app', role='org_admin', restaurant_id=site_ids[0])
    )
    director.restaurant_id = None
    director.organization_id = org.id
    db.session.commit()
    return director


class TestConfiguration:
    def test_without_smtp_nothing_is_sent(self, app, monkeypatch):
        monkeypatch.delenv('SMTP_HOST', raising=False)
        make_restaurant(app)
        _subscribe(make_user(app))

        assert email_service.send_weekly_digest(app) == 0

    def test_a_send_reaches_the_relay(self, app, smtp):
        _served_last_week(app)
        _subscribe(make_user(app))

        assert email_service.send_weekly_digest(app) == 1
        assert smtp.sent[0]['To'] == 'admin@mariam.app'


class TestRecipients:
    def test_only_subscribers_receive_it(self, app, smtp):
        rid = _served_last_week(app)
        _subscribe(make_user(app))
        _subscribe(make_user(app, email='quiet@mariam.app', restaurant_id=rid), value=False)

        assert email_service.send_weekly_digest(app) == 1

    def test_a_recipient_waits_for_its_own_slot(self, app, smtp):
        make_restaurant(app)
        _subscribe(make_user(app), slot='later')

        assert email_service.send_weekly_digest(app) == 0

    def test_a_summary_that_fails_does_not_cost_the_others_theirs(self, app, smtp, monkeypatch):
        rid = _served_last_week(app)
        _subscribe(make_user(app, email='broken@mariam.app', restaurant_id=rid))
        _subscribe(make_user(app, email='sound@mariam.app', restaurant_id=rid))
        build_digest = email_service.build_digest

        def failing_for_one(user, *args, **kwargs):
            if user.email == 'broken@mariam.app':
                raise ValueError('malformed preference')
            return build_digest(user, *args, **kwargs)

        monkeypatch.setattr(email_service, 'build_digest', failing_for_one)

        assert email_service.send_weekly_digest(app) == 1
        assert smtp.sent[0]['To'] == 'sound@mariam.app'

    def test_an_editor_is_never_a_recipient(self, app, smtp):
        rid = make_restaurant(app)
        _subscribe(make_user(app, email='editor@mariam.app', role='editor', restaurant_id=rid))

        assert email_service.send_weekly_digest(app) == 0


class TestContent:
    def test_a_site_admin_reads_about_its_restaurant(self, app, client):
        rid = make_restaurant(app)
        user = db.session.get(User, make_user(app))
        start, end = email_service.last_week()

        digest = email_service.build_digest(user, [rid], start, end)

        assert 'RU Test' in digest['text']
        assert 'Publication' in digest['text']
        assert '/admin/stats' in digest['text']
        assert '/admin/account"' in digest['html']
        assert start.strftime('%d/%m') in digest['subject']

    def test_a_director_reads_about_the_organization(self, app, client):
        first = make_restaurant(app, name='Créteil', code='RU_A')
        second = make_restaurant(app, name='Villejuif', code='RU_B')
        director = _director(app, first, second)

        digest = email_service.build_digest(
            director, [first, second], *email_service.last_week()
        )

        assert '2 sites' in digest['text']
        assert 'Couverture' in digest['text']
        assert '/org' in digest['text']
        assert '/org/account"' in digest['html']
        assert '<html' in digest['html']

    def test_a_director_of_a_single_site_is_still_sent_to_the_organization(self, app):
        rid = make_restaurant(app)
        director = _director(app, rid)

        digest = email_service.build_digest(director, [rid], *email_service.last_week())

        assert 'RU Test' in digest['text']
        assert '/org/account"' in digest['html']
        assert '/admin' not in digest['text'] + digest['html']


MONDAY = date(2026, 9, 7)
REPORTED = date(2026, 8, 31)


def _owed(user, site_ids, today=MONDAY):
    mail = email_service.weekly_mail(user, site_ids, today)
    if mail is None:
        return None
    if 'réouverture' in mail['subject']:
        return 'reopening'
    return 'digest with notice' if 'depuis deux semaines' in mail['text'] else 'digest'


class TestWeeklySlot:
    def _site(self, app):
        rid = make_restaurant(app)
        return db.session.get(User, make_user(app)), rid

    @pytest.mark.parametrize('last_menu, owed', [
        (REPORTED, 'digest'),
        (REPORTED - timedelta(weeks=1), 'digest'),
        (REPORTED - timedelta(weeks=2), 'digest with notice'),
        (REPORTED - timedelta(weeks=3), None),
    ])
    def test_weeks_without_a_menu_bring_a_notice_then_silence(self, app, last_menu, owed):
        user, rid = self._site(app)
        _publish(rid, last_menu)

        assert _owed(user, [rid]) == owed

    def test_a_closed_week_starts_the_count_again(self, app):
        user, rid = self._site(app)
        _close(rid, REPORTED - timedelta(weeks=1), REPORTED - timedelta(days=1))

        assert _owed(user, [rid]) == 'digest'

    def test_a_week_closed_throughout_is_not_summarised(self, app):
        user, rid = self._site(app)
        _close(rid, REPORTED - timedelta(weeks=1), MONDAY + timedelta(weeks=3))

        assert _owed(user, [rid]) is None

    def test_a_week_closed_in_part_is_summarised(self, app):
        user, rid = self._site(app)
        _publish(rid, REPORTED)
        _close(rid, REPORTED + timedelta(days=2), REPORTED + timedelta(days=4))

        assert _owed(user, [rid]) == 'digest'

    def test_a_site_that_never_serves_is_never_summarised(self, app):
        user, rid = self._site(app)
        db.session.get(Restaurant, rid).service_days = []
        db.session.commit()

        assert _owed(user, [rid]) is None

    def test_the_notice_tells_a_site_team_how_to_declare_a_closure(self, app):
        user, rid = self._site(app)
        _publish(rid, REPORTED - timedelta(weeks=2))

        mail = email_service.weekly_mail(user, [rid], MONDAY)

        assert 'Votre restaurant est fermé ?' in mail['text']
        assert '« Nouvelle fermeture »' in mail['text']
        assert '/admin/calendar' in mail['html']


class TestReopening:
    CLOSED = (date(2026, 8, 1), date(2026, 9, 13))

    @pytest.mark.parametrize('today, owed', [
        (date(2026, 9, 7), None),
        (date(2026, 9, 14), 'reopening'),
        (date(2026, 9, 21), 'digest'),
        (date(2026, 9, 9), 'reopening'),
        (date(2026, 9, 16), None),
    ])
    def test_it_is_announced_once_at_the_last_slot_before_the_doors_open(self, app, today, owed):
        rid = make_restaurant(app)
        user = db.session.get(User, make_user(app))
        _close(rid, *self.CLOSED)

        assert _owed(user, [rid], today) == owed

    def test_it_names_the_day_and_the_menus_still_to_prepare(self, app):
        rid = make_restaurant(app)
        user = db.session.get(User, make_user(app))
        _close(rid, *self.CLOSED)
        _publish(rid, date(2026, 9, 14), date(2026, 9, 15))

        mail = email_service.weekly_mail(user, [rid], date(2026, 9, 14))

        assert mail['subject'] == 'Mariam, réouverture lundi 14 septembre'
        assert "2 publiés sur 5 jours d'ouverture" in mail['text']
        assert 'À préparer : mercredi 16 septembre, jeudi 17 septembre, vendredi 18 septembre.' in mail['text']
        assert '/admin/calendar' in mail['html']

    def test_it_says_so_when_every_menu_is_ready(self, app):
        rid = make_restaurant(app)
        user = db.session.get(User, make_user(app))
        _close(rid, *self.CLOSED)
        _publish(rid, *(date(2026, 9, 14) + timedelta(days=offset) for offset in range(5)))

        mail = email_service.weekly_mail(user, [rid], date(2026, 9, 14))

        assert 'Les menus de la semaine de reprise sont publiés.' in mail['text']
        assert 'À préparer' not in mail['text'] + mail['html']


class TestSupervisor:
    def _sites(self, app):
        first = make_restaurant(app, name='Créteil', code='RU_A')
        second = make_restaurant(app, name='Villejuif', code='RU_B')
        return _director(app, first, second), first, second

    def test_one_open_site_is_enough_for_a_summary(self, app):
        director, first, second = self._sites(app)
        _publish(first, REPORTED)
        _close(second, REPORTED - timedelta(weeks=1), MONDAY + timedelta(weeks=3))

        assert _owed(director, [first, second]) == 'digest'

    def test_the_notice_waits_for_every_site_to_fall_silent(self, app):
        director, first, second = self._sites(app)
        _publish(first, REPORTED - timedelta(weeks=2))

        mail = email_service.weekly_mail(director, [first, second], MONDAY)

        assert "Aucun de vos sites n'a publié de menu depuis deux semaines." in mail['text']
        assert 'Nouvelle fermeture' not in mail['text'] + mail['html']

    def test_the_reopening_names_every_site_that_opens_again(self, app):
        director, first, second = self._sites(app)
        _close(first, date(2026, 8, 1), date(2026, 9, 13))
        _close(second, date(2026, 8, 1), date(2026, 9, 14))
        _publish(second, date(2026, 9, 15))

        mail = email_service.weekly_mail(director, [first, second], date(2026, 9, 14))

        assert mail['subject'] == 'Mariam, réouverture de vos sites'
        assert 'Créteil : lundi 14 septembre, 0 menu publié sur 5' in mail['text']
        assert 'Villejuif : mardi 15 septembre, 1 menu publié sur 4' in mail['text']
        assert '/org' in mail['html']


class TestJob:
    def test_a_closed_week_sends_nothing(self, app, smtp):
        rid = make_restaurant(app)
        _subscribe(make_user(app))
        start, end = email_service.last_week()
        _close(rid, start, end + timedelta(weeks=3))

        assert email_service.send_weekly_digest(app) == 0

    def test_the_reopening_notice_goes_out_in_place_of_the_digest(self, app, smtp):
        rid = make_restaurant(app)
        _subscribe(make_user(app))
        start, _ = email_service.last_week()
        _close(rid, start, paris_now().date() - timedelta(days=1))

        assert email_service.send_weekly_digest(app) == 1
        assert smtp.sent[0]['Subject'].startswith('Mariam, réouverture')
        assert 'List-Unsubscribe' in smtp.sent[0]


class TestWeek:
    def test_last_week_runs_monday_to_sunday(self):
        start, end = email_service.last_week(date(2026, 9, 12))

        assert (start.isoformat(), end.isoformat()) == ('2026-08-31', '2026-09-06')


class TestUnsubscribe:
    def _token(self, app, uid):
        with app.app_context():
            return email_service.unsubscribe_token(uid)

    def test_the_mail_clients_link_reaches_the_action(self, app, client):
        make_restaurant(app)
        uid = _subscribe(make_user(app))
        path = urlsplit(email_service.unsubscribe_url(uid)).path

        res = client.post(
            path, data='List-Unsubscribe=One-Click', content_type='application/x-www-form-urlencoded'
        )

        assert res.status_code == 204
        assert db.session.get(User, uid).get_notification_preferences()['weekly_digest'] is False

    def test_opening_a_link_unsubscribes_no_one(self, app, client):
        make_restaurant(app)
        uid = _subscribe(make_user(app))

        client.get(urlsplit(email_service.unsubscribe_url(uid)).path)

        assert db.session.get(User, uid).get_notification_preferences()['weekly_digest'] is True

    @pytest.mark.parametrize('api_url, base', [
        (None, 'https://mariam.example.org/v1'),
        ('/v1', 'https://mariam.example.org/v1'),
        ('https://api.example.org/v1/', 'https://api.example.org/v1'),
    ])
    def test_the_action_follows_where_the_api_is_served(self, app, monkeypatch, api_url, base):
        monkeypatch.setenv('FRONTEND_URL', 'https://mariam.example.org,https://other.example.org')
        if api_url is None:
            monkeypatch.delenv('API_URL', raising=False)
        else:
            monkeypatch.setenv('API_URL', api_url)
        uid = make_user(app)

        link = email_service.unsubscribe_url(uid)

        assert link == f'{base}/weekly-emails/{self._token(app, uid)}/unsubscribe'

    def test_the_emails_own_link_opens_the_page(self, app, monkeypatch):
        monkeypatch.setenv('FRONTEND_URL', 'https://mariam.example.org,https://other.example.org')
        uid = make_user(app)

        link = email_service.unsubscribe_page_url(uid)

        assert link == f'https://mariam.example.org/unsubscribe/{self._token(app, uid)}'

    def test_a_forged_token_changes_nothing(self, app, client):
        make_restaurant(app)
        uid = _subscribe(make_user(app))

        res = client.post('/v1/weekly-emails/MQ.forged-signature/unsubscribe')

        assert res.get_json()['code'] == 'link_invalid'
        assert db.session.get(User, uid).get_notification_preferences()['weekly_digest'] is True
