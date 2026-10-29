"""The signed-in account: its profile, its preferences and its alerts."""
import pytest
from flask_jwt_extended import decode_token

from app.extensions import db
from app.models import ActivationLink, AuditLog, ExceptionalClosure, Organization, Restaurant, User
from app.utils.time import paris_today
from conftest import auth_headers, make_restaurant, make_user, session_tokens
from tests.auth_support import (
    confirmed_headers,
    enable_totp,
    is_signed_in,
    issue_session,
    reset_link,
    session_headers,
)

NEW_ADDRESS = 'moved@mariam.app'


def _update(client, user_id, **changes):
    return client.patch(
        '/v1/user', json=changes, headers=confirmed_headers(client, user_id)
    )


def _update_from(client, user_id, access_token, **changes):
    """From a session an earlier change kept: one minted here, within the second
    of that change, would fall under its revocation.
    """
    headers = confirmed_headers(client, user_id, auth_headers(access_token))
    return client.patch('/v1/user', json=changes, headers=headers)


def _refresh(client, refresh_token):
    return client.post('/v1/auth/refresh', headers=auth_headers(refresh_token))


class TestConfirmation:
    def test_nothing_changes_from_an_unconfirmed_session(self, app, client):
        uid = make_user(app)
        enable_totp(uid)

        res = client.patch(
            '/v1/user', json={'username': 'Jean Dupont'}, headers=session_headers(uid)
        )

        assert res.get_json()['code'] == 'step_up_required'
        assert db.session.get(User, uid).username == 'admin'

    def test_a_new_address_closes_the_confirmation(self, app, client):
        uid = make_user(app)
        _update(client, uid, email=NEW_ADDRESS)
        kept = auth_headers(session_tokens(client)['access_token'])

        refused = client.patch('/v1/user', json={'username': 'Jean Dupont'}, headers=kept)
        confirmed = client.patch(
            '/v1/user',
            json={'username': 'Jean Dupont'},
            headers=confirmed_headers(client, uid, kept),
        )

        assert (refused.status_code, confirmed.status_code) == (403, 200)


class TestName:
    def test_the_name_changes_and_the_session_stays(self, app, client):
        uid = make_user(app)
        session = issue_session(uid)

        res = _update(client, uid, username='  Jean   Dupont ')

        assert res.status_code == 200
        assert res.get_json()['username'] == 'Jean Dupont'
        assert session_tokens(client)['access_token'] is None
        assert is_signed_in(client, session)
        entry = AuditLog.query.filter_by(action=AuditLog.ACTION_USER_UPDATE).one()
        assert entry.get_details() == {'field': 'username', 'old': 'admin', 'new': 'Jean Dupont'}

    @pytest.mark.parametrize('changes', [{}, {'username': 'J'}, {'username': 'Agent 007'}])
    def test_an_empty_or_malformed_change_is_refused(self, app, client, changes):
        uid = make_user(app)

        assert _update(client, uid, **changes).status_code == 422
        assert db.session.get(User, uid).username == 'admin'


