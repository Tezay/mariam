"""Retention for the dashboard's own records: audit trail and in-app alerts."""
import logging
import os
from datetime import UTC, datetime, timedelta

from ..extensions import db
from ..models import AuditLog, Notification
from ..utils.time import paris_today
from .redis_client import acquire_job_lock

logger = logging.getLogger(__name__)

_DEFAULT_AUDIT_DAYS = 180
_DEFAULT_NOTIFICATION_DAYS = 90


def _retention_days(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


def purge_audit_logs(app) -> int:
    """Drop audit entries past the retention window."""
    with app.app_context():
        days = _retention_days('AUDIT_RETENTION_DAYS', _DEFAULT_AUDIT_DAYS)
        # This column is naive UTC where the notification one carries a zone.
        cutoff = (datetime.now(UTC) - timedelta(days=days)).replace(tzinfo=None)
        try:
            deleted = AuditLog.query.filter(AuditLog.created_at < cutoff).delete()
            db.session.commit()
        except Exception:
            db.session.rollback()
            logger.exception('Audit log purge failed')
            return 0
        return deleted


def purge_notifications(app) -> int:
    """Drop in-app alerts past the retention window."""
    with app.app_context():
        days = _retention_days('NOTIFICATION_RETENTION_DAYS', _DEFAULT_NOTIFICATION_DAYS)
        cutoff = datetime.now(UTC) - timedelta(days=days)
        try:
            deleted = Notification.query.filter(Notification.created_at < cutoff).delete()
            db.session.commit()
        except Exception:
            db.session.rollback()
            logger.exception('Notification purge failed')
            return 0
        return deleted


def run_purge_job(app) -> None:
    year, week, _ = paris_today().isocalendar()
    if acquire_job_lock(f'mariam:retention_lock:{year}W{week}', 3600):
        purge_audit_logs(app)
        purge_notifications(app)
