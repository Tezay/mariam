"""
Authentication routes for MARIAM with MFA support.

Endpoints:
- POST /v1/auth/login                         Login (step 1)
- POST /v1/auth/mfa/verify                    MFA verification (step 2)
- POST /v1/auth/activate                      Account activation via invitation link
- POST /v1/auth/mfa/verify-setup              Confirm MFA setup
- POST /v1/auth/refresh                       Refresh access token
- GET  /v1/auth/me                            Current authenticated user
- GET  /v1/auth/check-activation/<token>      Validate an activation link
- GET  /v1/auth/check-reset/<token>           Validate a password reset link
- POST /v1/auth/reset-password                Reset password via reset link
- POST /v1/auth/change-password               Change password
- POST /v1/auth/mfa/setup                     Generate new TOTP secret (account settings)
- POST /v1/auth/mfa/setup/confirm             Verify code and enable TOTP (account settings)
- DELETE /v1/auth/mfa                         Disable TOTP (requires at least one passkey)
- POST /v1/auth/passkey/register/begin        Start passkey registration (account settings)
- POST /v1/auth/passkey/register/complete     Finish passkey registration (account settings)
- POST /v1/auth/passkey/login/begin           Start standalone passkey login (discoverable)
- POST /v1/auth/passkey/login/complete        Finish standalone passkey login
- POST /v1/auth/passkey/setup/begin           Start passkey setup during account activation
- POST /v1/auth/passkey/setup/complete        Finish passkey setup during account activation
- POST /v1/auth/passkey/change-password/begin   Validate current password, generate passkey challenge
- POST /v1/auth/passkey/change-password/complete Verify passkey, apply new password
- POST /v1/auth/passkey/reset-password/begin    Validate reset token, generate passkey challenge
- POST /v1/auth/passkey/reset-password/complete Verify passkey, apply new password, consume reset token
- GET  /v1/auth/passkey                       List registered passkeys
- PATCH  /v1/auth/passkey/<id>               Rename a passkey
- DELETE /v1/auth/passkey/<id>                Remove a passkey (requires remaining 2FA)
"""
import io
import json
import base64
import pyotp
import qrcode
from datetime import timedelta
from flask import request, jsonify, current_app
from flask_smorest import Blueprint
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    jwt_required,
    get_jwt_identity,
    get_jwt,
    decode_token,
)
from ..extensions import db
from ..models import User, Passkey, ActivationLink, AuditLog
from ..security import limiter, get_client_ip, blacklist_token, is_token_blacklisted
from ..schemas import (
    LoginSchema, LoginResponseSchema, MFAVerifySchema,
    ActivateAccountSchema, ResetPasswordSchema, ChangePasswordSchema,
    ErrorSchema, MessageSchema, UserSchema,
)


auth_bp = Blueprint(
    'auth',
    __name__,
    description='Authentication — Login, MFA, password management'
)


@auth_bp.route('/login', methods=['POST'])
@limiter.limit("5 per minute")
@auth_bp.arguments(LoginSchema)
@auth_bp.response(200, LoginResponseSchema)
@auth_bp.alt_response(401, schema=ErrorSchema, description="Invalid credentials")
def login(data):
    """
    Step 1 of login: email/password verification.

    If MFA is enabled, returns a temporary token for step 2.
    """
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({'error': 'Email et mot de passe requis'}), 400

    user = User.query.filter_by(email=email).first()

    if not user or not user.check_password(password):
        AuditLog.log(
            action=AuditLog.ACTION_LOGIN_FAILED,
            details={'email': email},
            ip_address=get_client_ip()
        )
        db.session.commit()
        return jsonify({'error': 'Email ou mot de passe incorrect'}), 401

    if not user.is_active:
        return jsonify({'error': 'Ce compte est désactivé'}), 403

    if user.mfa_enabled:
        mfa_token = create_access_token(
            identity=str(user.id),
            additional_claims={'mfa_pending': True},
            expires_delta=timedelta(minutes=10)
        )
        return jsonify({
            'mfa_required': True,
            'mfa_token': mfa_token,
            'message': 'Veuillez entrer votre code MFA'
        }), 200

    # Utilisateur avec passkey uniquement (sans TOTP) — connexion via passkey requise
    if user.passkeys.count() > 0:
        return jsonify({
            'error': 'Ce compte utilise la connexion par passkey. '
                     'Veuillez vous connecter avec votre appareil.',
            'passkey_only': True,
        }), 403

    return complete_login(user)


@auth_bp.route('/mfa/verify', methods=['POST'])
@limiter.limit("5 per minute")
@auth_bp.arguments(MFAVerifySchema)
@auth_bp.response(200, LoginResponseSchema)
@auth_bp.alt_response(401, schema=ErrorSchema, description="Invalid MFA code")
def verify_mfa(data):
    """Step 2 of login: TOTP code verification."""
    mfa_token = data.get('mfa_token')
    code = data.get('code')

    if not mfa_token or not code:
        return jsonify({'error': 'Token MFA et code requis'}), 400

    try:
        from flask_jwt_extended import decode_token
        decoded = decode_token(mfa_token)

        if not decoded.get('mfa_pending'):
            return jsonify({'error': 'Token invalide'}), 401

        user_id = int(decoded.get('sub'))
    except Exception:
        return jsonify({'error': 'Token MFA invalide ou expiré'}), 401

    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404

    totp = pyotp.TOTP(user.mfa_secret)
    if not totp.verify(code, valid_window=1):
        AuditLog.log(
            action=AuditLog.ACTION_LOGIN_FAILED,
            user_id=user.id,
            details={'reason': 'invalid_mfa_code'},
            ip_address=get_client_ip()
        )
        db.session.commit()
        return jsonify({'error': 'Code MFA invalide'}), 401

    return complete_login(user)


def complete_login(user):
    """Finalize login and return JWT tokens."""
    user.update_last_login()
    AuditLog.log(
        action=AuditLog.ACTION_LOGIN,
        user_id=user.id,
        ip_address=get_client_ip()
    )
    db.session.commit()

    access_token = create_access_token(identity=str(user.id))
    refresh_token = create_refresh_token(identity=str(user.id))

    return jsonify({
        'message': 'Connexion réussie',
        'user': user.to_dict(),
        'access_token': access_token,
        'refresh_token': refresh_token
    }), 200