class TestAddress:
    def test_the_address_changes_and_signs_in(self, app, client):
        uid = make_user(app)

        res = _update(client, uid, email=' Moved@Mariam.App ')

        assert res.status_code == 200
        assert db.session.get(User, uid).email == NEW_ADDRESS
        entry = AuditLog.query.filter_by(action=AuditLog.ACTION_EMAIL_CHANGE).one()
        assert entry.get_details() == {
            'success': True, 'old': 'admin@mariam.app', 'new': NEW_ADDRESS,
        }

    def test_every_other_session_ends_and_the_caller_keeps_one(self, app, client):
        uid = make_user(app)
        elsewhere = issue_session(uid)

        _update(client, uid, email=NEW_ADDRESS)
        kept = session_tokens(client)

        assert not is_signed_in(client, elsewhere)
        assert _refresh(client, elsewhere['refresh']).status_code == 401
        assert client.get('/v1/user', headers=auth_headers(kept['access_token'])).status_code == 200

    def test_the_kept_session_refreshes(self, app, client):
        uid = make_user(app)
        _update(client, uid, email=NEW_ADDRESS)
        kept = session_tokens(client)

        _refresh(client, kept['refresh_token'])
        refreshed = session_tokens(client)['access_token']

        assert client.get('/v1/user', headers=auth_headers(refreshed)).status_code == 200
        assert decode_token(refreshed)[User.REVOCATION_MARKER] == (
            db.session.get(User, uid).revocation_marker()
        )

    def test_a_later_revocation_ends_the_session_an_earlier_one_kept(self, app, client):
        uid = make_user(app)
        _update(client, uid, email=NEW_ADDRESS)
        kept = session_tokens(client)

        db.session.get(User, uid).revoke_tokens()
        db.session.commit()

        assert client.get('/v1/user', headers=auth_headers(kept['access_token'])).status_code == 401
        assert _refresh(client, kept['refresh_token']).status_code == 401

    def test_an_address_in_use_is_refused_and_audited(self, app, client):
        uid = make_user(app)
        make_user(app, email='taken@mariam.app')

        res = _update(client, uid, email='Taken@Mariam.app')

        assert res.get_json()['code'] == 'email_taken'
        assert db.session.get(User, uid).email == 'admin@mariam.app'
        entry = AuditLog.query.filter_by(action=AuditLog.ACTION_EMAIL_CHANGE).one()
        assert entry.get_details() == {'success': False, 'reason': 'address_in_use'}

    def test_the_rescue_account_keeps_its_address_but_not_its_name(self, app, client):
        uid = make_user(app)
        db.session.get(User, uid).is_rescue_account = True
        db.session.commit()

        assert _update(client, uid, email=NEW_ADDRESS).get_json()['code'] == 'rescue_account'
        assert _update(client, uid, username='Jean Dupont').status_code == 200
        user = db.session.get(User, uid)
        assert (user.email, user.username) == ('admin@mariam.app', 'Jean Dupont')
        entry = AuditLog.query.filter_by(action=AuditLog.ACTION_EMAIL_CHANGE).one()
        assert entry.get_details() == {'success': False, 'reason': 'rescue_account'}

    def test_the_profile_says_when_the_address_is_frozen(self, app, client):
        uid = make_user(app)
        before = client.get('/v1/user', headers=session_headers(uid)).get_json()
        db.session.get(User, uid).is_rescue_account = True
        db.session.commit()

        after = client.get('/v1/user', headers=session_headers(uid)).get_json()

        assert (before['is_rescue_account'], after['is_rescue_account']) == (False, True)

    def test_a_third_change_within_a_day_is_refused_and_audited(self, app, client):
        uid = make_user(app)
        _update(client, uid, email='first@mariam.app')
        first = session_tokens(client)
        _update_from(client, uid, first['access_token'], email='second@mariam.app')
        second = session_tokens(client)

        res = _update_from(client, uid, second['access_token'], email='third@mariam.app')

        assert res.get_json()['code'] == 'email_change_limit'
        assert int(res.headers['Retry-After']) > 0
        assert db.session.get(User, uid).email == 'second@mariam.app'
        refusals = [
            entry.get_details()
            for entry in AuditLog.query.filter_by(action=AuditLog.ACTION_EMAIL_CHANGE)
            if not entry.get_details()['success']
        ]
        assert refusals == [{'success': False, 'reason': 'daily_limit'}]

    def test_a_refused_address_does_not_count_against_the_day(self, app, client):
        uid = make_user(app)
        make_user(app, email='taken@mariam.app')
        for _ in range(3):
            assert _update(client, uid, email='taken@mariam.app').status_code == 409

        assert _update(client, uid, email=NEW_ADDRESS).status_code == 200

    def test_the_same_address_is_no_change(self, app, client):
        uid = make_user(app)
        session = issue_session(uid)

        res = _update(client, uid, email='admin@mariam.app')

        assert res.status_code == 200
        assert session_tokens(client)['access_token'] is None
        assert is_signed_in(client, session)

    def test_pending_reset_links_are_spent(self, app, client):
        uid = make_user(app)
        token = reset_link('admin@mariam.app')

        _update(client, uid, email=NEW_ADDRESS)

        assert ActivationLink.query.filter_by(token=token).one().used_at is not None


class TestAlert:
    def test_the_old_address_is_told_without_the_new_one_in_full(self, app, client, smtp):
        uid = make_user(app)

        _update(client, uid, email=NEW_ADDRESS)

        (message,) = smtp.sent
        body = message.get_body(('plain',)).get_content()
        assert message['To'] == 'admin@mariam.app'
        assert 'm•••@mariam.app' in body
        assert NEW_ADDRESS not in message.as_string()

    def test_a_name_change_sends_nothing(self, app, client, smtp):
        _update(client, make_user(app), username='Jean Dupont')

        assert smtp.sent == []

    def test_a_relay_that_fails_does_not_undo_the_change(self, app, client, monkeypatch):
        def refuse(*_args, **_kwargs):
            raise OSError('relay unreachable')

        monkeypatch.setenv('SMTP_HOST', 'smtp.example.org')
        monkeypatch.setenv('SMTP_SENDER', 'mariam@example.org')
        monkeypatch.setattr('smtplib.SMTP', refuse)
        uid = make_user(app)

        res = _update(client, uid, email=NEW_ADDRESS)

        assert res.status_code == 200
        assert db.session.get(User, uid).email == NEW_ADDRESS


