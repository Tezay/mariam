"""Who may read the audit log: any account carrying a second factor."""
from app.extensions import db
from app.models import User
from app.models.passkey import Passkey
from conftest import auth_headers, make_restaurant, make_user


def _token(app, user_id):
    """Mint a session directly: password login stops at the second factor."""
    from flask_jwt_extended import create_access_token
    with app.app_context():
        return create_access_token(identity=str(user_id))


def _reader(app, email):
    make_restaurant(app, name='RU Audit', code='RU_AUDIT')
    return db.session.get(User, make_user(app, email=email))


def _with_passkey(user_id, credential):
    db.session.add(Passkey(user_id=user_id, credential_id=credential, public_key=b'key'))
    db.session.commit()


class TestSecondFactorGate:
    def test_a_passkey_alone_opens_the_audit_log(self, app, client):
        user = _reader(app, 'passkey@mariam.app')
        _with_passkey(user.id, b'audit-cred')

        response = client.get('/v1/audit-logs', headers=auth_headers(_token(app, user.id)))

        assert response.status_code == 200

    def test_a_code_alone_opens_the_audit_log(self, app, client):
        user = _reader(app, 'totp@mariam.app')
        user.set_mfa_secret('JBSWY3DPEHPK3PXP')
        db.session.commit()

        response = client.get('/v1/audit-logs', headers=auth_headers(_token(app, user.id)))

        assert response.status_code == 200

    def test_an_account_without_any_factor_is_refused(self, app, client):
        user = _reader(app, 'bare@mariam.app')

        response = client.get('/v1/audit-logs', headers=auth_headers(_token(app, user.id)))

        assert response.status_code == 403
        assert response.get_json()['error'] == 'MFA_REQUIRED'

    def test_a_secret_awaiting_confirmation_does_not_count(self, app, client):
        user = _reader(app, 'halfway@mariam.app')
        # The setup route stores the secret before the code is verified; the
        # account is not protected until that confirmation lands.
        user.mfa_secret = 'JBSWY3DPEHPK3PXP'
        db.session.commit()

        response = client.get('/v1/audit-logs', headers=auth_headers(_token(app, user.id)))

        assert response.status_code == 403

    def test_the_export_follows_the_same_rule(self, app, client):
        user = _reader(app, 'export@mariam.app')
        _with_passkey(user.id, b'export-cred')

        response = client.get('/v1/audit-logs/export', headers=auth_headers(_token(app, user.id)))

        assert response.status_code == 200
