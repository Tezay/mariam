"""
Routes d'authentification MARIAM avec support MFA.

Endpoints :
- POST /api/auth/login - Connexion (étape 1)
- POST /api/auth/verify-mfa - Vérification MFA (étape 2)
- POST /api/auth/activate - Activation de compte via lien
- GET /api/auth/mfa/setup - Génère le QR code MFA
- POST /api/auth/mfa/verify-setup - Confirme la configuration MFA
- POST /api/auth/refresh - Rafraîchit le token
- GET /api/auth/me - Utilisateur courant
"""
import io
import base64
import pyotp
import qrcode
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    jwt_required,
    get_jwt_identity
)
from ..extensions import db
from ..models import User, ActivationLink, AuditLog


auth_bp = Blueprint('auth', __name__)


def get_client_ip():
    """Récupère l'adresse IP du client."""
    if request.headers.get('X-Forwarded-For'):
        return request.headers.get('X-Forwarded-For').split(',')[0].strip()
    return request.remote_addr


@auth_bp.route('/login', methods=['POST'])
def login():
    """
    Étape 1 de la connexion : vérification email/mot de passe.
    
    Si MFA est activé, renvoie un token temporaire pour l'étape 2.
    Si MFA n'est pas activé, renvoie directement les tokens d'accès.
    """
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'Données manquantes'}), 400
    
    email = data.get('email')
    password = data.get('password')
    
    if not email or not password:
        return jsonify({'error': 'Email et mot de passe requis'}), 400
    
    # Rechercher l'utilisateur
    user = User.query.filter_by(email=email).first()
    
    # Vérification avec message générique (sécurité)
    if not user or not user.check_password(password):
        # Log de l'échec
        AuditLog.log(
            action=AuditLog.ACTION_LOGIN_FAILED,
            details={'email': email},
            ip_address=get_client_ip()
        )
        db.session.commit()
        return jsonify({'error': 'Email ou mot de passe incorrect'}), 401
    
    # Vérifier si le compte est actif
    if not user.is_active:
        return jsonify({'error': 'Ce compte est désactivé'}), 403
    
    # Si MFA est activé, demander le code
    if user.mfa_enabled:
        # Créer un token temporaire pour l'étape MFA
        mfa_token = create_access_token(
            identity=str(user.id),
            additional_claims={'mfa_pending': True},
            expires_delta=False  # Token court (5 min par défaut)
        )
        return jsonify({
            'mfa_required': True,
            'mfa_token': mfa_token,
            'message': 'Veuillez entrer votre code MFA'
        }), 200
    
    # MFA non activé - connexion directe (ne devrait pas arriver en prod)
    return complete_login(user)


@auth_bp.route('/verify-mfa', methods=['POST'])
def verify_mfa():
    """
    Étape 2 de la connexion : vérification du code MFA.
    """
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'Données manquantes'}), 400
    
    mfa_token = data.get('mfa_token')
    code = data.get('code')
    
    if not mfa_token or not code:
        return jsonify({'error': 'Token MFA et code requis'}), 400
    
    # Décoder le token MFA pour récupérer l'utilisateur
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
    
    # Vérifier le code TOTP
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
    """Termine la connexion et renvoie les tokens."""
    # Mettre à jour last_login
    user.update_last_login()
    
    # Logger la connexion
    AuditLog.log(
        action=AuditLog.ACTION_LOGIN,
        user_id=user.id,
        ip_address=get_client_ip()
    )
    db.session.commit()
    
    # Générer les tokens
    access_token = create_access_token(identity=str(user.id))
    refresh_token = create_refresh_token(identity=str(user.id))
    
    return jsonify({
        'message': 'Connexion réussie',
        'user': user.to_dict(),
        'access_token': access_token,
        'refresh_token': refresh_token
    }), 200


@auth_bp.route('/activate', methods=['POST'])
def activate_account():
    """
    Active un compte via un lien d'activation.
    Utilisé pour le premier admin ou les invitations.
    """
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'Données manquantes'}), 400
    
    token = data.get('token')
    password = data.get('password')
    username = data.get('username')
    
    if not token or not password:
        return jsonify({'error': 'Token et mot de passe requis'}), 400
    
    # Trouver le lien d'activation
    link = ActivationLink.query.filter_by(token=token).first()
    
    if not link:
        return jsonify({'error': 'Lien d\'activation invalide'}), 404
    
    if not link.is_valid():
        return jsonify({'error': 'Lien d\'activation expiré ou déjà utilisé'}), 400
    
    # Valider la force du mot de passe
    if not User.validate_password_strength(password):
        return jsonify({
            'error': 'Mot de passe trop faible',
            'message': 'Le mot de passe doit contenir au moins 12 caractères, '
                      'une majuscule, une minuscule, un chiffre et un caractère spécial.'
        }), 400
    
    # Créer l'utilisateur
    email = data.get('email') or link.email
    if not email:
        return jsonify({'error': 'Email requis'}), 400
    
    # Vérifier que l'email n'existe pas déjà
    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'Cet email est déjà utilisé'}), 409
    
    user = User(
        email=email,
        username=username,
        role=link.role
    )
    user.set_password(password)
    
    # Générer le secret MFA
    mfa_secret = pyotp.random_base32()
    user.mfa_secret = mfa_secret
    user.mfa_enabled = False  # Sera activé après configuration
    
    # Marquer le lien comme utilisé
    link.mark_as_used()
    
    db.session.add(user)
    
    # Logger l'activation
    AuditLog.log(
        action=AuditLog.ACTION_ACCOUNT_ACTIVATE,
        user_id=None,  # User pas encore créé
        target_type='user',
        details={'email': email, 'role': link.role, 'link_type': link.link_type},
        ip_address=get_client_ip()
    )
    
    db.session.commit()
    
    # Générer le QR code pour MFA
    issuer = current_app.config.get('MFA_ISSUER_NAME', 'MARIAM')
    totp = pyotp.TOTP(mfa_secret)
    provisioning_uri = totp.provisioning_uri(name=email, issuer_name=issuer)
    
    # Créer l'image QR code en base64
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
            'secret': mfa_secret,  # Pour saisie manuelle
            'user_id': user.id
        }
    }), 201


@auth_bp.route('/mfa/verify-setup', methods=['POST'])
def verify_mfa_setup():
    """
    Confirme la configuration MFA en vérifiant un code.
    Finalise l'activation du compte.
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
    
    # Vérifier le code TOTP
    totp = pyotp.TOTP(user.mfa_secret)
    if not totp.verify(code, valid_window=1):
        return jsonify({'error': 'Code invalide'}), 401
    
    # Activer le MFA
    user.mfa_enabled = True
    
    # Logger
    AuditLog.log(
        action=AuditLog.ACTION_MFA_SETUP,
        user_id=user.id,
        ip_address=get_client_ip()
    )
    
    db.session.commit()
    
    # Générer les tokens de connexion
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
def refresh():
    """Renouvelle l'access_token avec le refresh_token."""
    current_user_id = get_jwt_identity()
    new_access_token = create_access_token(identity=current_user_id)
    
    return jsonify({
        'access_token': new_access_token
    }), 200


@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def get_current_user():
    """Récupère les informations de l'utilisateur connecté."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)
    
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404
    
    return jsonify({'user': user.to_dict()}), 200


@auth_bp.route('/check-activation/<token>', methods=['GET'])
def check_activation_link(token):
    """Vérifie si un lien d'activation est valide."""
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
