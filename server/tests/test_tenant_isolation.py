"""
Multi-tenant isolation tests.

Verify that a user can never read or modify another restaurant/organization's
data: events, closures, users, settings, audit, imports. Also cover token
revocation, org_admin scoping, and removal of the "first active restaurant"
fallback.
"""
import datetime

from flask_jwt_extended import decode_token

from app.extensions import db
from app.models import Event, ExceptionalClosure, Organization, Restaurant, User
from app.utils.time import paris_today
from conftest import TEST_PASSWORD, auth_headers, get_token, make_restaurant, make_user


def _today_iso():
    # Routes filter on paris_today(); date.today() is UTC in the container and
    # drifts a day behind late in the evening.
    return paris_today().isoformat()


def _make_org(name='Test Org', slug='test-org'):
    org = Organization(name=name, slug=slug)
    db.session.add(org)
    db.session.commit()
    return org.id


def _make_user(email, role, restaurant_id, organization_id=None, with_mfa=False):
    uid = make_user(None, email=email, role=role, restaurant_id=restaurant_id)
    user = User.query.get(uid)
    user.organization_id = organization_id
    if with_mfa:
        user.mfa_secret = 'JBSWY3DPEHPK3PXP'
        user.mfa_enabled = True
    db.session.commit()
    return uid


def _two_tenants():
    """Two distinct organizations, each with one restaurant and one admin."""
    org_a, org_b = _make_org(slug='org-a'), _make_org(slug='org-b')
    rid_a = make_restaurant(None, name='RU A', code='RU_A')
    rid_b = make_restaurant(None, name='RU B', code='RU_B')
    Restaurant.query.get(rid_a).organization_id = org_a
    Restaurant.query.get(rid_b).organization_id = org_b
    db.session.commit()
    _make_user('a@mariam.app', 'admin', rid_a, org_a)
    _make_user('b@mariam.app', 'admin', rid_b, org_b)
    return rid_a, rid_b


def _make_event(restaurant_id, title='Event', status='draft'):
    ev = Event(
        restaurant_id=restaurant_id, title=title,
        event_date=paris_today(), status=status, visibility='all',
    )
    db.session.add(ev)
    db.session.commit()
    return ev.id


class TestEventTenantIsolation:
    def test_cannot_read_other_tenant_event(self, app, client):
        _, rid_b = _two_tenants()
        event_id = _make_event(rid_b)
        token_a = get_token(client, email='a@mariam.app')
        assert client.get(f'/v1/events/{event_id}', headers=auth_headers(token_a)).status_code == 404

    def test_cannot_update_other_tenant_event(self, app, client):
        _, rid_b = _two_tenants()
        event_id = _make_event(rid_b)
        token_a = get_token(client, email='a@mariam.app')
        res = client.put(f'/v1/events/{event_id}',
                         json={'title': 'hacked'}, headers=auth_headers(token_a))
        assert res.status_code == 404
        assert Event.query.get(event_id).title == 'Event'

    def test_cannot_delete_or_publish_other_tenant_event(self, app, client):
        _, rid_b = _two_tenants()
        event_id = _make_event(rid_b)
        token_a = get_token(client, email='a@mariam.app')
        assert client.delete(f'/v1/events/{event_id}', headers=auth_headers(token_a)).status_code == 404
        assert client.post(f'/v1/events/{event_id}/publish', headers=auth_headers(token_a)).status_code == 404
        assert Event.query.get(event_id) is not None

    def test_cannot_delete_other_tenant_event_image(self, app, client):
        from app.models import EventImage
        _, rid_b = _two_tenants()
        event_id = _make_event(rid_b)
        img = EventImage(event_id=event_id, storage_key='k', url='u', filename='f', order=0)
        db.session.add(img)
        db.session.commit()
        token_a = get_token(client, email='a@mariam.app')
        res = client.delete(f'/v1/events/{event_id}/images/{img.id}',
                            headers=auth_headers(token_a))
        assert res.status_code == 404
        assert EventImage.query.get(img.id) is not None  # not deleted

    def test_create_event_ignores_body_restaurant_id(self, app, client):
        rid_a, rid_b = _two_tenants()
        token_a = get_token(client, email='a@mariam.app')
        res = client.post('/v1/events',
                          json={'title': 'At A', 'event_date': _today_iso(),
                                'restaurant_id': rid_b},
                          headers=auth_headers(token_a))
        assert res.status_code == 201
        created = Event.query.filter_by(title='At A').first()
        assert created.restaurant_id == rid_a  # forced to the caller's restaurant