@auth_bp.route('/activate', methods=['POST'])
@limiter.limit("3 per minute")
@auth_bp.arguments(ActivateAccountSchema)
@auth_bp.response(201, LoginResponseSchema)
@auth_bp.alt_response(400, schema=ErrorSchema, description="Invalid token or weak password")
def activate_account(data):
    """
    Activate an account via an invitation link.

    Returns MFA setup QR code for immediate configuration.
    """
    token = data.get('token')
    password = data.get('password')
    username = data.get('username')

    if not token or not password:
        return jsonify({'error': 'Token et mot de passe requis'}), 400

    link = ActivationLink.query.filter_by(token=token).first()

    if not link:
        return jsonify({'error': "Lien d'activation invalide"}), 404

    if not link.is_valid():
        return jsonify({'error': "Lien d'activation expiré ou déjà utilisé"}), 400

    if not User.validate_password_strength(password):
        return jsonify({
            'error': 'Mot de passe trop faible',
            'message': 'Le mot de passe doit contenir au moins 12 caractères, '
                       'une majuscule, une minuscule, un chiffre et un caractère spécial.'
        }), 400

    email = data.get('email') or link.email
    if not email:
        return jsonify({'error': 'Email requis'}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'Cet email est déjà utilisé'}), 409

    user = User(email=email, username=username, role=link.role)
    user.set_password(password)

    mfa_secret = pyotp.random_base32()
    user.mfa_secret = mfa_secret
    user.mfa_enabled = False

    link.mark_as_used()
    db.session.add(user)

    AuditLog.log(
        action=AuditLog.ACTION_ACCOUNT_ACTIVATE,
        user_id=None,
        target_type='user',
        details={'email': email, 'role': link.role, 'link_type': link.link_type},
        ip_address=get_client_ip()
    )

    db.session.commit()

    issuer = current_app.config.get('MFA_ISSUER_NAME', 'MARIAM')
    totp = pyotp.TOTP(mfa_secret)
    provisioning_uri = totp.provisioning_uri(name=email, issuer_name=issuer)

    qr = qrcode.QRCode(version=1, box_size=5, border=2)
    qr.add_data(provisioning_uri)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")

    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    qr_base64 = base64.b64encode(buffer.getvalue()).decode()

    return jsonify({
        'message': 'Compte créé avec succès',
        'user': user.to_dict(),
        'mfa_setup': {
            'qr_code': f'data:image/png;base64,{qr_base64}',
            'secret': mfa_secret,
            'user_id': user.id,
            'setup_token': _make_setup_token(user.id),
        }
    }), 201


@auth_bp.route('/mfa/verify-setup', methods=['POST'])
@limiter.limit("5 per minute")
@auth_bp.response(200, LoginResponseSchema)
@auth_bp.alt_response(401, schema=ErrorSchema, description="Invalid TOTP code")
def verify_mfa_setup():
    """
    Confirm MFA setup by verifying a TOTP code.

    On success, MFA is enabled and full JWT tokens are returned.
    Requires a setup_token issued by the activate endpoint.
    """
    data = request.get_json()

    if not data:
        return jsonify({'error': 'Données manquantes'}), 400

    user_id = data.get('user_id')
    code = data.get('code')
    setup_token = data.get('setup_token')

    if not user_id or not code:
        return jsonify({'error': 'ID utilisateur et code requis'}), 400

    if not setup_token:
        return jsonify({'error': 'setup_token requis'}), 400

    try:
        decoded = decode_token(setup_token)
        if not decoded.get('setup_phase') or int(decoded['sub']) != int(user_id):
            return jsonify({'error': 'setup_token invalide'}), 401
    except Exception:
        return jsonify({'error': 'setup_token invalide ou expiré'}), 401

    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404

    if user.mfa_enabled:
        return jsonify({'error': 'MFA déjà activé'}), 400

    totp = pyotp.TOTP(user.mfa_secret)
    if not totp.verify(code, valid_window=1):
        return jsonify({'error': 'Code invalide'}), 401

    user.mfa_enabled = True

    AuditLog.log(
        action=AuditLog.ACTION_MFA_SETUP,
        user_id=user.id,
        ip_address=get_client_ip()
    )

    db.session.commit()

    access_token = create_access_token(identity=str(user.id))
    refresh_token = create_refresh_token(identity=str(user.id))

    return jsonify({
        'message': 'MFA activé avec succès',
        'user': user.to_dict(),
        'access_token': access_token,
        'refresh_token': refresh_token
    }), 200


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
    user = User.query.get(current_user_id)
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
    user = User.query.get(current_user_id)
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
        'user': user.to_dict(),
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
    user = User.query.get(current_user_id)
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
        'user': user.to_dict(),
    }), 200


@auth_bp.route('/refresh', methods=['POST'])
@limiter.limit("10 per minute")
@jwt_required(refresh=True)
@auth_bp.response(200, LoginResponseSchema)
def refresh():
    """Renew access_token using a valid refresh_token."""
    current_user_id = get_jwt_identity()
    new_access_token = create_access_token(identity=current_user_id)

    return jsonify({'access_token': new_access_token}), 200


@auth_bp.route('/logout', methods=['POST'])
@limiter.limit("20 per minute")
@jwt_required(refresh=True)
def logout():
    """
    Invalidate both the refresh token and the access token server-side.
    - Refresh token: sent as Authorization: Bearer {refresh_token}
    - Access token:  sent in the request body as { "access_token": "..." }
    """
    from datetime import datetime, timezone

    now_ts = datetime.now(timezone.utc).timestamp()

    # Blacklist the refresh token (from Authorization header)
    jwt_data = get_jwt()
    jti = jwt_data.get('jti')
    exp = jwt_data.get('exp')
    if jti and exp:
        blacklist_token(jti, max(1, int(exp - now_ts)))

    # Blacklist the access token if provided
    data = request.get_json(silent=True) or {}
    access_token = data.get('access_token')
    if access_token:
        try:
            decoded_access = decode_token(access_token)
            access_jti = decoded_access.get('jti')
            access_exp = decoded_access.get('exp')
            if access_jti and access_exp:
                blacklist_token(access_jti, max(1, int(access_exp - now_ts)))
        except Exception:
            pass  # Invalid token — ignore, client-side cleanup still happens

    AuditLog.log(
        action=AuditLog.ACTION_LOGOUT,
        user_id=int(get_jwt_identity()),
        ip_address=get_client_ip(),
    )
    db.session.commit()

    return jsonify({'message': 'Déconnecté'}), 200


