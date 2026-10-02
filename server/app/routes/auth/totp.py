from flask import jsonify
from flask_jwt_extended import jwt_required

from ...extensions import db
from ...models import AuditLog
from ...schemas.auth import AccountUpdateSchema, TotpCodeSchema, TotpEnrolmentSchema
from ...schemas.common import ErrorSchema
from ...security import get_client_ip, limiter
from ...services import totp
from ..helpers import get_current_user
from ._common import NO_SESSION, user_not_found
from .blueprint import auth_bp


@auth_bp.route('/mfa/setup', methods=['POST'])
@limiter.limit('5 per minute')
@jwt_required()
@auth_bp.response(200, TotpEnrolmentSchema)
@auth_bp.alt_response(401, schema=ErrorSchema, description=NO_SESSION)
@auth_bp.alt_response(404, schema=ErrorSchema, description='Account deleted.')
def mfa_setup():
    """Start enabling TOTP from the account settings

    Stores a new secret, inactive until `/mfa/setup/confirm` checks a first code.
    """
    user = get_current_user()
    if not user:
        return user_not_found()

    user.mfa_secret = totp.new_secret()
    db.session.commit()

    return jsonify({
        'qr_code': totp.provisioning_qr(user.mfa_secret, user.email),
        'secret': user.mfa_secret,
    }), 200


@auth_bp.route('/mfa/setup/confirm', methods=['POST'])
@limiter.limit('10 per minute')
@jwt_required()
@auth_bp.arguments(TotpCodeSchema)
@auth_bp.response(200, AccountUpdateSchema)
@auth_bp.alt_response(400, schema=ErrorSchema, description='No secret waiting for confirmation.')
@auth_bp.alt_response(401, schema=ErrorSchema, description=f'Wrong code. {NO_SESSION}')
@auth_bp.alt_response(404, schema=ErrorSchema, description='Account deleted.')
def mfa_setup_confirm(data):
    """Enable TOTP with a first code

    Also switches an account that already has TOTP over to the new secret.
    """
    user = get_current_user()
    if not user:
        return user_not_found()

    if not user.mfa_secret:
        return jsonify({'error': 'Aucun secret TOTP en attente de confirmation'}), 400

    if not totp.code_matches(user.mfa_secret, data['code']):
        return jsonify({'error': 'Code invalide'}), 401

    user.mfa_enabled = True
    AuditLog.log(action=AuditLog.ACTION_MFA_SETUP, user_id=user.id, ip_address=get_client_ip())
    db.session.commit()

    return jsonify({
        'message': 'Authentification par code activée',
        'user': user.to_dict(include_tenant=True),
    }), 200


@auth_bp.route('/mfa', methods=['DELETE'])
@limiter.limit('5 per minute')
@jwt_required()
@auth_bp.response(200, AccountUpdateSchema)
@auth_bp.alt_response(400, schema=ErrorSchema, description='TOTP not enabled.')
@auth_bp.alt_response(401, schema=ErrorSchema, description=NO_SESSION)
@auth_bp.alt_response(404, schema=ErrorSchema, description='Account deleted.')
@auth_bp.alt_response(409, schema=ErrorSchema, description='No passkey would remain.')
def disable_mfa():
    """Disable TOTP

    Refused unless the account keeps a passkey as its second factor.
    """
    user = get_current_user()
    if not user:
        return user_not_found()

    if not user.mfa_enabled:
        return jsonify({'error': "L'authentification par code n'est pas activée"}), 400

    if user.passkeys.count() == 0:
        return jsonify({
            'error': "Impossible de désactiver l'authentification par code "
                     "sans passkey configurée. "
                     "Enregistrez d'abord un appareil, puis désactivez le code.",
        }), 409

    user.mfa_enabled = False
    user.mfa_secret = None
    AuditLog.log(action=AuditLog.ACTION_MFA_DISABLED, user_id=user.id, ip_address=get_client_ip())
    db.session.commit()

    return jsonify({
        'message': 'Authentification par code désactivée',
        'user': user.to_dict(include_tenant=True),
    }), 200