class TestProfile:
    def test_the_site_and_the_organization_are_named_not_numbered(self, app, client):
        org = Organization(name='Crous Paris', slug='crous-paris')
        db.session.add(org)
        db.session.commit()
        rid = make_restaurant(None, name='RU Nord', code='RU_NORD', organization_id=org.id)
        uid = make_user(None, restaurant_id=rid)

        body = client.get('/v1/user', headers=session_headers(uid)).get_json()

        assert body['site'] == {'slug': 'ru-nord', 'name': 'RU Nord'}
        assert body['organization'] == {'slug': 'crous-paris', 'name': 'Crous Paris'}
        assert not {'restaurant_id', 'organization_id', 'mfa_secret', 'password_hash'} & body.keys()

    def test_a_supervisor_has_an_organization_and_no_site(self, app, client):
        org = Organization(name='Crous Paris', slug='crous-paris')
        db.session.add(org)
        db.session.commit()
        uid = make_user(None, role='org_admin', restaurant_id=None)
        db.session.get(User, uid).organization_id = org.id
        db.session.commit()

        body = client.get('/v1/user', headers=session_headers(uid)).get_json()

        assert (body['site'], body['organization']['slug']) == (None, 'crous-paris')

    def test_the_profile_requires_a_session(self, client):
        assert client.get('/v1/user').status_code == 401


class TestUiPreferences:
    def test_defaults_when_never_set(self, app, client):
        res = client.get('/v1/user/ui-preferences', headers=session_headers(make_user(app)))

        assert res.get_json() == {
            'tour_done': False, 'tour_catalog_done': False, 'tour_stats_done': False,
        }

    def test_a_change_keeps_the_others(self, app, client):
        headers = session_headers(make_user(app))
        client.patch('/v1/user/ui-preferences', json={'tour_catalog_done': True}, headers=headers)

        res = client.patch('/v1/user/ui-preferences', json={'tour_done': True}, headers=headers)

        assert res.get_json() == {
            'tour_done': True, 'tour_catalog_done': True, 'tour_stats_done': False,
        }

    def test_an_unknown_key_is_ignored(self, app, client):
        uid = make_user(app)

        res = client.patch(
            '/v1/user/ui-preferences', json={'is_admin': True}, headers=session_headers(uid)
        )

        assert 'is_admin' not in res.get_json()
        assert 'is_admin' not in db.session.get(User, uid).ui_preferences

    def test_a_value_that_is_not_a_boolean_is_refused(self, app, client):
        uid = make_user(app)

        res = client.patch(
            '/v1/user/ui-preferences', json={'tour_done': 'x' * 10}, headers=session_headers(uid)
        )

        assert res.status_code == 422
        assert db.session.get(User, uid).ui_preferences is None


class TestNotificationPreferences:
    def test_defaults_when_never_set(self, app, client):
        res = client.get(
            '/v1/user/notification-preferences', headers=session_headers(make_user(app))
        )

        prefs = res.get_json()
        assert prefs['notify_menu_unpublished'] is True
        assert prefs['holiday_alert_days_before'] == 5

    def test_a_change_keeps_the_others(self, app, client):
        headers = session_headers(make_user(app))

        client.patch(
            '/v1/user/notification-preferences',
            json={'notify_menu_unpublished': False, 'holiday_alert_days_before': 3,
                  'inconnu': 'ignoré'},
            headers=headers,
        )

        prefs = client.get('/v1/user/notification-preferences', headers=headers).get_json()
        assert prefs['notify_menu_unpublished'] is False
        assert prefs['holiday_alert_days_before'] == 3
        assert prefs['notify_menu_tomorrow'] is True
        assert 'inconnu' not in prefs

    @pytest.mark.parametrize('change', [
        {'holiday_alert_days_before': 'abc'},
        {'holiday_alert_days_before': 0},
        {'holiday_alert_days_before': 31},
        {'digest_day': 7},
        {'digest_hour': 5},
        {'notify_menu_unpublished': 'x' * 100},
        ['weekly_digest'],
    ])
    def test_a_malformed_change_is_refused_and_stores_nothing(self, app, client, change):
        uid = make_user(app)

        res = client.patch(
            '/v1/user/notification-preferences', json=change, headers=session_headers(uid)
        )

        assert res.status_code == 422
        assert db.session.get(User, uid).notification_preferences is None


def _serving_today(restaurant_id: int) -> int:
    """Pin the weekly schedule so the alert does not depend on the run date."""
    restaurant = db.session.get(Restaurant, restaurant_id)
    restaurant.service_days = list(range(7))
    db.session.commit()
    return restaurant_id


def _alert_keys(client, user_id):
    res = client.get('/v1/user/alerts', headers=session_headers(user_id))
    return [alert['key'] for alert in res.get_json()['items']]


class TestAlerts:
    def test_no_menu_alert_when_the_site_does_not_serve_today(self, app, client):
        """A missing menu is only a gap on a day the restaurant opens."""
        rid = make_restaurant(app)
        db.session.get(Restaurant, rid).service_days = [(paris_today().weekday() + 1) % 7]
        db.session.commit()

        keys = _alert_keys(client, make_user(app, restaurant_id=rid))

        assert not any(key.startswith('menu_unpublished:') for key in keys)

    def test_no_menu_alert_during_an_exceptional_closure(self, app, client):
        rid = _serving_today(make_restaurant(app))
        today = paris_today()
        db.session.add(
            ExceptionalClosure(restaurant_id=rid, start_date=today, end_date=today, is_active=True)
        )
        db.session.commit()

        keys = _alert_keys(client, make_user(app, restaurant_id=rid))

        assert not any(key.startswith('menu_unpublished:') for key in keys)