@auth_bp.route('/me', methods=['GET'])
@jwt_required()
@auth_bp.response(200, UserSchema)
def get_current_user():
    """Get the currently authenticated user's profile."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404

    return jsonify({'user': user.to_dict()}), 200


@auth_bp.route('/check-activation/<token>', methods=['GET'])
@auth_bp.response(200, LoginResponseSchema)
@auth_bp.alt_response(404, schema=ErrorSchema, description="Invalid or expired link")
def check_activation_link(token):
    """Verify if an activation link is valid before showing the form."""
    link = ActivationLink.query.filter_by(token=token).first()

    if not link:
        return jsonify({'valid': False, 'error': 'Lien invalide'}), 404

    if not link.is_valid():
        return jsonify({'valid': False, 'error': 'Lien expiré ou déjà utilisé'}), 400

    return jsonify({
        'valid': True,
        'link_type': link.link_type,
        'email': link.email,
        'role': link.role
    }), 200


@auth_bp.route('/check-reset/<token>', methods=['GET'])
@auth_bp.response(200, LoginResponseSchema)
@auth_bp.alt_response(404, schema=ErrorSchema, description="Invalid or expired link")
def check_reset_link(token):
    """Verify if a password reset link is valid."""
    link = ActivationLink.query.filter_by(token=token, link_type='password_reset').first()

    if not link:
        return jsonify({'valid': False, 'error': 'Lien invalide'}), 404

    if not link.is_valid():
        return jsonify({'valid': False, 'error': 'Lien expiré ou déjà utilisé'}), 400

    user = User.query.filter_by(email=link.email).first()
    has_passkeys = user.passkeys.count() > 0 if user else False
    mfa_enabled = user.mfa_enabled if user else False

    return jsonify({
        'valid': True,
        'link_type': link.link_type,
        'email': link.email,
        'mfa_enabled': mfa_enabled,
        'has_passkeys': has_passkeys,
    }), 200


@auth_bp.route('/reset-password', methods=['POST'])
@limiter.limit("3 per minute")
@auth_bp.arguments(ResetPasswordSchema)
@auth_bp.response(200, MessageSchema)
@auth_bp.alt_response(401, schema=ErrorSchema, description="Invalid MFA code")
def reset_password(data):
    """
    Reset password via a dedicated reset link.

    Requires: reset token + new password + current TOTP code.
    """
    token = data.get('token')
    new_password = data.get('new_password')
    mfa_code = data.get('mfa_code')

    if not token or not new_password or not mfa_code:
        return jsonify({'error': 'Token, nouveau mot de passe et code MFA requis'}), 400

    link = ActivationLink.query.filter_by(token=token, link_type='password_reset').first()

    if not link:
        return jsonify({'error': 'Lien de réinitialisation invalide'}), 404

    if not link.is_valid():
        return jsonify({'error': 'Lien de réinitialisation expiré ou déjà utilisé'}), 400

    user = User.query.filter_by(email=link.email).first()

    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404

    if not user.is_active:
        return jsonify({'error': 'Ce compte est désactivé'}), 403

    if not user.mfa_enabled or not user.mfa_secret:
        if user.passkeys.count() > 0:
            return jsonify({
                'error': 'This account uses passkey authentication. Use the passkey reset endpoint.',
                'passkey_required': True,
            }), 400
        return jsonify({'error': 'MFA not configured for this user'}), 400

    totp = pyotp.TOTP(user.mfa_secret)
    if not totp.verify(mfa_code, valid_window=1):
        AuditLog.log(
            action=AuditLog.ACTION_PASSWORD_RESET,
            user_id=user.id,
            details={'success': False, 'reason': 'invalid_mfa'},
            ip_address=get_client_ip()
        )
        db.session.commit()
        return jsonify({'error': 'Code MFA invalide'}), 401

    if not User.validate_password_strength(new_password):
        return jsonify({
            'error': 'Mot de passe trop faible',
            'message': 'Le mot de passe doit contenir au moins 12 caractères, '
                       'une majuscule, une minuscule, un chiffre et un caractère spécial.'
        }), 400

    user.set_password(new_password)
    link.mark_as_used()

    AuditLog.log(
        action=AuditLog.ACTION_PASSWORD_RESET,
        user_id=user.id,
        details={'success': True, 'method': 'reset_link'},
        ip_address=get_client_ip()
    )

    db.session.commit()

    return jsonify({'message': 'Mot de passe réinitialisé avec succès'}), 200


@auth_bp.route('/change-password', methods=['POST'])
@limiter.limit("3 per minute")
@jwt_required()
@auth_bp.arguments(ChangePasswordSchema)
@auth_bp.response(200, MessageSchema)
@auth_bp.alt_response(401, schema=ErrorSchema, description="Invalid current password or MFA code")
def change_password(data):
    """
    Change the password of the currently authenticated user.

    Requires: current password + new password + current TOTP code.
    """
    current_password = data.get('current_password')
    new_password = data.get('new_password')
    mfa_code = data.get('mfa_code')

    if not current_password or not new_password or not mfa_code:
        return jsonify({'error': 'Mot de passe actuel, nouveau mot de passe et code MFA requis'}), 400

    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404

    if not user.check_password(current_password):
        AuditLog.log(
            action=AuditLog.ACTION_PASSWORD_CHANGE,
            user_id=user.id,
            details={'success': False, 'reason': 'wrong_current_password'},
            ip_address=get_client_ip()
        )
        db.session.commit()
        return jsonify({'error': 'Mot de passe actuel incorrect'}), 401

    if user.mfa_enabled and user.mfa_secret:
        totp = pyotp.TOTP(user.mfa_secret)
        if not totp.verify(mfa_code, valid_window=1):
            AuditLog.log(
                action=AuditLog.ACTION_PASSWORD_CHANGE,
                user_id=user.id,
                details={'success': False, 'reason': 'invalid_mfa'},
                ip_address=get_client_ip()
            )
            db.session.commit()
            return jsonify({'error': 'Code MFA invalide'}), 401

    if not User.validate_password_strength(new_password):
        return jsonify({
            'error': 'Mot de passe trop faible',
            'message': 'Le mot de passe doit contenir au moins 12 caractères, '
                       'une majuscule, une minuscule, un chiffre et un caractère spécial.'
        }), 400

    user.set_password(new_password)

    AuditLog.log(
        action=AuditLog.ACTION_PASSWORD_CHANGE,
        user_id=user.id,
        details={'success': True},
        ip_address=get_client_ip()
    )

    db.session.commit()

    return jsonify({'message': 'Mot de passe modifié avec succès'}), 200


# ============================================================
# PASSKEYS — WebAuthn / FIDO2
# ============================================================

def _detect_device_name(user_agent: str) -> str:
    """
    Derive a human-readable device name from a User-Agent string.
    Used as the default passkey label when the user provides none.
    """
    if not user_agent:
        return 'Appareil inconnu'
    ua = user_agent

    # Mobile / tablet devices
    if 'iPhone' in ua:
        return 'iPhone'
    if 'iPad' in ua:
        return 'iPad'
    if 'Android' in ua:
        return 'Tablette Android' if ('Tablet' in ua or 'Kindle' in ua) else 'Android'

    # Desktop OS
    if 'CrOS' in ua:
        os_name = 'ChromeOS'
    elif 'Windows' in ua:
        os_name = 'Windows'
    elif 'Macintosh' in ua or 'Mac OS X' in ua:
        os_name = 'macOS'
    elif 'Linux' in ua:
        os_name = 'Linux'
    else:
        os_name = None

    # Browser (order matters: Edge/Opera check before Chrome)
    if 'Edg/' in ua or 'EdgA/' in ua:
        browser = 'Edge'
    elif 'OPR/' in ua or 'Opera/' in ua:
        browser = 'Opera'
    elif 'Chrome/' in ua:
        browser = 'Chrome'
    elif 'Firefox/' in ua:
        browser = 'Firefox'
    elif 'Safari/' in ua:
        browser = 'Safari'
    else:
        browser = None

    if os_name and browser:
        return f'{os_name} · {browser}'
    return os_name or browser or 'Appareil inconnu'


def _get_webauthn_config():
    """Return the WebAuthn RP configuration from the current app."""
    return (
        current_app.config['WEBAUTHN_RP_ID'],
        current_app.config['WEBAUTHN_RP_NAME'],
        current_app.config['WEBAUTHN_ORIGIN'],
    )


def _make_setup_token(user_id: int) -> str:
    """
    Issue a short-lived setup token (15 min) used exclusively during account
    activation to authorise passkey registration and TOTP verification.

    Accepted ONLY by passkey_setup_begin, passkey_setup_complete, and
    verify_mfa_setup. Blocked on all regular @jwt_required() endpoints by
    the check_if_token_revoked callback (setup_phase claim).
    """
    return create_access_token(
        identity=str(user_id),
        additional_claims={'setup_phase': True},
        expires_delta=timedelta(minutes=15),
    )


def _make_challenge_token(user_id: int, challenge_bytes: bytes) -> str:
    """
    Encode a WebAuthn challenge into a short-lived JWT (120 s).
    Avoids storing state server-side.
    """
    challenge_b64 = base64.urlsafe_b64encode(challenge_bytes).rstrip(b'=').decode()
    return create_access_token(
        identity=str(user_id),
        additional_claims={'webauthn_challenge': challenge_b64, 'webauthn_pending': True},
        expires_delta=timedelta(seconds=120),
    )


def _decode_challenge_token(token: str):
    """
    Decode a challenge token.
    Returns (user_id, challenge_bytes) or raises an exception.
    """
    decoded = decode_token(token)
    if not decoded.get('webauthn_pending'):
        raise ValueError('Token invalide')
    user_id = int(decoded['sub'])
    challenge_b64 = decoded['webauthn_challenge']
    # Restaurer le padding Base64url
    padding = 4 - len(challenge_b64) % 4
    if padding != 4:
        challenge_b64 += '=' * padding
    challenge_bytes = base64.urlsafe_b64decode(challenge_b64)
    return user_id, challenge_bytes


@auth_bp.route('/passkey/register/begin', methods=['POST'])
@limiter.limit("10 per minute")
@jwt_required()
def passkey_register_begin():
    """
    Start passkey registration for the authenticated user.

    Returns WebAuthn options for navigator.credentials.create() and a
    short-lived challenge_token to submit with the /complete request.
    """
    from webauthn import generate_registration_options, options_to_json
    from webauthn.helpers.structs import (
        AuthenticatorSelectionCriteria,
        UserVerificationRequirement,
        ResidentKeyRequirement,
    )
    from webauthn.helpers.cose import COSEAlgorithmIdentifier

    rp_id, rp_name, _ = _get_webauthn_config()
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404

    options = generate_registration_options(
        rp_id=rp_id,
        rp_name=rp_name,
        user_id=str(user.id).encode(),
        user_name=user.email,
        user_display_name=user.username or user.email,
        exclude_credentials=[],
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.PREFERRED,
        ),
        supported_pub_key_algs=[
            COSEAlgorithmIdentifier.ECDSA_SHA_256,
            COSEAlgorithmIdentifier.RSASSA_PKCS1_v1_5_SHA_256,
        ],
    )

    challenge_token = _make_challenge_token(user.id, options.challenge)
    options_dict = json.loads(options_to_json(options))

    return jsonify({
        'options': options_dict,
        'challenge_token': challenge_token,
    }), 200


@auth_bp.route('/passkey/register/complete', methods=['POST'])
@limiter.limit("10 per minute")
@jwt_required()
def passkey_register_complete():
    """
    Finalize passkey registration for the authenticated user.

    Body: { challenge_token, credential, device_name? }
    """
    from webauthn import verify_registration_response
    from webauthn.helpers import base64url_to_bytes
    from webauthn.helpers.structs import (
        RegistrationCredential,
        AuthenticatorAttestationResponse,
        AuthenticatorTransport,
    )

    data = request.get_json()
    if not data:
        return jsonify({'error': 'Données manquantes'}), 400

    challenge_token = data.get('challenge_token')
    credential_data = data.get('credential')
    device_name = data.get('device_name', '').strip() or _detect_device_name(request.headers.get('User-Agent', ''))

    if not challenge_token or not credential_data:
        return jsonify({'error': 'challenge_token et credential requis'}), 400

    current_user_id = int(get_jwt_identity())

    try:
        token_user_id, challenge_bytes = _decode_challenge_token(challenge_token)
    except Exception:
        return jsonify({'error': 'challenge_token invalide ou expiré'}), 401

    if token_user_id != current_user_id:
        return jsonify({'error': 'Token invalide'}), 401

    user = User.query.get(current_user_id)
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404

    rp_id, _, origin = _get_webauthn_config()

    try:
        resp = credential_data.get('response', {})
        transports_raw = resp.get('transports', [])
        transports = [AuthenticatorTransport(t) for t in transports_raw] if transports_raw else None

        credential = RegistrationCredential(
            id=credential_data['id'],
            raw_id=base64url_to_bytes(credential_data.get('rawId', credential_data['id'])),
            response=AuthenticatorAttestationResponse(
                client_data_json=base64url_to_bytes(resp['clientDataJSON']),
                attestation_object=base64url_to_bytes(resp['attestationObject']),
                transports=transports,
            ),
        )
        verification = verify_registration_response(
            credential=credential,
            expected_challenge=challenge_bytes,
            expected_rp_id=rp_id,
            expected_origin=origin,
        )
    except Exception as e:
        return jsonify({'error': f'Vérification échouée : {str(e)}'}), 400

    passkey = Passkey(
        user_id=user.id,
        credential_id=verification.credential_id,
        public_key=verification.credential_public_key,
        sign_count=verification.sign_count,
        transports=[t for t in transports_raw] if transports_raw else [],
        device_name=device_name,
    )
    db.session.add(passkey)

    AuditLog.log(
        action=AuditLog.ACTION_PASSKEY_REGISTERED,
        user_id=user.id,
        details={'device_name': device_name},
        ip_address=get_client_ip(),
    )
    db.session.commit()

    return jsonify({
        'message': 'Passkey enregistrée avec succès',
        'passkey': passkey.to_dict(),
    }), 201



@auth_bp.route('/passkey', methods=['GET'])
@jwt_required()
def list_passkeys():
    """List all registered passkeys for the authenticated user."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404

    return jsonify({
        'passkeys': [p.to_dict() for p in user.passkeys],
    }), 200


