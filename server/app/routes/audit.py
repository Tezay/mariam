"""The audit log of a site, or of an organization and its supervisors."""
import csv
from datetime import UTC, datetime, time, timedelta
from io import StringIO

from flask import Response, request
from flask_smorest import Blueprint
from sqlalchemy import false, or_
from sqlalchemy.orm import joinedload

from ..extensions import db
from ..models import AuditLog, Organization, Restaurant, User
from ..pagination import paginate
from ..problems import Problem
from ..schemas.audit import (
    AuditFilterSchema,
    AuditLogListSchema,
    AuditQuerySchema,
    OrgAuditFilterSchema,
    OrgAuditQuerySchema,
)
from ..utils.time import PARIS_TZ, as_utc
from .helpers import admin_required, audit, get_current_user, org_admin_required, step_up_required
from .members import org_accounts
from .scope import member_org, member_site

audit_bp = Blueprint(
    'audit', __name__,
    description="Who did what, on a site or across an organization; read with a second factor",
)

EXPORT_ROWS = 10_000
CSV_TEXT = 'Comma-separated, at most 10,000 rows: ID, Date, User, Action, Target, IP, Details'

# A spreadsheet runs as a formula any cell that starts with one of these.
_FORMULA_LEADS = ('=', '+', '-', '@', '\t', '\r')


def _cell(value) -> str:
    text = str(value)
    return f"'{text}" if text.startswith(_FORMULA_LEADS) else text


def _utc_midnight(day) -> datetime:
    return datetime.combine(day, time(), PARIS_TZ).astimezone(UTC).replace(tzinfo=None)


def _site_scope(restaurant: Restaurant):
    # Entries written before they carried a site still name the account that acted.
    accounts = db.session.query(User.id).filter(User.restaurant_id == restaurant.id)
    return or_(AuditLog.restaurant_id == restaurant.id, AuditLog.user_id.in_(accounts))


def _org_scope(org: Organization, site_slug: str | None):
    sites = db.session.query(Restaurant.id).filter(Restaurant.organization_id == org.id)
    if site_slug is not None:
        site = Restaurant.query.filter_by(organization_id=org.id, slug=site_slug).first()
        return AuditLog.restaurant_id == site.id if site else false()
    accounts = org_accounts(org).with_entities(User.id)
    return or_(AuditLog.restaurant_id.in_(sites), AuditLog.user_id.in_(accounts))


def _filtered(scope, query: dict):
    logs = AuditLog.query.filter(scope)
    if 'action' in query:
        logs = logs.filter(AuditLog.action == query['action'])
    if 'user_id' in query:
        logs = logs.filter(AuditLog.user_id == query['user_id'])
    if 'start' in query:
        logs = logs.filter(AuditLog.created_at >= _utc_midnight(query['start']))
    if 'end' in query:
        logs = logs.filter(AuditLog.created_at < _utc_midnight(query['end'] + timedelta(days=1)))
    return logs.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())


def _filters(query: dict) -> dict:
    return {
        key: value.isoformat() if hasattr(value, 'isoformat') else value
        for key, value in query.items() if key not in ('page', 'per_page')
    }


def _require_second_factor() -> None:
    if not get_current_user().has_second_factor():
        raise Problem(
            403, 'second_factor_required',
            "Le journal ne s'ouvre qu'à un compte doté d'un second facteur : code ou passkey.",
        )


def _log_view(log, slugs: dict[int, str]) -> dict:
    return {
        'id': log.id,
        'user_id': log.user_id,
        'user_email': log.user.email if log.user else None,
        'site': slugs.get(log.restaurant_id),
        'action': log.action,
        'target_type': log.target_type,
        'target_id': log.target_id,
        'details': log.get_details(),
        'ip_address': log.ip_address,
        'created_at': as_utc(log.created_at),
    }


