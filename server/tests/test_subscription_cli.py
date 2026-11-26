"""`flask subscription`: recording the periods a contract sets."""
from datetime import date

from app.extensions import db
from app.models import AuditLog, SubscriptionPeriod
from conftest import make_restaurant


def _run(app, *args):
    return app.test_cli_runner().invoke(args=['subscription', *args])


def _add(app, *extra, start='2027-01-01', end='2027-12-31', kind='paid'):
    return _run(app, 'add', 'ru-test', '--kind', kind, '--start', start, '--end', end, *extra)


class TestAdd:
    def test_a_period_is_recorded_and_audited(self, app):
        site_id = make_restaurant(app)

        result = _add(app, '--order', ' EJ-1 ', '--payer-siret', '123 456 789 00012')

        assert result.exit_code == 0, result.output
        period = SubscriptionPeriod.query.one()
        assert (period.restaurant_id, period.renewal, period.order_ref, period.payer_siret) == (
            site_id, 'undecided', 'EJ-1', '12345678900012'
        )
        assert AuditLog.query.one().action == 'subscription_create'

    def test_a_period_overlapping_another_is_refused(self, app):
        make_restaurant(app)
        _add(app)

        result = _add(app, start='2027-12-01', end='2028-11-30')

        assert result.exit_code != 0
        assert SubscriptionPeriod.query.count() == 1

    def test_a_tacit_renewal_needs_its_last_day(self, app):
        make_restaurant(app)

        assert _add(app, '--renewal', 'tacit').exit_code != 0
        assert _add(app, '--renewal', 'tacit', '--tacit-until', '2027-06-30').exit_code != 0
        assert _add(app, '--renewal', 'tacit', '--tacit-until', '2029-12-31').exit_code == 0

    def test_a_malformed_siret_is_refused(self, app):
        make_restaurant(app)

        assert _add(app, '--payer-siret', '1234').exit_code != 0
        assert SubscriptionPeriod.query.count() == 0

    def test_from_previous_carries_the_terms_and_the_payer_but_no_reference(self, app):
        make_restaurant(app)
        _add(app, '--renewal', 'tacit', '--tacit-until', '2029-12-31',
             '--payer-name', 'Crous', '--order', 'EJ-1')

        result = _add(app, '--from-previous', start='2028-01-01', end='2028-12-31')

        assert result.exit_code == 0, result.output
        latest = SubscriptionPeriod.query.order_by(SubscriptionPeriod.starts_on.desc()).first()
        assert (latest.renewal, latest.tacit_until, latest.payer_name, latest.order_ref) == (
            'tacit', date(2029, 12, 31), 'Crous', None
        )


class TestUpdate:
    def test_only_the_changes_are_recorded(self, app):
        make_restaurant(app)
        _add(app, '--renewal', 'tacit', '--tacit-until', '2029-12-31')
        period_id = SubscriptionPeriod.query.one().id

        result = _run(app, 'update', str(period_id), '--renewal', 'ending', '--quote', 'D-7')

        assert result.exit_code == 0, result.output
        period = db.session.get(SubscriptionPeriod, period_id)
        assert (period.renewal, period.tacit_until, period.quote_ref) == ('ending', None, 'D-7')
        entry = AuditLog.query.filter_by(action='subscription_update').one()
        assert set(entry.get_details()) == {'via', 'site', 'renewal', 'tacit_until', 'quote_ref'}

    def test_clear_empties_a_reference(self, app):
        make_restaurant(app)
        _add(app, '--order', 'EJ-1')
        period_id = SubscriptionPeriod.query.one().id

        _run(app, 'update', str(period_id), '--clear', 'order')

        assert db.session.get(SubscriptionPeriod, period_id).order_ref is None


class TestRead:
    def test_list_names_a_site_with_no_period(self, app):
        make_restaurant(app)

        result = _run(app, 'list')

        assert 'test-org/ru-test' in result.output
        assert 'none' in result.output

    def test_ending_within_leaves_out_a_distant_end(self, app):
        make_restaurant(app)
        _add(app, start='2020-01-01', end='2099-12-31')

        assert 'No site matches' in _run(app, 'list', '--ending-within', '90').output


class TestDelete:
    def test_a_period_recorded_by_mistake_goes_and_the_log_keeps_it(self, app):
        make_restaurant(app)
        _add(app)
        period_id = SubscriptionPeriod.query.one().id

        result = _run(app, 'delete', str(period_id), '--yes')

        assert result.exit_code == 0
        assert SubscriptionPeriod.query.count() == 0
        assert AuditLog.query.filter_by(action='subscription_delete').count() == 1
