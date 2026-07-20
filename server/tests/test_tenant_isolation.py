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
from conftest import auth_headers, get_token, make_restaurant, make_user


def _today_iso():
    return datetime.date.today().isoformat()


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
        event_date=datetime.date.today(), status=status, visibility='all',
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

    def test_header_targets_site_within_org(self, app, client):
        _, (rid1, rid2) = self._org_two_sites('multi-a', ['AS1', 'AS2'])
        token = get_token(client, email='dir@mariam.app')
        res = client.post(
            '/v1/events',
            json={'title': 'At S2', 'event_date': _today_iso()},
            headers={**auth_headers(token), 'X-Restaurant-Id': str(rid2)},
        )
        assert res.status_code == 201
        assert Event.query.filter_by(title='At S2').first().restaurant_id == rid2

    def test_header_outside_org_is_ignored(self, app, client):
        _, (rid1,) = self._org_two_sites('multi-b', ['BS1'])
        outsider = make_restaurant(None, name='Outsider', code='BOUT')  # no organization
        token = get_token(client, email='dir@mariam.app')
        res = client.post(
            '/v1/events',
            json={'title': 'Fallback', 'event_date': _today_iso()},
            headers={**auth_headers(token), 'X-Restaurant-Id': str(outsider)},
        )
        assert res.status_code == 201
        # Out-of-org target ignored → falls back to the director's primary site.
        assert Event.query.filter_by(title='Fallback').first().restaurant_id == rid1


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
            k in sites[0] for k in ('user_count', 'today_menu_published', 'upcoming_events', 'is_active')
        )

    def test_sites_overview_forbidden_for_site_admin(self, app, client):
        self._org('ov2', ['OV2A'], role='admin')
        token = get_token(client, email='u@mariam.app')
        assert client.get('/v1/org/sites', headers=auth_headers(token)).status_code == 403

    def test_org_admin_invites_onto_chosen_site(self, app, client):
        _, (rid1, rid2) = self._org('ov3', ['OV3A', 'OV3B'])
        token = get_token(client, email='u@mariam.app')
        res = client.post(
            '/v1/users/invite',
            json={'email': 'newmgr@mariam.app', 'role': 'admin', 'restaurant_id': rid2},
            headers=auth_headers(token),
        )
        assert res.status_code == 201
        from app.models import ActivationLink
        link = ActivationLink.query.filter_by(email='newmgr@mariam.app').first()
        assert link.restaurant_id == rid2

    def test_site_admin_does_not_see_org_admin(self, app, client):
        org, (rid,) = self._org('vis', ['VIS'], role='admin')
        _make_user('dir2@mariam.app', 'org_admin', restaurant_id=rid, organization_id=org)
        token = get_token(client, email='u@mariam.app')
        users = client.get('/v1/users', headers=auth_headers(token)).get_json()['users']
        assert 'org_admin' not in {u['role'] for u in users}
