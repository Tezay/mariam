import base64
import io

import pyotp
import qrcode
from flask import current_app, jsonify, request
from flask_jwt_extended import (
    get_jwt_identity,
    jwt_required,
)

from ...extensions import db
from ...models import AuditLog, User
from ...security import get_client_ip, limiter
from .blueprint import auth_bp


@auth_bp.route('/mfa/setup', methods=['POST'])
@limiter.limit("5 per minute")
@jwt_required()
def mfa_setup():
    """
    Generate a new TOTP secret for the authenticated user (account settings).

    Stores the secret without activating it — activation happens via /mfa/setup/confirm.
    Returns: { qr_code, secret }
    """
    current_user_id = int(get_jwt_identity())
    user = db.session.get(User, current_user_id)
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404

    mfa_secret = pyotp.random_base32()
    user.mfa_secret = mfa_secret
    db.session.commit()

    issuer = current_app.config.get('MFA_ISSUER_NAME', 'MARIAM')
    totp = pyotp.TOTP(mfa_secret)
    provisioning_uri = totp.provisioning_uri(name=user.email, issuer_name=issuer)

    qr = qrcode.QRCode(version=1, box_size=5, border=2)
    qr.add_data(provisioning_uri)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")

    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    qr_base64 = base64.b64encode(buffer.getvalue()).decode()

    return jsonify({
        'qr_code': f'data:image/png;base64,{qr_base64}',
        'secret': mfa_secret,
    }), 200


@auth_bp.route('/mfa/setup/confirm', methods=['POST'])
@limiter.limit("10 per minute")
@jwt_required()
def mfa_setup_confirm():
    """
    Verify a TOTP code and activate authenticator-app 2FA.

    Can be called whether TOTP is already active or not (re-configuration supported).
    Body: { code }
    """
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Données manquantes'}), 400

    code = data.get('code')
    if not code:
        return jsonify({'error': 'code requis'}), 400

    current_user_id = int(get_jwt_identity())
    user = db.session.get(User, current_user_id)
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404

    if not user.mfa_secret:
        return jsonify({'error': 'Aucun secret TOTP en attente de confirmation'}), 400

    totp = pyotp.TOTP(user.mfa_secret)
    if not totp.verify(code, valid_window=1):
        return jsonify({'error': 'Code invalide'}), 401

    user.mfa_enabled = True

    AuditLog.log(
        action=AuditLog.ACTION_MFA_SETUP,
        user_id=user.id,
        ip_address=get_client_ip(),
    )
    db.session.commit()

    return jsonify({
        'message': 'Authentification par code activée',
        'user': user.to_dict(include_tenant=True),
    }), 200


@auth_bp.route('/mfa', methods=['DELETE'])
@limiter.limit("5 per minute")
@jwt_required()
def disable_mfa():
    """
    Disable TOTP authentication for the authenticated user.

    Rejected if the user has no registered passkey (at least one 2FA method must remain active).
    """
    current_user_id = int(get_jwt_identity())
    user = db.session.get(User, current_user_id)
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404

    if not user.mfa_enabled:
        return jsonify({'error': "L'authentification par code n'est pas activée"}), 400

    if user.passkeys.count() == 0:
        return jsonify({
            'error': "Impossible de désactiver l'authentification par code sans passkey configurée. "
                     "Enregistrez d'abord un appareil, puis désactivez le code.",
        }), 409

    user.mfa_enabled = False
    user.mfa_secret = None

    AuditLog.log(
        action=AuditLog.ACTION_MFA_DISABLED,
        user_id=user.id,
        ip_address=get_client_ip(),
    )
    db.session.commit()

    return jsonify({
        'message': 'Authentification par code désactivée',
        'user': user.to_dict(include_tenant=True),
    }), 200
