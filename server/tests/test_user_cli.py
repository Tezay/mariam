"""`flask user` — account administration from the command line."""
from app.extensions import db
from app.models import AuditLog, Organization, Restaurant, User
from app.models.passkey import Passkey
from conftest import make_restaurant, make_user


def _run(app, *args, **kwargs):
    return app.test_cli_runner().invoke(args=['user', *args], **kwargs)


def _with_passkey(user_id, credential=b'cli-cred'):
    db.session.add(Passkey(
        user_id=user_id,
        credential_id=credential,
        public_key=b'key',
        device_name='MacBook',
    ))
    db.session.commit()


class TestRead:
    def test_show_reports_the_second_factor(self, app):
        uid = make_user(app, email='show@mariam.app')
        _with_passkey(uid)
        User.query.get(uid).mfa_enabled = True
        db.session.commit()

        result = _run(app, 'show', 'show@mariam.app')

        assert result.exit_code == 0
        assert 'MacBook' in result.output
        assert 'enabled' in result.output

    def test_an_unknown_account_exits_with_an_error(self, app):
        result = _run(app, 'show', 'nobody@mariam.app')

        assert result.exit_code != 0
        assert 'No account' in result.output

    def test_list_hides_disabled_accounts_unless_asked(self, app):
        uid = make_user(app, email='gone@mariam.app')
        User.query.get(uid).is_active = False
        db.session.commit()

        assert 'gone@mariam.app' not in _run(app, 'list').output
        assert 'gone@mariam.app' in _run(app, 'list', '--all').output


class TestSecondFactor:
    def test_reset_clears_both_methods_and_revokes_sessions(self, app):
        uid = make_user(app, email='reset@mariam.app')
        _with_passkey(uid, b'cli-cred-2')
        user = User.query.get(uid)
        user.mfa_enabled = True
        db.session.commit()

        result = _run(app, 'reset-2fa', 'reset@mariam.app')

        assert result.exit_code == 0
        user = User.query.get(uid)
        assert user.mfa_enabled is False
        assert user.passkeys.count() == 0
        assert user.tokens_valid_after is not None

    def test_a_targeted_reset_leaves_the_other_method_alone(self, app):
        uid = make_user(app, email='partial@mariam.app')
        _with_passkey(uid, b'cli-cred-3')
        User.query.get(uid).mfa_enabled = True
        db.session.commit()

        _run(app, 'reset-2fa', 'partial@mariam.app', '--passkeys')

        user = User.query.get(uid)
        assert user.passkeys.count() == 0
        assert user.mfa_enabled is True

    def test_the_reset_is_audited(self, app):
        uid = make_user(app, email='audit@mariam.app')

        _run(app, 'reset-2fa', 'audit@mariam.app')

        entry = AuditLog.query.filter_by(
            action=AuditLog.ACTION_MFA_DISABLED, target_id=uid
        ).one()
        assert entry.get_details()['via'] == 'cli'
        assert entry.ip_address is None
        assert entry.user_id is None

    def test_a_reset_link_needs_a_factor_to_verify_against(self, app):
        make_user(app, email='nofactor@mariam.app')

        result = _run(app, 'reset-password', 'nofactor@mariam.app')

        assert result.exit_code != 0
        assert 'no second factor' in result.output

    def test_a_passkey_alone_is_enough_for_a_reset_link(self, app):
        uid = make_user(app, email='passkeyonly@mariam.app')
        _with_passkey(uid, b'cli-cred-4')

        result = _run(app, 'reset-password', 'passkeyonly@mariam.app')

        assert result.exit_code == 0
        assert '/reset-password/' in result.output


class TestEdit:
    def test_invite_prints_an_activation_link(self, app):
        rid = make_restaurant(app, name='RU CLI', code='RU_CLI')

        result = _run(app, 'invite', 'new@mariam.app', '--role', 'editor', '--restaurant', str(rid))

        assert result.exit_code == 0
        assert '/activate/' in result.output

    def test_an_unknown_role_is_refused(self, app):
        make_user(app, email='role@mariam.app')

        result = _run(app, 'set-role', 'role@mariam.app', 'superuser')

        assert result.exit_code != 0
        assert User.query.filter_by(email='role@mariam.app').one().role == 'admin'

    def test_promoting_to_supervisor_moves_the_account_to_the_organization(self, app):
        org = Organization(name='CLI Org', slug='cli-org')
        db.session.add(org)
        db.session.commit()
        uid = make_user(app, email='promote@mariam.app')

        result = _run(app, 'set-role', 'promote@mariam.app', 'org_admin', '--org', 'cli-org')

        assert result.exit_code == 0
        user = User.query.get(uid)
        assert (user.role, user.restaurant_id, user.organization_id) == (
            'org_admin', None, org.id
        )

    def test_an_address_already_taken_is_refused(self, app):
        make_user(app, email='first@mariam.app')
        make_user(app, email='second@mariam.app')

        result = _run(app, 'set-email', 'first@mariam.app', 'second@mariam.app')

        assert result.exit_code != 0
        assert User.query.filter_by(email='first@mariam.app').count() == 1


class TestDelete:
    def test_delete_asks_before_removing(self, app):
        make_user(app, email='keep@mariam.app')

        result = _run(app, 'delete', 'keep@mariam.app', input='n\n')

        assert result.exit_code != 0
        assert User.query.filter_by(email='keep@mariam.app').count() == 1

    def test_delete_takes_the_passkeys_with_it(self, app):
        uid = make_user(app, email='bye@mariam.app')
        _with_passkey(uid, b'cli-cred-5')

        result = _run(app, 'delete', 'bye@mariam.app', '--yes')

        assert result.exit_code == 0
        assert User.query.filter_by(email='bye@mariam.app').count() == 0
        assert Passkey.query.filter_by(user_id=uid).count() == 0

    def test_the_audit_trail_outlives_the_account(self, app):
        uid = make_user(app, email='trace@mariam.app')

        _run(app, 'delete', 'trace@mariam.app', '--yes')

        assert AuditLog.query.filter_by(
            action=AuditLog.ACTION_USER_DELETE, target_id=uid
        ).count() == 1


class TestScope:
    def test_list_filters_by_site(self, app):
        first = make_restaurant(app, name='RU One', code='RU_ONE')
        second = make_restaurant(app, name='RU Two', code='RU_TWO')
        make_user(app, email='one@mariam.app', restaurant_id=first)
        make_user(app, email='two@mariam.app', restaurant_id=second)

        output = _run(app, 'list', '--site', str(first)).output

        assert 'one@mariam.app' in output
        assert 'two@mariam.app' not in output

    def test_an_unknown_site_exits_with_an_error(self, app):
        result = _run(app, 'list', '--site', 'nowhere')

        assert result.exit_code != 0
        assert 'No such site' in result.output


def test_restaurants_are_untouched_by_account_commands(app):
    rid = make_restaurant(app, name='RU Safe', code='RU_SAFE')
    uid = make_user(app, email='safe@mariam.app', restaurant_id=rid)

    _run(app, 'delete', 'safe@mariam.app', '--yes')

    assert Restaurant.query.get(rid) is not None
    assert User.query.get(uid) is None