@auth_bp.route('/passkey/<int:passkey_id>', methods=['DELETE'])
@jwt_required()
def delete_passkey(passkey_id):
    """
    Delete a registered passkey (must belong to the authenticated user).

    Rejected if it is the last passkey and TOTP is not active (2FA constraint).
    """
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404

    passkey = Passkey.query.filter_by(id=passkey_id, user_id=current_user_id).first()
    if not passkey:
        return jsonify({'error': 'Passkey introuvable'}), 404

    # Contrainte : au moins une méthode 2FA doit rester active
    if user.passkeys.count() == 1 and not user.mfa_enabled:
        return jsonify({
            'error': "Impossible de supprimer la dernière passkey sans authentification par code active. "
                     "Activez d'abord l'authentification par code.",
        }), 409

    db.session.delete(passkey)

    AuditLog.log(
        action=AuditLog.ACTION_PASSKEY_DELETED,
        user_id=current_user_id,
        details={'passkey_id': passkey_id},
        ip_address=get_client_ip(),
    )
    db.session.commit()

    return jsonify({'message': 'Passkey supprimée'}), 200


@auth_bp.route('/passkey/<int:passkey_id>', methods=['PATCH'])
@limiter.limit("10 per minute")
@jwt_required()
def rename_passkey(passkey_id):
    """
    Rename a registered passkey.

    Body: { device_name }
    """
    current_user_id = int(get_jwt_identity())

    passkey = Passkey.query.filter_by(id=passkey_id, user_id=current_user_id).first()
    if not passkey:
        return jsonify({'error': 'Passkey introuvable'}), 404

    data = request.get_json()
    device_name = (data.get('device_name', '') if data else '').strip()
    if not device_name:
        return jsonify({'error': 'device_name requis'}), 400
    if len(device_name) > 100:
        return jsonify({'error': 'Le nom ne peut pas dépasser 100 caractères'}), 400

    old_name = passkey.device_name
    passkey.device_name = device_name
    AuditLog.log(
        action=AuditLog.ACTION_PASSKEY_RENAMED,
        user_id=current_user_id,
        details={'passkey_id': passkey_id, 'old_name': old_name, 'new_name': device_name},
        ip_address=get_client_ip(),
    )
    db.session.commit()

    return jsonify({'message': 'Passkey renommée', 'device_name': device_name}), 200


