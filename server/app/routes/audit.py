"""
Audit log routes for MARIAM.

Requires admin role and MFA enabled.

Endpoints:
- GET /v1/audit-logs         Paginated list with filters
- GET /v1/audit-logs/export  CSV export (max 10,000 rows)
"""
from datetime import datetime
from functools import wraps
import csv
from io import StringIO
from flask import request, jsonify, make_response
from flask_jwt_extended import jwt_required, get_jwt_identity
from flask_smorest import Blueprint
from sqlalchemy.orm import joinedload
from ..extensions import db
from ..models import User, AuditLog
from ..security import get_client_ip
from ..schemas.common import ErrorSchema


audit_bp = Blueprint(
    'audit', __name__,
    description='Audit log — Admin action history (MFA required)'
)


# ============================================================
# HELPERS
# ============================================================

def admin_required(f):
    """Décorateur : accès réservé aux administrateurs."""
    @wraps(f)
    @jwt_required()
    def decorated_function(*args, **kwargs):
        current_user_id = int(get_jwt_identity())
        user = User.query.get(current_user_id)
        if not user or not user.is_admin():
            return jsonify({'error': 'Accès réservé aux administrateurs'}), 403
        return f(*args, **kwargs)
    return decorated_function


def _apply_audit_filters(query):
    """Applique les filtres communs action/user_id/start_date/end_date à une requête AuditLog."""
    if action_filter := request.args.get('action'):
        query = query.filter(AuditLog.action == action_filter)

    if user_filter := request.args.get('user_id'):
        query = query.filter(AuditLog.user_id == int(user_filter))

    if start_date := request.args.get('start_date'):
        try:
            query = query.filter(AuditLog.created_at >= datetime.fromisoformat(start_date))
        except ValueError:
            pass

    if end_date := request.args.get('end_date'):
        try:
            query = query.filter(AuditLog.created_at <= datetime.fromisoformat(end_date))
        except ValueError:
            pass

    return query


# ============================================================
# ROUTE STATIQUE — export avant la route racine paramétrée
# ============================================================

@audit_bp.route('/export', methods=['GET'])
@audit_bp.alt_response(403, schema=ErrorSchema, description="MFA not enabled or access denied")
@admin_required
def export_audit_logs():
    """CSV export of audit logs (max 10,000 rows).

    Requires the administrator to have MFA enabled.

    Accepts the same query params as `GET /v1/audit-logs`:
    `action`, `user_id`, `start_date`, `end_date`.

    Returns a CSV file with columns:
    ID, Date, User, Action, Target, IP, Details.
    """
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    if not user.mfa_secret:
        return jsonify({
            'error': 'MFA_REQUIRED',
            'message': "L'export des logs nécessite l'activation de l'authentification à deux facteurs",
        }), 403

    query = _apply_audit_filters(AuditLog.query.options(joinedload(AuditLog.user)))
    logs = query.order_by(AuditLog.created_at.desc()).limit(10000).all()

    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(['ID', 'Date', 'User', 'Action', 'Target', 'IP', 'Details'])

    for log in logs:
        writer.writerow([
            log.id,
            log.created_at.isoformat() if log.created_at else '',
            log.user.email if log.user else 'System',
            log.action,
            f"{log.target_type}:{log.target_id}" if log.target_type else '',
            log.ip_address or '',
            log.details or '',
        ])

    AuditLog.log(
        action=AuditLog.ACTION_AUDIT_LOGS_EXPORT,
        user_id=current_user_id,
        ip_address=get_client_ip(),
        user_agent=request.headers.get('User-Agent'),
        details={'count': len(logs), 'filters': dict(request.args)}
    )
    db.session.commit()

    response = make_response(output.getvalue())
    response.headers['Content-Type'] = 'text/csv'
    response.headers['Content-Disposition'] = (
        f'attachment; filename=audit_logs_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'
    )
    return response


# ============================================================
# LISTE DES LOGS
# ============================================================

@audit_bp.route('', methods=['GET'])
@audit_bp.alt_response(403, schema=ErrorSchema, description="MFA not enabled or access denied")
@admin_required
def get_audit_logs():
    """Paginated audit log list.

    Requires the administrator to have MFA enabled.

    Query params:
    - `page` — Page number (default 1)
    - `per_page` — Entries per page (default 50, max 100)
    - `action` — Filter by action type
    - `user_id` — Filter by user
    - `start_date` — Start date (ISO format)
    - `end_date` — End date (ISO format)
    """
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    if not user.mfa_secret:
        return jsonify({
            'error': 'MFA_REQUIRED',
            'message': "La consultation des logs nécessite l'activation de l'authentification à deux facteurs",
        }), 403

    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 50, type=int), 100)

    query = _apply_audit_filters(AuditLog.query)
    query = query.order_by(AuditLog.created_at.desc())
    paginated = query.paginate(page=page, per_page=per_page, error_out=False)

    AuditLog.log(
        action=AuditLog.ACTION_AUDIT_LOGS_ACCESS,
        user_id=current_user_id,
        ip_address=get_client_ip(),
        user_agent=request.headers.get('User-Agent'),
        details={
            'page': page,
            'filters': {k: v for k, v in request.args.items() if k not in ['page', 'per_page']},
        }
    )
    db.session.commit()

    return jsonify({
        'logs': [log.to_dict() for log in paginated.items],
        'total': paginated.total,
        'page': page,
        'per_page': per_page,
        'pages': paginated.pages,
    }), 200