class TestClosureTenantIsolation:
    def _make_closure(self, restaurant_id):
        c = ExceptionalClosure(
            restaurant_id=restaurant_id,
            start_date=datetime.date.today(),
            end_date=datetime.date.today(),
        )
        db.session.add(c)
        db.session.commit()
        return c.id

    def test_cannot_update_or_delete_other_tenant_closure(self, app, client):
        _, rid_b = _two_tenants()
        closure_id = self._make_closure(rid_b)
        token_a = get_token(client, email='a@mariam.app')
        assert client.put(f'/v1/closures/{closure_id}',
                          json={'reason': 'x'}, headers=auth_headers(token_a)).status_code == 404
        assert client.delete(f'/v1/closures/{closure_id}',
                             headers=auth_headers(token_a)).status_code == 404


class TestUserTenantIsolation:
    def test_list_users_scoped_to_own_restaurant(self, app, client):
        _two_tenants()
        token_a = get_token(client, email='a@mariam.app')
        users = client.get('/v1/users', headers=auth_headers(token_a)).get_json()['users']
        emails = {u['email'] for u in users}
        assert emails == {'a@mariam.app'}

    def test_cannot_manage_other_tenant_user(self, app, client):
        _two_tenants()
        user_b = User.query.filter_by(email='b@mariam.app').first()
        token_a = get_token(client, email='a@mariam.app')
        assert client.get(f'/v1/users/{user_b.id}', headers=auth_headers(token_a)).status_code == 404
        assert client.delete(f'/v1/users/{user_b.id}', headers=auth_headers(token_a)).status_code == 404
        assert client.post(f'/v1/users/{user_b.id}/reset-mfa',
                           headers=auth_headers(token_a)).status_code == 404


class TestSettingsTenantIsolation:
    """Regression of the P0 bug: update settings targeted the first active restaurant."""

    def test_update_settings_targets_own_restaurant(self, app, client):
        rid_a, rid_b = _two_tenants()
        name_b_before = Restaurant.query.get(rid_b).name
        token_b = get_token(client, email='b@mariam.app')
        res = client.put('/v1/settings', json={'name': 'Renamed by B'},
                         headers=auth_headers(token_b))
        assert res.status_code == 200
        assert Restaurant.query.get(rid_b).name == 'Renamed by B'
        assert Restaurant.query.get(rid_a).name == 'RU A'  # A untouched
        assert name_b_before != 'Renamed by B'


class TestAuditTenantIsolation:
    def test_audit_logs_scoped_to_tenant(self, app, client):
        rid_a, rid_b = _two_tenants()
        # MFA required to read the audit log
        User.query.filter_by(email='a@mariam.app').first().mfa_secret = 'JBSWY3DPEHPK3PXP'
        from app.models import AuditLog
        AuditLog.log(action='login', user_id=User.query.filter_by(email='a@mariam.app').first().id,
                     restaurant_id=rid_a)
        AuditLog.log(action='login', user_id=User.query.filter_by(email='b@mariam.app').first().id,
                     restaurant_id=rid_b)
        db.session.commit()
        token_a = get_token(client, email='a@mariam.app')
        logs = client.get('/v1/audit-logs', headers=auth_headers(token_a)).get_json()['logs']
        # No log must come from restaurant B
        assert all(log.get('user_email') != 'b@mariam.app' for log in logs)
        assert any(log.get('user_email') == 'a@mariam.app' for log in logs)


class TestTokenRevocation:
    def test_token_rejected_after_revocation(self, app, client):
        rid_a, _ = _two_tenants()
        token = get_token(client, email='a@mariam.app')
        assert client.get('/v1/auth/me', headers=auth_headers(token)).status_code == 200
        # Simulate a password change: revoke tokens issued before now
        decoded = decode_token(token)
        user = User.query.filter_by(email='a@mariam.app').first()
        user.tokens_valid_after = datetime.datetime.utcfromtimestamp(decoded['iat'] + 1)
        db.session.commit()
        assert client.get('/v1/auth/me', headers=auth_headers(token)).status_code == 401