# ============================================================
# PASSKEYS — Connexion autonome (sans email/password)
# ============================================================

@auth_bp.route('/passkey/login/begin', methods=['POST'])
@limiter.limit("10 per minute")
def passkey_login_begin():
    """
    Start a standalone passkey login (no email/password required).

    Generates a discoverable challenge (empty allowCredentials):
    the browser presents all passkeys available for this domain.
    """
    from webauthn import generate_authentication_options, options_to_json
    from webauthn.helpers.structs import UserVerificationRequirement

    rp_id, _, _ = _get_webauthn_config()

    options = generate_authentication_options(
        rp_id=rp_id,
        allow_credentials=[],  # discoverable — le navigateur propose toutes les passkeys du domaine
        user_verification=UserVerificationRequirement.REQUIRED,
    )

    # user_id=0 : on ne connaît pas encore l'utilisateur
    challenge_token = _make_challenge_token(0, options.challenge)
    options_dict = json.loads(options_to_json(options))

    return jsonify({
        'options': options_dict,
        'challenge_token': challenge_token,
    }), 200


@auth_bp.route('/passkey/login/complete', methods=['POST'])
@limiter.limit("10 per minute")
def passkey_login_complete():
    """
    Finalize a standalone passkey login.

    Identifies the user by looking up the credential_id in the database.
    Body: { challenge_token, credential }
    """
    from webauthn import verify_authentication_response
    from webauthn.helpers import base64url_to_bytes
    from webauthn.helpers.structs import (
        AuthenticationCredential,
        AuthenticatorAssertionResponse,
    )

    data = request.get_json()
    if not data:
        return jsonify({'error': 'Données manquantes'}), 400

    challenge_token = data.get('challenge_token')
    credential_data = data.get('credential')

    if not challenge_token or not credential_data:
        return jsonify({'error': 'challenge_token et credential requis'}), 400

    try:
        _, challenge_bytes = _decode_challenge_token(challenge_token)
    except Exception:
        return jsonify({'error': 'challenge_token invalide ou expiré'}), 401

    # Identifier la passkey par credential_id
    try:
        raw_id_bytes = base64url_to_bytes(credential_data.get('rawId', credential_data.get('id', '')))
    except Exception:
        return jsonify({'error': 'credential_id invalide'}), 400

    passkey = Passkey.query.filter_by(credential_id=raw_id_bytes).first()
    if not passkey:
        return jsonify({'error': 'Passkey inconnue'}), 404

    user = User.query.get(passkey.user_id)
    if not user or not user.is_active:
        return jsonify({'error': 'Utilisateur non trouvé ou désactivé'}), 404

    rp_id, _, origin = _get_webauthn_config()

    try:
        resp = credential_data.get('response', {})
        user_handle = base64url_to_bytes(resp['userHandle']) if resp.get('userHandle') else None
        credential = AuthenticationCredential(
            id=credential_data['id'],
            raw_id=raw_id_bytes,
            response=AuthenticatorAssertionResponse(
                client_data_json=base64url_to_bytes(resp['clientDataJSON']),
                authenticator_data=base64url_to_bytes(resp['authenticatorData']),
                signature=base64url_to_bytes(resp['signature']),
                user_handle=user_handle,
            ),
        )
        verification = verify_authentication_response(
            credential=credential,
            expected_challenge=challenge_bytes,
            expected_rp_id=rp_id,
            expected_origin=origin,
            credential_public_key=passkey.public_key,
            credential_current_sign_count=passkey.sign_count,
            require_user_verification=True,
        )
    except Exception as e:
        AuditLog.log(
            action=AuditLog.ACTION_LOGIN_FAILED,
            user_id=user.id,
            details={'reason': 'passkey_login_failed', 'error': str(e)},
            ip_address=get_client_ip(),
        )
        db.session.commit()
        return jsonify({'error': 'Vérification de la passkey échouée'}), 401

    passkey.sign_count = verification.new_sign_count
    passkey.last_used_at = db.func.now()

    return complete_login(user)


