"""
Routes d'administration MARIAM.

Endpoints protégés (admin only) :
- GET /api/admin/users - Liste des utilisateurs
- POST /api/admin/users - Créer un utilisateur
- PUT /api/admin/users/:id - Modifier un utilisateur
- DELETE /api/admin/users/:id - Supprimer un utilisateur
- POST /api/admin/invite - Générer un lien d'invitation
- GET /api/admin/audit-logs - Journal des actions
- GET /api/admin/restaurants - Liste des restaurants
- POST /api/admin/restaurants - Créer un restaurant
"""
from functools import wraps
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..extensions import db
from ..models import User, Restaurant, ActivationLink, AuditLog


admin_bp = Blueprint('admin', __name__)


def admin_required(f):
    """Décorateur pour protéger les routes admin."""
    @wraps(f)
    @jwt_required()
    def decorated_function(*args, **kwargs):
        current_user_id = int(get_jwt_identity())
        user = User.query.get(current_user_id)
        
        if not user or not user.is_admin():
            return jsonify({'error': 'Accès réservé aux administrateurs'}), 403
        
        return f(*args, **kwargs)
    return decorated_function


def get_client_ip():
    """Récupère l'adresse IP du client."""
    if request.headers.get('X-Forwarded-For'):
        return request.headers.get('X-Forwarded-For').split(',')[0].strip()
    return request.remote_addr


# ========================================
# GESTION DES UTILISATEURS
# ========================================

@admin_bp.route('/users', methods=['GET'])
@admin_required
def list_users():
    """Liste tous les utilisateurs."""
    users = User.query.order_by(User.created_at.desc()).all()
    return jsonify({
        'users': [user.to_dict(include_sensitive=True) for user in users]
    }), 200


@admin_bp.route('/users/<int:user_id>', methods=['GET'])
@admin_required
def get_user(user_id):
    """Récupère un utilisateur par ID."""
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404
    
    return jsonify({'user': user.to_dict(include_sensitive=True)}), 200


@admin_bp.route('/users/<int:user_id>', methods=['PUT'])
@admin_required
def update_user(user_id):
    """Modifie un utilisateur."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404
    
    # Empêcher la modification du compte de secours
    if user.is_rescue_account:
        return jsonify({'error': 'Le compte de secours ne peut pas être modifié'}), 403
    
    data = request.get_json()
    
    # Mettre à jour les champs autorisés
    if 'username' in data:
        user.username = data['username']
    
    if 'role' in data and data['role'] in User.VALID_ROLES:
        # Empêcher de se retirer ses propres droits admin
        if user.id == current_user_id and data['role'] != 'admin':
            return jsonify({'error': 'Vous ne pouvez pas retirer vos propres droits admin'}), 400
        user.role = data['role']
    
    if 'is_active' in data:
        # Empêcher de se désactiver soi-même
        if user.id == current_user_id and not data['is_active']:
            return jsonify({'error': 'Vous ne pouvez pas désactiver votre propre compte'}), 400
        user.is_active = data['is_active']
    
    if 'restaurant_id' in data:
        user.restaurant_id = data['restaurant_id']
    
    # Logger
    AuditLog.log(
        action=AuditLog.ACTION_USER_UPDATE,
        user_id=current_user_id,
        target_type='user',
        target_id=user.id,
        details={'changes': data},
        ip_address=get_client_ip()
    )
    
    db.session.commit()
    
    return jsonify({
        'message': 'Utilisateur mis à jour',
        'user': user.to_dict(include_sensitive=True)
    }), 200


@admin_bp.route('/users/<int:user_id>', methods=['DELETE'])
@admin_required
def delete_user(user_id):
    """Supprime un utilisateur."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404
    
    # Empêcher la suppression de son propre compte
    if user.id == current_user_id:
        return jsonify({'error': 'Vous ne pouvez pas supprimer votre propre compte'}), 400
    
    # Empêcher la suppression du compte de secours
    if user.is_rescue_account:
        return jsonify({'error': 'Le compte de secours ne peut pas être supprimé'}), 403
    
    # Logger avant suppression
    AuditLog.log(
        action=AuditLog.ACTION_USER_DELETE,
        user_id=current_user_id,
        target_type='user',
        target_id=user.id,
        details={'email': user.email},
        ip_address=get_client_ip()
    )
    
    db.session.delete(user)
    db.session.commit()
    
    return jsonify({'message': 'Utilisateur supprimé'}), 200