class TestFallbackRemoved:
    """A user without a restaurant must no longer fall back to a default restaurant."""

    def test_no_restaurant_cannot_create_menu(self, app, client):
        # A restaurant exists (the fallback trap), but the user is not attached to it.
        make_restaurant(None, name='Trap RU', code='RU_TRAP')
        _make_user('orphan@mariam.app', 'admin', restaurant_id=None)
        token = get_token(client, email='orphan@mariam.app')
        res = client.post('/v1/menus', json={'date': _today_iso(), 'items': []},
                          headers=auth_headers(token))
        assert res.status_code in (400, 404)


class TestOrgAdminScope:
    """An org_admin can access every restaurant of its organization, and no further."""

    def test_org_admin_accesses_all_sites_of_org(self, app, client):
        org = _make_org(slug='multi')
        rid1 = make_restaurant(None, name='Site 1', code='S1')
        rid2 = make_restaurant(None, name='Site 2', code='S2')
        Restaurant.query.get(rid1).organization_id = org
        Restaurant.query.get(rid2).organization_id = org
        db.session.commit()
        _make_user('director@mariam.app', 'org_admin', restaurant_id=rid1, organization_id=org)
        _make_user('siteadmin@mariam.app', 'admin', restaurant_id=rid1, organization_id=org)
        event_site2 = _make_event(rid2, title='On site 2')

        token_dir = get_token(client, email='director@mariam.app')
        token_site = get_token(client, email='siteadmin@mariam.app')
        # The director sees an event from another site of its org
        assert client.get(f'/v1/events/{event_site2}', headers=auth_headers(token_dir)).status_code == 200
        # The site-1 admin does not see the site-2 event
        assert client.get(f'/v1/events/{event_site2}', headers=auth_headers(token_site)).status_code == 404


class TestActiveRestaurant:
    """An org_admin targets a specific site with the X-Restaurant-Id header,
    validated against its organization."""

    def _org_two_sites(self, org_slug, codes):
        org = _make_org(slug=org_slug)
        rids = []
        for code in codes:
            rid = make_restaurant(None, name=code, code=code)
            Restaurant.query.get(rid).organization_id = org
            rids.append(rid)
        db.session.commit()
        _make_user('dir@mariam.app', 'org_admin', restaurant_id=rids[0], organization_id=org)
        return org, rids

    def _titles(self, res):
        return {event['title'] for event in res.get_json()['events']}

    def test_header_targets_site_within_org(self, app, client):
        _, (rid1, rid2) = self._org_two_sites('multi-a', ['AS1', 'AS2'])
        _make_event(rid1, title='At S1', status='published')
        _make_event(rid2, title='At S2', status='published')
        token = get_token(client, email='dir@mariam.app')
        res = client.get(
            '/v1/events',
            headers={**auth_headers(token), 'X-Restaurant-Id': str(rid2)},
        )
        assert res.status_code == 200
        assert self._titles(res) == {'At S2'}

    def test_header_outside_org_is_ignored(self, app, client):
        _, (rid1,) = self._org_two_sites('multi-b', ['BS1'])
        outsider = make_restaurant(None, name='Outsider', code='BOUT')  # no organization
        _make_event(rid1, title='Mine', status='published')
        _make_event(outsider, title='Theirs', status='published')
        token = get_token(client, email='dir@mariam.app')
        res = client.get(
            '/v1/events',
            headers={**auth_headers(token), 'X-Restaurant-Id': str(outsider)},
        )
        assert res.status_code == 200
        # Out-of-org target ignored → falls back to the director's primary site.
        assert self._titles(res) == {'Mine'}