# ============================================================
# PASSKEYS — Registration during account activation
# ============================================================

@auth_bp.route('/passkey/setup/begin', methods=['POST'])
@limiter.limit("10 per minute")
def passkey_setup_begin():
    """
    Start passkey registration during account activation.

    Uses resident_key=REQUIRED so the passkey is discoverable
    (required for passwordless login).
    Body: { user_id }
    """
    from webauthn import generate_registration_options, options_to_json
    from webauthn.helpers.structs import (
        AuthenticatorSelectionCriteria,
        UserVerificationRequirement,
        ResidentKeyRequirement,
    )
    from webauthn.helpers.cose import COSEAlgorithmIdentifier

    data = request.get_json()
    if not data:
        return jsonify({'error': 'Données manquantes'}), 400

    user_id = data.get('user_id')
    setup_token = data.get('setup_token')

    if not user_id:
        return jsonify({'error': 'user_id requis'}), 400

    if not setup_token:
        return jsonify({'error': 'setup_token requis'}), 400

    try:
        decoded = decode_token(setup_token)
        if not decoded.get('setup_phase') or int(decoded['sub']) != int(user_id):
            return jsonify({'error': 'setup_token invalide'}), 401
    except Exception:
        return jsonify({'error': 'setup_token invalide ou expiré'}), 401

    user = User.query.get(int(user_id))
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404

    if user.mfa_enabled:
        return jsonify({'error': 'Compte déjà activé avec TOTP'}), 400

    rp_id, rp_name, _ = _get_webauthn_config()

    options = generate_registration_options(
        rp_id=rp_id,
        rp_name=rp_name,
        user_id=str(user.id).encode(),
        user_name=user.email,
        user_display_name=user.username or user.email,
        exclude_credentials=[],
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.REQUIRED,  # obligatoire pour le login discoverable
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
        supported_pub_key_algs=[
            COSEAlgorithmIdentifier.ECDSA_SHA_256,
            COSEAlgorithmIdentifier.RSASSA_PKCS1_v1_5_SHA_256,
        ],
    )

    challenge_token = _make_challenge_token(user.id, options.challenge)
    options_dict = json.loads(options_to_json(options))

    return jsonify({
        'options': options_dict,
        'challenge_token': challenge_token,
    }), 200


@auth_bp.route('/passkey/setup/complete', methods=['POST'])
@limiter.limit("10 per minute")
def passkey_setup_complete():
    """
    Finalize passkey registration during account activation.

    Stores the passkey and returns access JWTs (immediate login).
    Body: { user_id, challenge_token, credential, device_name? }
    """
    from webauthn import verify_registration_response
    from webauthn.helpers import base64url_to_bytes
    from webauthn.helpers.structs import (
        RegistrationCredential,
        AuthenticatorAttestationResponse,
        AuthenticatorTransport,
    )

    data = request.get_json()
    if not data:
        return jsonify({'error': 'Données manquantes'}), 400

    user_id = data.get('user_id')
    challenge_token = data.get('challenge_token')
    credential_data = data.get('credential')
    device_name = data.get('device_name', '').strip() or _detect_device_name(request.headers.get('User-Agent', ''))

    if not user_id or not challenge_token or not credential_data:
        return jsonify({'error': 'user_id, challenge_token et credential requis'}), 400

    user = User.query.get(int(user_id))
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404

    if user.mfa_enabled:
        return jsonify({'error': 'Compte déjà activé avec TOTP'}), 400

    try:
        token_user_id, challenge_bytes = _decode_challenge_token(challenge_token)
    except Exception:
        return jsonify({'error': 'challenge_token invalide ou expiré'}), 401

    if token_user_id != int(user_id):
        return jsonify({'error': 'Token invalide'}), 401

    rp_id, _, origin = _get_webauthn_config()

    try:
        resp = credential_data.get('response', {})
        transports_raw = resp.get('transports', [])
        transports = [AuthenticatorTransport(t) for t in transports_raw] if transports_raw else None

        credential = RegistrationCredential(
            id=credential_data['id'],
            raw_id=base64url_to_bytes(credential_data.get('rawId', credential_data['id'])),
            response=AuthenticatorAttestationResponse(
                client_data_json=base64url_to_bytes(resp['clientDataJSON']),
                attestation_object=base64url_to_bytes(resp['attestationObject']),
                transports=transports,
            ),
        )
        verification = verify_registration_response(
            credential=credential,
            expected_challenge=challenge_bytes,
            expected_rp_id=rp_id,
            expected_origin=origin,
        )
    except Exception as e:
        return jsonify({'error': f'Vérification échouée : {str(e)}'}), 400

    passkey = Passkey(
        user_id=user.id,
        credential_id=verification.credential_id,
        public_key=verification.credential_public_key,
        sign_count=verification.sign_count,
        transports=[t for t in transports_raw] if transports_raw else [],
        device_name=device_name,
    )
    db.session.add(passkey)

    AuditLog.log(
        action=AuditLog.ACTION_PASSKEY_SETUP,
        user_id=user.id,
        details={'device_name': device_name},
        ip_address=get_client_ip(),
    )
    db.session.commit()

    return complete_login(user)


# ============================================================
# PASSKEYS — Password change and reset with passkey verification
# ============================================================

