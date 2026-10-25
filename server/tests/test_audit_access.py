"""The audit log of a site, or of an organization: read with a second factor, exported confirmed."""
import csv
import io

from app.extensions import db
from app.models import AuditLog, Organization, User
from app.models.passkey import Passkey
from conftest import auth_headers, make_restaurant, make_user, site_path
from tests.auth_support import confirmed_headers


def _token(app, user_id):
    """Mint a session directly: password login stops at the second factor."""
    from flask_jwt_extended import create_access_token
    with app.app_context():
        return create_access_token(identity=str(user_id))


def _reader(app, email):
    rid = make_restaurant(app, name='RU Audit', code='RU_AUDIT')
    return db.session.get(User, make_user(app, email=email)), f'{site_path(rid)}/audit-logs'


def _with_passkey(user_id, credential):
    db.session.add(Passkey(user_id=user_id, credential_id=credential, public_key=b'key'))
    db.session.commit()


def _entry(action, user_id=None, restaurant_id=None):
    AuditLog.log(action=action, user_id=user_id, restaurant_id=restaurant_id)
    db.session.commit()


def _actions(res):
    return [entry['action'] for entry in res.get_json()['items']]


class TestSecondFactorGate:
    def test_a_passkey_alone_opens_the_audit_log(self, app, client):
        user, path = _reader(app, 'passkey@mariam.app')
        _with_passkey(user.id, b'audit-cred')

        assert client.get(path, headers=auth_headers(_token(app, user.id))).status_code == 200

    def test_a_code_alone_opens_the_audit_log(self, app, client):
        user, path = _reader(app, 'totp@mariam.app')
        user.set_mfa_secret('JBSWY3DPEHPK3PXP')
        db.session.commit()

        assert client.get(path, headers=auth_headers(_token(app, user.id))).status_code == 200

    def test_an_account_without_any_factor_is_refused(self, app, client):
        user, path = _reader(app, 'bare@mariam.app')

        res = client.get(path, headers=auth_headers(_token(app, user.id)))

        assert res.status_code == 403
        assert res.get_json()['code'] == 'second_factor_required'

    def test_a_secret_awaiting_confirmation_does_not_count(self, app, client):
        user, path = _reader(app, 'halfway@mariam.app')
        # The setup route stores the secret before the code is verified; the
        # account is not protected until that confirmation lands.
        user.mfa_secret = 'JBSWY3DPEHPK3PXP'
        db.session.commit()

        assert client.get(path, headers=auth_headers(_token(app, user.id))).status_code == 403

    def test_an_unreadable_filter_is_refused(self, app, client):
        user, path = _reader(app, 'filter@mariam.app')
        _with_passkey(user.id, b'filter-cred')
        headers = auth_headers(_token(app, user.id))

        for query in ('user_id=abc', 'from=hier', 'from=2026-10-10&to=2026-10-01'):
            assert client.get(f'{path}?{query}', headers=headers).status_code == 422


class TestScope:
    def test_a_site_reads_its_own_entries(self, app, client):
        user, path = _reader(app, 'admin@mariam.app')
        _with_passkey(user.id, b'scope-cred')
        elsewhere = make_restaurant(app, name='Ailleurs', code='RU_ELSE')
        _entry('menu_publish', restaurant_id=user.restaurant_id)
        _entry('menu_delete', restaurant_id=elsewhere)

        res = client.get(path, headers=auth_headers(_token(app, user.id)))

        assert _actions(res) == ['menu_publish']
        assert res.get_json()['items'][0]['site'] == 'ru-audit'

    def test_a_supervisor_reads_the_supervisors_entries_too(self, app, client):
        org = Organization(name='Crous', slug='crous-audit')
        db.session.add(org)
        db.session.commit()
        rid = make_restaurant(None, name='RU Nord', code='RU_NORD', organization_id=org.id)
        supervisor = db.session.get(
            User, make_user(None, email='sup@mariam.app', role='org_admin', restaurant_id=None)
        )
        supervisor.organization_id = org.id
        db.session.commit()
        _with_passkey(supervisor.id, b'sup-cred')
        _entry('menu_publish', restaurant_id=rid)
        _entry('activation_link_create', user_id=supervisor.id)
        headers = auth_headers(_token(app, supervisor.id))

        everything = client.get(f'/v1/orgs/{org.slug}/audit-logs', headers=headers)
        one_site = client.get(f'/v1/orgs/{org.slug}/audit-logs?site=ru-nord', headers=headers)

        assert sorted(_actions(everything)) == ['activation_link_create', 'menu_publish']
        assert _actions(one_site) == ['menu_publish']

    def test_reading_is_itself_audited_on_the_site(self, app, client):
        user, path = _reader(app, 'admin@mariam.app')
        _with_passkey(user.id, b'read-cred')

        client.get(path, headers=auth_headers(_token(app, user.id)))

        entry = AuditLog.query.filter_by(action=AuditLog.ACTION_AUDIT_LOGS_ACCESS).one()
        assert (entry.user_id, entry.restaurant_id) == (user.id, user.restaurant_id)


class TestExport:
    def test_a_session_alone_does_not_export(self, app, client):
        user, path = _reader(app, 'export@mariam.app')
        _with_passkey(user.id, b'export-cred')

        res = client.get(f'{path}/export', headers=auth_headers(_token(app, user.id)))

        assert res.get_json()['code'] == 'step_up_required'

    def test_a_confirmed_session_exports(self, app, client):
        user, path = _reader(app, 'export@mariam.app')

        res = client.get(f'{path}/export', headers=confirmed_headers(client, user.id))

        assert res.status_code == 200
        assert res.headers['Content-Type'].startswith('text/csv')

    def test_no_cell_starts_a_formula(self, app, client):
        user, path = _reader(app, '=1+1@mariam.app')
        headers = confirmed_headers(client, user.id)
        client.get(path, headers=headers)

        res = client.get(f'{path}/export', headers=headers)

        rows = list(csv.reader(io.StringIO(res.get_data(as_text=True))))
        assert [row[2] for row in rows[1:]] == ["'=1+1@mariam.app"]