class TestSupervisorManagesOnlyPeers:
    """A supervisor oversees the sites; their accounts stay with the sites."""

    def _org_with_site_admin(self, slug='peer-org'):
        org = _make_org(slug=slug)
        rid = make_restaurant(None, name='PEER', code='PEER_SITE')
        Restaurant.query.get(rid).organization_id = org
        db.session.commit()
        _make_user('sup@mariam.app', 'org_admin', restaurant_id=None, organization_id=org)
        site_admin = _make_user('siteadmin@mariam.app', 'admin', rid, org)
        return org, rid, site_admin

    def test_cannot_delete_a_site_account(self, app, client):
        _, _, site_admin = self._org_with_site_admin()
        token = get_token(client, email='sup@mariam.app')
        res = client.delete(f'/v1/users/{site_admin}', headers=auth_headers(token))
        assert res.status_code == 404
        assert User.query.get(site_admin) is not None

    def test_cannot_reset_mfa_of_a_site_account(self, app, client):
        _, _, site_admin = self._org_with_site_admin('peer-org-2')
        token = get_token(client, email='sup@mariam.app')
        res = client.post(f'/v1/users/{site_admin}/reset-mfa', headers=auth_headers(token))
        assert res.status_code == 404

    def test_cannot_change_a_site_account(self, app, client):
        _, _, site_admin = self._org_with_site_admin('peer-org-3')
        token = get_token(client, email='sup@mariam.app')
        res = client.put(
            f'/v1/users/{site_admin}',
            json={'role': 'reader'},
            headers=auth_headers(token),
        )
        assert res.status_code == 404
        assert User.query.get(site_admin).role == 'admin'

    def test_site_admin_cannot_promote_to_supervisor(self, app, client):
        _, rid, _ = self._org_with_site_admin('peer-org-4')
        editor = _make_user('ed@mariam.app', 'editor', rid)
        token = get_token(client, email='siteadmin@mariam.app')
        res = client.put(
            f'/v1/users/{editor}',
            json={'role': 'org_admin'},
            headers=auth_headers(token),
        )
        assert res.status_code == 403
        assert User.query.get(editor).role == 'editor'


class TestDeletionNeedsStepUp:
    """Deleting an account requires a fresh proof of identity."""

    def _pair(self, slug='step-org'):
        org = _make_org(slug=slug)
        rid = make_restaurant(None, name='STEP', code='STEP_SITE')
        Restaurant.query.get(rid).organization_id = org
        db.session.commit()
        _make_user('boss@mariam.app', 'admin', rid, org)
        victim = _make_user('victim@mariam.app', 'editor', rid, org)
        return victim

    def _step_up(self, client, token):
        res = client.post(
            '/v1/auth/step-up/password',
            json={'password': TEST_PASSWORD},
            headers=auth_headers(token),
        )
        assert res.status_code == 200, res.get_json()
        return res.get_json()['step_up_token']

    def test_delete_without_proof_is_rejected(self, app, client):
        victim = self._pair()
        token = get_token(client, email='boss@mariam.app')
        res = client.delete(f'/v1/users/{victim}', headers=auth_headers(token))
        assert res.status_code == 401
        assert User.query.get(victim) is not None

    def test_wrong_password_yields_no_proof(self, app, client):
        self._pair('step-org-2')
        token = get_token(client, email='boss@mariam.app')
        res = client.post(
            '/v1/auth/step-up/password',
            json={'password': 'WrongPass123!'},
            headers=auth_headers(token),
        )
        assert res.status_code == 401

    def test_delete_succeeds_with_a_fresh_proof(self, app, client):
        victim = self._pair('step-org-3')
        token = get_token(client, email='boss@mariam.app')
        proof = self._step_up(client, token)
        res = client.delete(
            f'/v1/users/{victim}',
            headers={**auth_headers(token), 'X-Step-Up-Token': proof},
        )
        assert res.status_code == 200
        assert User.query.get(victim) is None


class TestDirectorIsReadOnlyOnContent:
    """A director supervises every site but never edits their content."""

    def _director_and_site(self, slug='ro-org'):
        org = _make_org(slug=slug)
        rid = make_restaurant(None, name='RO', code='RO_SITE')
        Restaurant.query.get(rid).organization_id = org
        db.session.commit()
        _make_user('ro@mariam.app', 'org_admin', restaurant_id=rid, organization_id=org)
        return rid

    def test_cannot_create_an_event(self, app, client):
        self._director_and_site()
        token = get_token(client, email='ro@mariam.app')
        res = client.post(
            '/v1/events',
            json={'title': 'Nope', 'event_date': _today_iso()},
            headers=auth_headers(token),
        )
        assert res.status_code == 403
        assert Event.query.filter_by(title='Nope').first() is None

    def test_cannot_delete_an_event(self, app, client):
        rid = self._director_and_site('ro-org-2')
        event_id = _make_event(rid, title='Keep', status='published')
        token = get_token(client, email='ro@mariam.app')
        res = client.delete(f'/v1/events/{event_id}', headers=auth_headers(token))
        assert res.status_code == 403
        assert Event.query.get(event_id) is not None

    def test_cannot_open_a_site_through_the_api(self, app, client):
        self._director_and_site('ro-org-4')
        token = get_token(client, email='ro@mariam.app')
        res = client.post(
            '/v1/restaurants',
            json={'name': 'Nouveau', 'code': 'NEW_SITE'},
            headers=auth_headers(token),
        )
        assert res.status_code in (404, 405)
        assert Restaurant.query.filter_by(code='NEW_SITE').first() is None

    def test_still_reads_site_content(self, app, client):
        rid = self._director_and_site('ro-org-3')
        _make_event(rid, title='Visible', status='published')
        token = get_token(client, email='ro@mariam.app')
        res = client.get('/v1/events', headers=auth_headers(token))
        assert res.status_code == 200
        assert 'Visible' in {event['title'] for event in res.get_json()['events']}


