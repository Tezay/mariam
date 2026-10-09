"""Retention of the dashboard's own records: the audit trail."""
import datetime

from app.extensions import db
from app.models import AuditLog
from app.services import retention
from app.utils.time import utc_now_naive
from conftest import make_restaurant


def _audit(rid, days_ago):
    return AuditLog(
        restaurant_id=rid,
        action='menu_publish',
        ip_address='198.51.100.4',
        user_agent='Mozilla/5.0',
        created_at=utc_now_naive() - datetime.timedelta(days=days_ago),
    )


class TestAuditRetention:
    def test_entries_past_the_window_are_dropped(self, app):
        rid = make_restaurant(None)
        db.session.add_all([_audit(rid, 400), _audit(rid, 10)])
        db.session.commit()

        retention.purge_audit_logs(app)

        assert AuditLog.query.filter_by(restaurant_id=rid).count() == 1

    def test_the_window_is_configurable(self, app, monkeypatch):
        monkeypatch.setenv('AUDIT_RETENTION_DAYS', '5')
        rid = make_restaurant(None)
        db.session.add_all([_audit(rid, 10), _audit(rid, 1)])
        db.session.commit()

        retention.purge_audit_logs(app)

        assert AuditLog.query.filter_by(restaurant_id=rid).count() == 1

    def test_the_weekly_job_runs_the_purge(self, app, monkeypatch):
        monkeypatch.setattr(retention, 'acquire_job_lock', lambda *_args: True)
        rid = make_restaurant(None)
        db.session.add(_audit(rid, 400))
        db.session.commit()

        retention.run_purge_job(app)

        assert AuditLog.query.filter_by(restaurant_id=rid).count() == 0