@auth_bp.route('/passkey/change-password/begin', methods=['POST'])
@limiter.limit("5 per minute")
@jwt_required()
def passkey_change_password_begin():
    """
    Step 1 of passkey-based password change.

    Validates the current password and generates a WebAuthn challenge targeting
    the authenticated user's registered passkeys.
    Body: { current_password }
    """
    from webauthn import generate_authentication_options, options_to_json
    from webauthn.helpers.structs import (
        UserVerificationRequirement,
        PublicKeyCredentialDescriptor,
        AuthenticatorTransport,
    )

    data = request.get_json()
    if not data:
        return jsonify({'error': 'Données manquantes'}), 400

    current_password = data.get('current_password')
    if not current_password:
        return jsonify({'error': 'current_password requis'}), 400

    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404

    if not user.check_password(current_password):
        AuditLog.log(
            action=AuditLog.ACTION_PASSWORD_CHANGE,
            user_id=user.id,
            details={'success': False, 'reason': 'wrong_current_password'},
            ip_address=get_client_ip(),
        )
        db.session.commit()
        return jsonify({'error': 'Mot de passe actuel incorrect'}), 401

    passkeys = list(user.passkeys)
    if not passkeys:
        return jsonify({'error': 'Aucune passkey enregistrée'}), 404

    rp_id, _, _ = _get_webauthn_config()

    allow_credentials = [
        PublicKeyCredentialDescriptor(
            id=p.credential_id,
            transports=[AuthenticatorTransport(t) for t in (p.transports or [])
                        if t in {e.value for e in AuthenticatorTransport}],
        )
        for p in passkeys
    ]

    options = generate_authentication_options(
        rp_id=rp_id,
        allow_credentials=allow_credentials,
        user_verification=UserVerificationRequirement.REQUIRED,
    )

    challenge_token = _make_challenge_token(user.id, options.challenge)
    options_dict = json.loads(options_to_json(options))

    return jsonify({
        'options': options_dict,
        'challenge_token': challenge_token,
    }), 200


@auth_bp.route('/passkey/change-password/complete', methods=['POST'])
@limiter.limit("5 per minute")
@jwt_required()
def passkey_change_password_complete():
    """
    Step 2 of passkey-based password change.

    Verifies the WebAuthn credential and applies the new password.
    Body: { new_password, challenge_token, credential }
    """
    from webauthn import verify_authentication_response
    from webauthn.helpers import base64url_to_bytes
    from webauthn.helpers.structs import (
        AuthenticationCredential,
        AuthenticatorAssertionResponse,
    )

    data = request.get_json()
    if not data:
        return jsonify({'error': 'Données manquantes'}), 400

    new_password = data.get('new_password')
    challenge_token = data.get('challenge_token')
    credential_data = data.get('credential')

    if not new_password or not challenge_token or not credential_data:
        return jsonify({'error': 'new_password, challenge_token et credential requis'}), 400

    current_user_id = int(get_jwt_identity())

    try:
        token_user_id, challenge_bytes = _decode_challenge_token(challenge_token)
    except Exception:
        return jsonify({'error': 'challenge_token invalide ou expiré'}), 401

    if token_user_id != current_user_id:
        return jsonify({'error': 'Token invalide'}), 401

    user = User.query.get(current_user_id)
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404

    try:
        raw_id_bytes = base64url_to_bytes(credential_data.get('rawId', credential_data.get('id', '')))
    except Exception:
        return jsonify({'error': 'credential_id invalide'}), 400

    passkey = Passkey.query.filter_by(user_id=current_user_id, credential_id=raw_id_bytes).first()
    if not passkey:
        return jsonify({'error': 'Passkey inconnue'}), 404

    rp_id, _, origin = _get_webauthn_config()

    try:
        resp = credential_data.get('response', {})
        user_handle = base64url_to_bytes(resp['userHandle']) if resp.get('userHandle') else None
        credential = AuthenticationCredential(
            id=credential_data['id'],
            raw_id=raw_id_bytes,
            response=AuthenticatorAssertionResponse(
                client_data_json=base64url_to_bytes(resp['clientDataJSON']),
                authenticator_data=base64url_to_bytes(resp['authenticatorData']),
                signature=base64url_to_bytes(resp['signature']),
                user_handle=user_handle,
            ),
        )
        verification = verify_authentication_response(
            credential=credential,
            expected_challenge=challenge_bytes,
            expected_rp_id=rp_id,
            expected_origin=origin,
            credential_public_key=passkey.public_key,
            credential_current_sign_count=passkey.sign_count,
            require_user_verification=True,
        )
    except Exception as e:
        AuditLog.log(
            action=AuditLog.ACTION_PASSWORD_CHANGE,
            user_id=user.id,
            details={'success': False, 'reason': 'passkey_verification_failed', 'error': str(e)},
            ip_address=get_client_ip(),
        )
        db.session.commit()
        return jsonify({'error': 'Vérification de la passkey échouée'}), 401

    if not User.validate_password_strength(new_password):
        return jsonify({
            'error': 'Mot de passe trop faible',
            'message': 'Le mot de passe doit contenir au moins 12 caractères, '
                       'une majuscule, une minuscule, un chiffre et un caractère spécial.',
        }), 400

    passkey.sign_count = verification.new_sign_count
    passkey.last_used_at = db.func.now()
    user.set_password(new_password)

    AuditLog.log(
        action=AuditLog.ACTION_PASSWORD_CHANGE,
        user_id=user.id,
        details={'success': True, 'method': 'passkey'},
        ip_address=get_client_ip(),
    )
    db.session.commit()

    return jsonify({'message': 'Mot de passe modifié avec succès'}), 200


@auth_bp.route('/passkey/reset-password/begin', methods=['POST'])
@limiter.limit("5 per minute")
def passkey_reset_password_begin():
    """
    Step 1 of passkey-based password reset.

    Validates the reset token and generates a WebAuthn authentication challenge
    targeting the user's registered passkeys.
    Body: { reset_token }
    """
    from webauthn import generate_authentication_options, options_to_json
    from webauthn.helpers.structs import (
        UserVerificationRequirement,
        PublicKeyCredentialDescriptor,
        AuthenticatorTransport,
    )

    data = request.get_json()
    if not data:
        return jsonify({'error': 'Données manquantes'}), 400

    reset_token = data.get('reset_token')
    if not reset_token:
        return jsonify({'error': 'reset_token requis'}), 400

    link = ActivationLink.query.filter_by(token=reset_token, link_type='password_reset').first()
    if not link:
        return jsonify({'error': 'Lien de réinitialisation invalide'}), 404
    if not link.is_valid():
        return jsonify({'error': 'Lien de réinitialisation expiré ou déjà utilisé'}), 400

    user = User.query.filter_by(email=link.email).first()
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404
    if not user.is_active:
        return jsonify({'error': 'Ce compte est désactivé'}), 403

    passkeys = list(user.passkeys)
    if not passkeys:
        return jsonify({'error': 'Aucune passkey enregistrée pour ce compte'}), 400

    rp_id, _, _ = _get_webauthn_config()

    allow_credentials = [
        PublicKeyCredentialDescriptor(
            id=p.credential_id,
            transports=[AuthenticatorTransport(t) for t in (p.transports or [])
                        if t in {e.value for e in AuthenticatorTransport}],
        )
        for p in passkeys
    ]

    options = generate_authentication_options(
        rp_id=rp_id,
        allow_credentials=allow_credentials,
        user_verification=UserVerificationRequirement.REQUIRED,
    )

    challenge_token = _make_challenge_token(user.id, options.challenge)
    options_dict = json.loads(options_to_json(options))

    return jsonify({
        'options': options_dict,
        'challenge_token': challenge_token,
    }), 200