class TestOrgDashboard:
    def _org(self, slug, codes, role='org_admin'):
        org = _make_org(slug=slug)
        rids = []
        for code in codes:
            rid = make_restaurant(None, name=code, code=code)
            Restaurant.query.get(rid).organization_id = org
            rids.append(rid)
        db.session.commit()
        _make_user('u@mariam.app', role, restaurant_id=rids[0], organization_id=org)
        return org, rids

    def test_sites_overview(self, app, client):
        self._org('ov', ['OVA', 'OVB'])
        token = get_token(client, email='u@mariam.app')
        res = client.get('/v1/org/sites', headers=auth_headers(token))
        assert res.status_code == 200
        sites = res.get_json()['sites']
        assert {s['name'] for s in sites} == {'OVA', 'OVB'}
        assert all(
            k in sites[0] for k in ('user_count', 'today_menu_status', 'upcoming_events', 'is_active')
        )

    def test_a_closed_day_is_not_reported_as_a_missing_menu(self, app, client):
        _, rids = self._org('ov-closed', ['OVC'])
        restaurant = Restaurant.query.get(rids[0])
        restaurant.service_days = list(range(7))
        today = paris_today()
        db.session.add(
            ExceptionalClosure(
                restaurant_id=rids[0], start_date=today, end_date=today, is_active=True
            )
        )
        db.session.commit()
        token = get_token(client, email='u@mariam.app')

        res = client.get('/v1/org/sites', headers=auth_headers(token))

        assert res.get_json()['sites'][0]['today_menu_status'] == 'closed'

    def test_sites_overview_forbidden_for_site_admin(self, app, client):
        self._org('ov2', ['OV2A'], role='admin')
        token = get_token(client, email='u@mariam.app')
        assert client.get('/v1/org/sites', headers=auth_headers(token)).status_code == 403

    def test_supervisor_only_invites_supervisors(self, app, client):
        _, (rid1, rid2) = self._org('ov3', ['OV3A', 'OV3B'])
        token = get_token(client, email='u@mariam.app')
        for role in ('admin', 'editor', 'reader'):
            res = client.post(
                '/v1/users/invite',
                json={'email': f'{role}@mariam.app', 'role': role, 'restaurant_id': rid2},
                headers=auth_headers(token),
            )
            assert res.status_code == 403, role
        from app.models import ActivationLink
        assert ActivationLink.query.filter_by(link_type='invite').count() == 0

    def test_supervisor_invitation_is_not_bound_to_a_site(self, app, client):
        org, _ = self._org('ov4', ['OV4A', 'OV4B'])
        token = get_token(client, email='u@mariam.app')
        res = client.post(
            '/v1/users/invite',
            json={'email': 'peer@mariam.app', 'role': 'org_admin'},
            headers=auth_headers(token),
        )
        assert res.status_code == 201
        from app.models import ActivationLink
        link = ActivationLink.query.filter_by(email='peer@mariam.app').first()
        assert link.restaurant_id is None
        assert link.organization_id == org

    def test_site_admin_cannot_invite_a_supervisor(self, app, client):
        self._org('ov5', ['OV5A'], role='admin')
        token = get_token(client, email='u@mariam.app')
        res = client.post(
            '/v1/users/invite',
            json={'email': 'boss@mariam.app', 'role': 'org_admin'},
            headers=auth_headers(token),
        )
        assert res.status_code == 403

    def test_supervisor_is_listed_for_the_organization_only(self, app, client):
        org, (rid,) = self._org('ov6', ['OV6A'], role='admin')
        _make_user('sup@mariam.app', 'org_admin', restaurant_id=None, organization_id=org)

        site_admin = get_token(client, email='u@mariam.app')
        emails = {
            u['email']
            for u in client.get('/v1/users', headers=auth_headers(site_admin)).get_json()['users']
        }
        assert 'sup@mariam.app' not in emails

        supervisor = get_token(client, email='sup@mariam.app')
        emails = {
            u['email']
            for u in client.get('/v1/users', headers=auth_headers(supervisor)).get_json()['users']
        }
        assert {'sup@mariam.app', 'u@mariam.app'} <= emails

    def test_site_admin_does_not_see_org_admin(self, app, client):
        org, (rid,) = self._org('vis', ['VIS'], role='admin')
        _make_user('dir2@mariam.app', 'org_admin', restaurant_id=rid, organization_id=org)
        token = get_token(client, email='u@mariam.app')
        users = client.get('/v1/users', headers=auth_headers(token)).get_json()['users']
        assert 'org_admin' not in {u['role'] for u in users}