def _page(scope, query: dict, slugs: dict[int, str], restaurant: Restaurant | None):
    _require_second_factor()
    logs = _filtered(scope, query).options(joinedload(AuditLog.user))  # type: ignore[arg-type]
    body, headers = paginate(logs, query['page'], query['per_page'])
    body['items'] = [_log_view(log, slugs) for log in body['items']]
    audit(
        AuditLog.ACTION_AUDIT_LOGS_ACCESS, restaurant,
        user_agent=request.headers.get('User-Agent'),
        details={'page': query['page'], 'filters': _filters(query)},
    )
    db.session.commit()
    return body, headers


def _export(scope, query: dict, restaurant: Restaurant | None) -> Response:
    logs = (
        _filtered(scope, query)
        .options(joinedload(AuditLog.user))  # type: ignore[arg-type]
        .limit(EXPORT_ROWS)
        .all()
    )
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(['ID', 'Date', 'User', 'Action', 'Target', 'IP', 'Details'])
    for log in logs:
        writer.writerow(_cell(value) for value in (
            log.id,
            log.created_at.isoformat() if log.created_at else '',
            log.user.email if log.user else 'System',
            log.action,
            f'{log.target_type}:{log.target_id}' if log.target_type else '',
            log.ip_address or '',
            log.details or '',
        ))
    audit(
        AuditLog.ACTION_AUDIT_LOGS_EXPORT, restaurant,
        user_agent=request.headers.get('User-Agent'),
        details={'count': len(logs), 'filters': _filters(query)},
    )
    db.session.commit()
    stamp = datetime.now(PARIS_TZ).strftime('%Y%m%d_%H%M%S')
    return Response(
        output.getvalue(),
        mimetype='text/csv; charset=utf-8',
        headers={'Content-Disposition': f'attachment; filename=audit_logs_{stamp}.csv'},
    )


def _org_slugs(org: Organization) -> dict[int, str]:
    return dict(
        db.session.query(Restaurant.id, Restaurant.slug).filter(Restaurant.organization_id == org.id)
    )


@audit_bp.route('/<org>/sites/<site>/audit-logs', methods=['GET'])
@admin_required
@audit_bp.arguments(AuditQuerySchema, location='query')
@audit_bp.response(200, AuditLogListSchema)
def list_site_audit_logs(query, org: str, site: str):
    """The site's audit log, newest first, for an account with a second factor."""
    restaurant = member_site(org, site)
    return _page(_site_scope(restaurant), query, {restaurant.id: restaurant.slug}, restaurant)


@audit_bp.route('/<org>/sites/<site>/audit-logs/export', methods=['GET'])
@admin_required
@step_up_required
@audit_bp.arguments(AuditFilterSchema, location='query')
@audit_bp.response(200, {'type': 'string'}, content_type='text/csv', description=CSV_TEXT)
def export_site_audit_logs(query, org: str, site: str):
    """The site's audit log as a CSV file, from a confirmed session."""
    restaurant = member_site(org, site)
    return _export(_site_scope(restaurant), query, restaurant)


@audit_bp.route('/<org>/audit-logs', methods=['GET'])
@org_admin_required
@audit_bp.arguments(OrgAuditQuerySchema, location='query')
@audit_bp.response(200, AuditLogListSchema)
def list_org_audit_logs(query, org: str):
    """The organization's audit log, its sites' and its supervisors', newest first."""
    organization = member_org(org)
    return _page(
        _org_scope(organization, query.get('site')), query, _org_slugs(organization), None
    )


@audit_bp.route('/<org>/audit-logs/export', methods=['GET'])
@org_admin_required
@step_up_required
@audit_bp.arguments(OrgAuditFilterSchema, location='query')
@audit_bp.response(200, {'type': 'string'}, content_type='text/csv', description=CSV_TEXT)
def export_org_audit_logs(query, org: str):
    """The organization's audit log as a CSV file, from a confirmed session."""
    organization = member_org(org)
    return _export(_org_scope(organization, query.get('site')), query, None)