@admin_bp.route('/users/<int:user_id>/reset-mfa', methods=['POST'])
@admin_required
def reset_user_mfa(user_id):
    """Réinitialise le MFA d'un utilisateur (génère un nouveau lien d'activation)."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404
    
    # Désactiver le MFA actuel
    user.disable_mfa()
    user.is_active = False  # Désactiver jusqu'à nouvelle configuration MFA
    
    # Créer un nouveau lien d'activation
    link = ActivationLink.create_invite_link(
        email=user.email,
        role=user.role,
        created_by_id=current_user_id,
        expires_hours=72
    )
    db.session.add(link)
    
    # Logger
    AuditLog.log(
        action=AuditLog.ACTION_USER_UPDATE,
        user_id=current_user_id,
        target_type='user',
        target_id=user.id,
        details={'action': 'reset_mfa'},
        ip_address=get_client_ip()
    )
    
    db.session.commit()
    
    return jsonify({
        'message': 'MFA réinitialisé',
        'activation_link': {
            'token': link.token,
            'expires_at': link.expires_at.isoformat()
        }
    }), 200


# ========================================
# INVITATIONS
# ========================================

@admin_bp.route('/invite', methods=['POST'])
@admin_required
def create_invitation():
    """Crée un lien d'invitation pour un nouvel utilisateur."""
    current_user_id = int(get_jwt_identity())
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'Données manquantes'}), 400
    
    email = data.get('email')
    role = data.get('role', 'editor')
    
    if not email:
        return jsonify({'error': 'Email requis'}), 400
    
    if role not in User.VALID_ROLES:
        return jsonify({'error': f'Rôle invalide. Valeurs possibles: {User.VALID_ROLES}'}), 400
    
    # Vérifier que l'email n'existe pas déjà
    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'Cet email est déjà utilisé'}), 409
    
    # Créer le lien d'invitation
    link = ActivationLink.create_invite_link(
        email=email,
        role=role,
        created_by_id=current_user_id
    )
    db.session.add(link)
    
    # Logger
    AuditLog.log(
        action=AuditLog.ACTION_ACTIVATION_LINK_CREATE,
        user_id=current_user_id,
        details={'email': email, 'role': role},
        ip_address=get_client_ip()
    )
    
    db.session.commit()
    
    return jsonify({
        'message': 'Invitation créée',
        'invitation': {
            'token': link.token,
            'email': email,
            'role': role,
            'expires_at': link.expires_at.isoformat()
        }
    }), 201


@admin_bp.route('/invitations', methods=['GET'])
@admin_required
def list_invitations():
    """Liste les invitations en cours."""
    links = ActivationLink.query.filter_by(link_type='invite').order_by(
        ActivationLink.created_at.desc()
    ).limit(50).all()
    
    return jsonify({
        'invitations': [link.to_dict(include_token=True) for link in links]
    }), 200


# ========================================
# JOURNAL D'AUDIT
# ========================================

@admin_bp.route('/audit-logs', methods=['GET'])
@admin_required
def list_audit_logs():
    """Liste les entrées du journal d'audit."""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 50, type=int)
    action = request.args.get('action')
    
    query = AuditLog.query.order_by(AuditLog.created_at.desc())
    
    if action:
        query = query.filter_by(action=action)
    
    pagination = query.paginate(page=page, per_page=min(per_page, 100))
    
    return jsonify({
        'logs': [log.to_dict() for log in pagination.items],
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page
    }), 200


# ========================================
# GESTION DES RESTAURANTS
# ========================================

@admin_bp.route('/restaurants', methods=['GET'])
@admin_required
def list_restaurants():
    """Liste tous les restaurants."""
    restaurants = Restaurant.query.order_by(Restaurant.name).all()
    return jsonify({
        'restaurants': [r.to_dict() for r in restaurants]
    }), 200