class TestAnalyticsScope:
    """/v1/analytics serves both roles: a director spans its org, an admin its site."""

    ENDPOINTS = ('/v1/analytics/overview', '/v1/analytics/publications')

    def _org_sites(self, slug, codes):
        org = _make_org(slug=slug)
        rids = []
        for code in codes:
            rid = make_restaurant(None, name=code, code=code)
            Restaurant.query.get(rid).organization_id = org
            rids.append(rid)
        db.session.commit()
        return org, rids

    def test_director_spans_every_site(self, app, client):
        org, rids = self._org_sites('an1', ['AN1A', 'AN1B'])
        _make_user('dir@mariam.app', 'org_admin', rids[0], org)
        token = get_token(client, email='dir@mariam.app')
        res = client.get('/v1/analytics/overview', headers=auth_headers(token))
        assert res.status_code == 200
        assert res.get_json()['scope']['site_count'] == 2

    def test_site_admin_is_limited_to_its_own_site(self, app, client):
        org, rids = self._org_sites('an2', ['AN2A', 'AN2B'])
        _make_user('sa@mariam.app', 'admin', rids[0], org)
        token = get_token(client, email='sa@mariam.app')
        res = client.get('/v1/analytics/overview', headers=auth_headers(token))
        assert res.status_code == 200
        assert [s['site_id'] for s in res.get_json()['sites']] == [rids[0]]

    def test_site_admin_cannot_widen_scope_through_site_ids(self, app, client):
        org, rids = self._org_sites('an3', ['AN3A', 'AN3B'])
        _make_user('sa3@mariam.app', 'admin', rids[0], org)
        token = get_token(client, email='sa3@mariam.app')
        res = client.get(
            f'/v1/analytics/overview?site_ids={rids[0]},{rids[1]}',
            headers=auth_headers(token),
        )
        assert [s['site_id'] for s in res.get_json()['sites']] == [rids[0]]

    def test_foreign_site_ids_are_dropped(self, app, client):
        org_a, rids_a = self._org_sites('an4', ['AN4A'])
        _, rids_b = self._org_sites('an5', ['AN5A'])
        _make_user('dir4@mariam.app', 'org_admin', rids_a[0], org_a)
        token = get_token(client, email='dir4@mariam.app')
        res = client.get(
            f'/v1/analytics/overview?site_ids={rids_b[0]}', headers=auth_headers(token)
        )
        assert res.status_code == 200
        assert res.get_json()['sites'] == []

    def test_active_restaurant_header_does_not_narrow_the_director_scope(self, app, client):
        org, rids = self._org_sites('an6', ['AN6A', 'AN6B'])
        _make_user('dir6@mariam.app', 'org_admin', rids[0], org)
        token = get_token(client, email='dir6@mariam.app')
        headers = {**auth_headers(token), 'X-Restaurant-Id': str(rids[1])}
        res = client.get('/v1/analytics/overview', headers=headers)
        assert res.get_json()['scope']['site_count'] == 2

    def test_editor_is_forbidden(self, app, client):
        org, rids = self._org_sites('an7', ['AN7A'])
        _make_user('ed@mariam.app', 'editor', rids[0], org)
        token = get_token(client, email='ed@mariam.app')
        for endpoint in self.ENDPOINTS:
            assert client.get(endpoint, headers=auth_headers(token)).status_code == 403