@auth_bp.route('/passkey/reset-password/complete', methods=['POST'])
@limiter.limit("5 per minute")
def passkey_reset_password_complete():
    """
    Step 2 of passkey-based password reset.

    Verifies the WebAuthn assertion, applies the new password, and consumes the reset link.
    Body: { new_password, challenge_token, credential, reset_token }
    """
    from webauthn import verify_authentication_response
    from webauthn.helpers import base64url_to_bytes
    from webauthn.helpers.structs import (
        AuthenticationCredential,
        AuthenticatorAssertionResponse,
    )

    data = request.get_json()
    if not data:
        return jsonify({'error': 'Données manquantes'}), 400

    new_password = data.get('new_password')
    challenge_token = data.get('challenge_token')
    credential_data = data.get('credential')
    reset_token = data.get('reset_token')

    if not new_password or not challenge_token or not credential_data or not reset_token:
        return jsonify({'error': 'new_password, challenge_token, credential et reset_token requis'}), 400

    try:
        token_user_id, challenge_bytes = _decode_challenge_token(challenge_token)
    except Exception:
        return jsonify({'error': 'challenge_token invalide ou expiré'}), 401

    link = ActivationLink.query.filter_by(token=reset_token, link_type='password_reset').first()
    if not link:
        return jsonify({'error': 'Lien de réinitialisation invalide'}), 404
    if not link.is_valid():
        return jsonify({'error': 'Lien de réinitialisation expiré ou déjà utilisé'}), 400

    user = User.query.get(token_user_id)
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404
    if not user.is_active:
        return jsonify({'error': 'Ce compte est désactivé'}), 403

    if link.email != user.email:
        return jsonify({'error': 'Incohérence entre les tokens'}), 401

    try:
        raw_id_bytes = base64url_to_bytes(credential_data.get('rawId', credential_data.get('id', '')))
    except Exception:
        return jsonify({'error': 'credential_id invalide'}), 400

    passkey = Passkey.query.filter_by(user_id=user.id, credential_id=raw_id_bytes).first()
    if not passkey:
        return jsonify({'error': 'Passkey inconnue'}), 404

    rp_id, _, origin = _get_webauthn_config()

    try:
        resp = credential_data.get('response', {})
        user_handle = base64url_to_bytes(resp['userHandle']) if resp.get('userHandle') else None
        credential = AuthenticationCredential(
            id=credential_data['id'],
            raw_id=raw_id_bytes,
            response=AuthenticatorAssertionResponse(
                client_data_json=base64url_to_bytes(resp['clientDataJSON']),
                authenticator_data=base64url_to_bytes(resp['authenticatorData']),
                signature=base64url_to_bytes(resp['signature']),
                user_handle=user_handle,
            ),
        )
        verification = verify_authentication_response(
            credential=credential,
            expected_challenge=challenge_bytes,
            expected_rp_id=rp_id,
            expected_origin=origin,
            credential_public_key=passkey.public_key,
            credential_current_sign_count=passkey.sign_count,
            require_user_verification=True,
        )
    except Exception as e:
        AuditLog.log(
            action=AuditLog.ACTION_PASSWORD_RESET,
            user_id=user.id,
            details={'success': False, 'reason': 'passkey_verification_failed', 'error': str(e)},
            ip_address=get_client_ip(),
        )
        db.session.commit()
        return jsonify({'error': 'Vérification de la passkey échouée'}), 401

    if not User.validate_password_strength(new_password):
        return jsonify({
            'error': 'Mot de passe trop faible',
            'message': 'Le mot de passe doit contenir au moins 12 caractères, '
                       'une majuscule, une minuscule, un chiffre et un caractère spécial.',
        }), 400

    passkey.sign_count = verification.new_sign_count
    passkey.last_used_at = db.func.now()
    user.set_password(new_password)
    link.mark_as_used()

    AuditLog.log(
        action=AuditLog.ACTION_PASSWORD_RESET,
        user_id=user.id,
        details={'success': True, 'method': 'passkey'},
        ip_address=get_client_ip(),
    )
    db.session.commit()

    return jsonify({'message': 'Mot de passe réinitialisé avec succès'}), 200


# ============================================================
# Session transfer (PWA cross-device install flow)
# ============================================================

@auth_bp.route('/session-transfer/generate', methods=['POST'])
@limiter.limit("10 per minute")
@jwt_required()
def session_transfer_generate():
    """
    Generate a short-lived session transfer token (5 min) for the authenticated user.
    Used to transfer the session to another device via QR code during PWA onboarding.
    The receiving device exchanges this token for a full JWT pair.

    Returns: { transfer_token, expires_in }
    """
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user or not user.is_active:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404

    transfer_token = create_access_token(
        identity=str(user_id),
        additional_claims={'session_transfer': True},
        expires_delta=timedelta(minutes=5),
    )
    return jsonify({'transfer_token': transfer_token, 'expires_in': 300}), 200


@auth_bp.route('/session-transfer/validate', methods=['POST'])
@limiter.limit("10 per minute")
def session_transfer_validate():
    """
    Validate a session transfer token and issue a full JWT pair.
    Called on the receiving device (e.g. phone) after scanning a QR code.

    Body: { transfer_token }
    Returns: { access_token, refresh_token, user }
    """
    data = request.get_json(silent=True)
    if not data or not data.get('transfer_token'):
        return jsonify({'error': 'transfer_token requis'}), 400

    try:
        decoded = decode_token(data['transfer_token'])
    except Exception:
        return jsonify({'error': 'Token invalide ou expiré'}), 401

    if not decoded.get('session_transfer'):
        return jsonify({'error': 'Token invalide'}), 401

    jti = decoded.get('jti')
    if jti and is_token_blacklisted(jti):
        return jsonify({'error': 'Ce lien a déjà été utilisé'}), 401

    user_id = int(decoded['sub'])
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404
    if not user.is_active:
        return jsonify({'error': 'Ce compte est désactivé'}), 403

    # Mark transfer token as used (single-use, TTL 5 min)
    if jti:
        blacklist_token(jti, 300)

    AuditLog.log(
        action=AuditLog.ACTION_LOGIN,
        user_id=user.id,
        details={'method': 'session_transfer'},
        ip_address=get_client_ip(),
    )
    db.session.commit()

    access_token = create_access_token(identity=str(user.id))
    refresh_token = create_refresh_token(identity=str(user.id))

    return jsonify({
        'access_token': access_token,
        'refresh_token': refresh_token,
        'user': user.to_dict(),
    }), 200