@admin_bp.route('/restaurants', methods=['POST'])
@admin_required
def create_restaurant():
    """Crée un nouveau restaurant."""
    current_user_id = int(get_jwt_identity())
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'Données manquantes'}), 400
    
    name = data.get('name')
    code = data.get('code')
    
    if not name or not code:
        return jsonify({'error': 'Nom et code requis'}), 400
    
    # Vérifier l'unicité du code
    if Restaurant.query.filter_by(code=code).first():
        return jsonify({'error': 'Ce code est déjà utilisé'}), 409
    
    restaurant = Restaurant(
        name=name,
        code=code,
        address=data.get('address'),
        logo_url=data.get('logo_url')
    )
    db.session.add(restaurant)
    db.session.commit()
    
    return jsonify({
        'message': 'Restaurant créé',
        'restaurant': restaurant.to_dict()
    }), 201


@admin_bp.route('/restaurants/<int:restaurant_id>', methods=['PUT'])
@admin_required
def update_restaurant(restaurant_id):
    """Modifie un restaurant."""
    restaurant = Restaurant.query.get(restaurant_id)
    
    if not restaurant:
        return jsonify({'error': 'Restaurant non trouvé'}), 404
    
    data = request.get_json()
    
    if 'name' in data:
        restaurant.name = data['name']
    if 'address' in data:
        restaurant.address = data['address']
    if 'logo_url' in data:
        restaurant.logo_url = data['logo_url']
    if 'is_active' in data:
        restaurant.is_active = data['is_active']
    
    db.session.commit()
    
    return jsonify({
        'message': 'Restaurant mis à jour',
        'restaurant': restaurant.to_dict()
    }), 200


# ========================================
# PARAMÈTRES DU RESTAURANT
# ========================================

@admin_bp.route('/settings', methods=['GET'])
@jwt_required()
def get_settings():
    """
    Récupère les paramètres du restaurant par défaut.
    Accessible à tout utilisateur authentifié (staff).
    """
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)
    
    if not user:
        return jsonify({'error': 'Utilisateur introuvable'}), 401
        
    restaurant = Restaurant.query.filter_by(is_active=True).first()
    
    if not restaurant:
        return jsonify({'error': 'Aucun restaurant configuré'}), 404
    
    return jsonify({
        'restaurant': restaurant.to_dict(include_config=True)
    }), 200


@admin_bp.route('/settings', methods=['PUT'])
@admin_required
def update_settings():
    """Met à jour les paramètres du restaurant."""
    current_user_id = int(get_jwt_identity())
    restaurant = Restaurant.query.filter_by(is_active=True).first()
    
    if not restaurant:
        return jsonify({'error': 'Aucun restaurant configuré'}), 404
    
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'Données manquantes'}), 400
    
    # Mise à jour des informations de base
    if 'name' in data:
        restaurant.name = data['name']
    if 'address' in data:
        restaurant.address = data['address']
    if 'logo_url' in data:
        restaurant.logo_url = data['logo_url']
    
    # Mise à jour de la configuration
    if 'service_days' in data:
        # Valider les jours (0-6)
        days = data['service_days']
        if isinstance(days, list) and all(isinstance(d, int) and 0 <= d <= 6 for d in days):
            restaurant.service_days = sorted(days)
    
    if 'menu_categories' in data:
        # Valider les catégories
        categories = data['menu_categories']
        if isinstance(categories, list):
            restaurant.menu_categories = categories
    
    if 'dietary_tags' in data:
        tags = data['dietary_tags']
        if isinstance(tags, list):
            restaurant.dietary_tags = tags
    
    if 'certifications' in data:
        certs = data['certifications']
        if isinstance(certs, list):
            restaurant.certifications = certs
    
    # Logger
    AuditLog.log(
        action='settings_update',
        user_id=current_user_id,
        target_type='restaurant',
        target_id=restaurant.id,
        details={'updated_fields': list(data.keys())},
        ip_address=get_client_ip()
    )
    
    db.session.commit()
    
    return jsonify({
        'message': 'Paramètres mis à jour',
        'restaurant': restaurant.to_dict(include_config=True)
    }), 200


# ========================================
# AUDIT LOGS
# ========================================

