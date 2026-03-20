"""
Authentication routes for MARIAM with MFA support.

Endpoints:
- POST /v1/auth/login                    Login (step 1)
- POST /v1/auth/mfa/verify               MFA verification (step 2)
- POST /v1/auth/activate                 Account activation via invitation link
- POST /v1/auth/mfa/verify-setup         Confirm MFA setup
- POST /v1/auth/refresh                  Refresh access token
- GET  /v1/auth/me                       Current authenticated user
- GET  /v1/auth/check-activation/<token> Validate an activation link
- GET  /v1/auth/check-reset/<token>      Validate a password reset link
- POST /v1/auth/reset-password           Reset password via reset link
- POST /v1/auth/change-password          Change password
"""
import io
import base64
import pyotp
import qrcode
from flask import request, jsonify, current_app
from flask_smorest import Blueprint
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    jwt_required,
    get_jwt_identity
)
from ..extensions import db
from ..models import User, ActivationLink, AuditLog
from ..security import limiter, get_client_ip
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
            expires_delta=False
        )
        return jsonify({
            'mfa_required': True,
            'mfa_token': mfa_token,
            'message': 'Veuillez entrer votre code MFA'
        }), 200

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
            'user_id': user.id
        }
    }), 201


@auth_bp.route('/mfa/verify-setup', methods=['POST'])
@auth_bp.response(200, LoginResponseSchema)
@auth_bp.alt_response(401, schema=ErrorSchema, description="Invalid TOTP code")
def verify_mfa_setup():
    """
    Confirm MFA setup by verifying a TOTP code.

    On success, MFA is enabled and full JWT tokens are returned.
    """
    data = request.get_json()

    if not data:
        return jsonify({'error': 'Données manquantes'}), 400

    user_id = data.get('user_id')
    code = data.get('code')

    if not user_id or not code:
        return jsonify({'error': 'ID utilisateur et code requis'}), 400

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


@auth_bp.route('/refresh', methods=['POST'])
@jwt_required(refresh=True)
@auth_bp.response(200, LoginResponseSchema)
def refresh():
    """Renew access_token using a valid refresh_token."""
    current_user_id = get_jwt_identity()
    new_access_token = create_access_token(identity=current_user_id)

    return jsonify({'access_token': new_access_token}), 200


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

    return jsonify({
        'valid': True,
        'link_type': link.link_type,
        'email': link.email
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
        return jsonify({'error': 'MFA non configuré pour cet utilisateur'}), 400

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