@admin_bp.route('/audit-logs', methods=['GET'])
@admin_required
def get_audit_logs():
    """
    Récupère les logs d'audit avec pagination et filtres.
    
    Nécessite MFA activé pour l'administrateur.
    
    Query params:
    - page: numéro de page (défaut: 1)
    - per_page: logs par page (défaut: 50, max: 100)
    - action: filtrer par type d'action
    - user_id: filtrer par utilisateur
    - start_date: date de début (ISO format)
    - end_date: date de fin (ISO format)
    """
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)
    
    # Vérifier que l'admin a activé la 2FA
    if not user.mfa_secret:
        return jsonify({
            'error': 'MFA_REQUIRED',
            'message': 'La consultation des logs nécessite l\'activation de l\'authentification à deux facteurs'
        }), 403
    
    # Pagination
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 50, type=int), 100)
    
    # Filtres
    query = AuditLog.query
    
    if action_filter := request.args.get('action'):
        query = query.filter(AuditLog.action == action_filter)
    
    if user_filter := request.args.get('user_id'):
        query = query.filter(AuditLog.user_id == int(user_filter))
    
    if start_date := request.args.get('start_date'):
        from datetime import datetime
        query = query.filter(AuditLog.created_at >= datetime.fromisoformat(start_date))
    
    if end_date := request.args.get('end_date'):
        from datetime import datetime
        query = query.filter(AuditLog.created_at <= datetime.fromisoformat(end_date))
    
    # Tri: plus récent en premier
    query = query.order_by(AuditLog.created_at.desc())
    
    # Exécuter pagination
    paginated = query.paginate(page=page, per_page=per_page, error_out=False)
    
    # Logger l'accès aux logs (méta!)
    AuditLog.log(
        action=AuditLog.ACTION_AUDIT_LOGS_ACCESS,
        user_id=current_user_id,
        ip_address=get_client_ip(),
        user_agent=request.headers.get('User-Agent'),
        details={'page': page, 'filters': {k: v for k, v in request.args.items() if k not in ['page', 'per_page']}}
    )
    db.session.commit()
    
    return jsonify({
        'logs': [log.to_dict() for log in paginated.items],
        'total': paginated.total,
        'page': page,
        'per_page': per_page,
        'pages': paginated.pages
    }), 200


@admin_bp.route('/audit-logs/export', methods=['GET'])
@admin_required
def export_audit_logs():
    """
    Export CSV des logs d'audit (avec mêmes filtres que GET).
    
    Nécessite MFA activé.
    Limite: 10000 logs maximum.
    """
    from datetime import datetime
    import csv
    from io import StringIO
    from flask import make_response
    
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)
    
    # Vérifier MFA
    if not user.mfa_secret:
        return jsonify({
            'error': 'MFA_REQUIRED',
            'message': 'L\'export des logs nécessite l\'activation de l\'authentification à deux facteurs'
        }), 403
    
    # Appliquer les mêmes filtres
    query = AuditLog.query
    
    if action_filter := request.args.get('action'):
        query = query.filter(AuditLog.action == action_filter)
    
    if user_filter := request.args.get('user_id'):
        query = query.filter(AuditLog.user_id == int(user_filter))
    
    if start_date := request.args.get('start_date'):
        query = query.filter(AuditLog.created_at >= datetime.fromisoformat(start_date))
    
    if end_date := request.args.get('end_date'):
        query = query.filter(AuditLog.created_at <= datetime.fromisoformat(end_date))
    
    # Récupérer les logs (limité à 10000)
    logs = query.order_by(AuditLog.created_at.desc()).limit(10000).all()
    
    # Générer CSV
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
            log.details or ''
        ])
    
    # Logger l'export
    AuditLog.log(
        action=AuditLog.ACTION_AUDIT_LOGS_EXPORT,
        user_id=current_user_id,
        ip_address=get_client_ip(),
        user_agent=request.headers.get('User-Agent'),
        details={'count': len(logs), 'filters': {k: v for k, v in request.args.items()}}
    )
    db.session.commit()
    
    response = make_response(output.getvalue())
    response.headers['Content-Type'] = 'text/csv'
    response.headers['Content-Disposition'] = f'attachment; filename=audit_logs_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'
    return response
