"""
MARIAM - Application Factory

Crée et configure l'application Flask pour la plateforme de gestion
des menus universitaires.
"""
import os
from datetime import timedelta
from flask import Flask, jsonify
from flask_cors import CORS

from .extensions import db, jwt, migrate
from .models import User, Restaurant, Menu, MenuItem, Event, EventImage, GalleryImage, GalleryImageTag, MenuItemImage, ActivationLink, AuditLog, ImportSession, PushSubscription
from .services.storage import storage
from .security import limiter, is_token_blacklisted


def create_app(config_class=None):
    """
    Factory function qui crée et configure l'application Flask.
    """
    app = Flask(__name__)
    
    # ========================================
    # CONFIGURATION
    # ========================================
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')
    app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get(
        'DATABASE_URL', 
        'postgresql://mariam:mariam_secret@localhost:5432/mariam_db'
    )
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    
    # Configuration du pool de connexions
    app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
        'pool_size': int(os.environ.get('DB_POOL_SIZE', 2)),
        'max_overflow': int(os.environ.get('DB_MAX_OVERFLOW', 2)),
        'pool_pre_ping': True,
        'pool_recycle': int(os.environ.get('DB_POOL_RECYCLE', 1800)),
    }
    
    # Configuration JWT - Sessions courtes pour sécurité (postes partagés)
    app.config['JWT_SECRET_KEY'] = os.environ.get('JWT_SECRET_KEY', 'jwt-secret-key-change-in-production')
    app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(
        minutes=int(os.environ.get('JWT_ACCESS_TOKEN_MINUTES', 30))
    )
    app.config['JWT_REFRESH_TOKEN_EXPIRES'] = timedelta(days=7)
    
    # Configuration MFA
    app.config['MFA_ISSUER_NAME'] = os.environ.get('MFA_ISSUER_NAME', 'MARIAM')

    # Configuration WebAuthn / Passkeys
    app.config['WEBAUTHN_RP_ID'] = os.environ.get('WEBAUTHN_RP_ID', 'localhost')
    app.config['WEBAUTHN_RP_NAME'] = os.environ.get('WEBAUTHN_RP_NAME', 'MARIAM')
    app.config['WEBAUTHN_ORIGIN'] = os.environ.get('WEBAUTHN_ORIGIN', 'http://localhost:5173')
    
    # ========================================
    # CONFIGURATION S3 (MinIO en dev, Scaleway en prod)
    # ========================================
    app.config['S3_ENDPOINT_URL'] = os.environ.get('S3_ENDPOINT_URL')
    app.config['S3_ACCESS_KEY_ID'] = os.environ.get('S3_ACCESS_KEY_ID')
    app.config['S3_SECRET_ACCESS_KEY'] = os.environ.get('S3_SECRET_ACCESS_KEY')
    app.config['S3_BUCKET_NAME'] = os.environ.get('S3_BUCKET_NAME', 'mariam-uploads')
    app.config['S3_REGION'] = os.environ.get('S3_REGION', 'fr-par')
    app.config['S3_PUBLIC_URL'] = os.environ.get('S3_PUBLIC_URL', '')
    
    # Taille maximale des uploads (32 MB pour gérer plusieurs images)
    app.config['MAX_CONTENT_LENGTH'] = 32 * 1024 * 1024
    
    # ========================================
    # CONFIGURATION API DOCUMENTATION (OpenAPI/Swagger)
    # ========================================
    app.config['API_TITLE'] = 'MARIAM API'
    app.config['API_VERSION'] = 'v1'
    app.config['OPENAPI_VERSION'] = '3.0.3'
    app.config['OPENAPI_URL_PREFIX'] = '/'
    app.config['OPENAPI_SWAGGER_UI_PATH'] = '/docs'
    app.config['OPENAPI_SWAGGER_UI_URL'] = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist/'
    
    # ========================================
    # INITIALISATION DES EXTENSIONS
    # ========================================
    db.init_app(app)
    jwt.init_app(app)
    migrate.init_app(app, db)
    storage.init_app(app)
    limiter.init_app(app)
    
    # ========================================
    # JWT ERROR HANDLERS
    # ========================================
    @jwt.invalid_token_loader
    def invalid_token_callback(error_string):
        """Token invalide (malformé, signature incorrecte)."""
        return jsonify({
            'error': 'Token invalide',
            'message': error_string
        }), 401
    
    @jwt.unauthorized_loader
    def missing_token_callback(error_string):
        """Token absent."""
        return jsonify({
            'error': 'Token manquant',
            'message': error_string
        }), 401
    
    @jwt.expired_token_loader
    def expired_token_callback(jwt_header, jwt_payload):
        """Token expiré."""
        return jsonify({
            'error': 'Token expiré',
            'message': 'Votre session a expiré, veuillez vous reconnecter'
        }), 401

    @jwt.token_in_blocklist_loader
    def check_if_token_revoked(jwt_header, jwt_payload):
        """
        Bloque deux catégories de tokens :
        1. Tokens intermédiaires / à usage limité — identifiés par une claim
           spécifique (mfa_pending, webauthn_pending, setup_phase,
           session_transfer). Ne doivent jamais être acceptés sur les
           endpoints @jwt_required() ordinaires.
        2. Tokens révoqués explicitement (logout, usage unique) — vérifiés
           en Redis via leur JTI.
        """
        if (
            jwt_payload.get('mfa_pending')
            or jwt_payload.get('webauthn_pending')
            or jwt_payload.get('session_transfer')
            or jwt_payload.get('setup_phase')
        ):
            return True
        jti = jwt_payload.get('jti')
        if not jti:
            return False
        return is_token_blacklisted(jti)

    @jwt.revoked_token_loader
    def revoked_token_callback(jwt_header, jwt_payload):
        """Réponse adaptée selon la raison du rejet."""
        if jwt_payload.get('mfa_pending'):
            return jsonify({
                'error': 'Authentification incomplète',
                'message': 'Veuillez compléter la vérification MFA'
            }), 401
        if jwt_payload.get('webauthn_pending') or jwt_payload.get('setup_phase'):
            return jsonify({
                'error': 'Token à usage limité',
                'message': 'Ce token ne peut pas être utilisé sur cet endpoint'
            }), 401
        if jwt_payload.get('session_transfer'):
            return jsonify({
                'error': 'Token de transfert invalide',
                'message': 'Ce token ne peut pas être utilisé comme token d\'accès'
            }), 401
        return jsonify({
            'error': 'Token révoqué',
            'message': 'Votre session a été invalidée, veuillez vous reconnecter'
        }), 401
    
    # ========================================
    # RATE LIMITER ERROR HANDLER
    # ========================================
    @app.errorhandler(429)
    def ratelimit_handler(e):
        """Réponse personnalisée quand la limite est atteinte."""
        return jsonify({
            'error': 'Trop de requêtes',
            'message': 'Vous avez dépassé la limite autorisée. Réessayez plus tard.',
            'retry_after': e.description
        }), 429
    
    # ========================================
    # CONFIGURATION CORS
    # ========================================
    frontend_urls = os.environ.get('FRONTEND_URL', 'http://localhost:5173')
    origins = [url.strip() for url in frontend_urls.split(',') if url.strip()]
    
    CORS(
        app,
        origins=origins,
        supports_credentials=True,
        allow_headers=['Content-Type', 'Authorization'],
        methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
    )
    
    # ========================================
    # API v1 — Flask-Smorest (OpenAPI / Swagger)
    # ========================================
    from flask_smorest import Api
    api = Api(app)

    from .routes.menus import menus_bp
    from .routes.events import events_bp
    from .routes.gallery import gallery_bp
    from .routes.restaurant import restaurant_bp
    from .routes.taxonomy import taxonomy_bp
    from .routes.auth import auth_bp
    from .routes.users import users_bp
    from .routes.audit import audit_bp
    from .routes.imports import imports_bp
    from .routes.notifications import notifications_bp
    from .routes.categories import categories_bp

    api.register_blueprint(menus_bp,         url_prefix='/v1/menus')
    api.register_blueprint(categories_bp,    url_prefix='/v1')
    api.register_blueprint(auth_bp,          url_prefix='/v1/auth')
    api.register_blueprint(events_bp,        url_prefix='/v1/events')
    api.register_blueprint(gallery_bp,       url_prefix='/v1/gallery')
    api.register_blueprint(restaurant_bp,    url_prefix='/v1')
    api.register_blueprint(taxonomy_bp,      url_prefix='/v1/taxonomy')
    api.register_blueprint(users_bp,         url_prefix='/v1/users')
    api.register_blueprint(audit_bp,         url_prefix='/v1/audit-logs')
    api.register_blueprint(imports_bp,       url_prefix='/v1/imports/menus')
    api.register_blueprint(notifications_bp, url_prefix='/v1/notifications')

    # Route de santé (non versionnée, non documentée)
    @app.route('/health')
    @limiter.exempt
    def health_check():
        return {
            'status': 'healthy',
            'message': 'MARIAM API is running',
            'version': '0.10.2',
            'docs': '/docs'
        }

    # ========================================
    # ROBOTS.TXT — Contrôle d'accès crawlers & IA
    # ========================================
    @app.route('/robots.txt')
    @limiter.exempt
    def robots_txt():
        """Autorise le crawling des routes publiques (/v1/) et bloque les routes sensibles."""
        content = """User-agent: *
Allow: /v1/menus/
Allow: /v1/events
Allow: /v1/restaurant
Allow: /v1/taxonomy
Disallow: /v1/auth/
Disallow: /v1/users/
Disallow: /v1/audit-logs/
Disallow: /v1/imports/
Disallow: /v1/gallery/

User-agent: GPTBot
Allow: /v1/menus/
Allow: /v1/events
Allow: /v1/restaurant
Allow: /v1/taxonomy
Disallow: /v1/auth/
Disallow: /v1/users/
Disallow: /v1/audit-logs/

User-agent: OAI-SearchBot
Allow: /v1/menus/
Allow: /v1/events
Disallow: /v1/auth/
Disallow: /v1/users/

User-agent: ChatGPT-User
Allow: /v1/menus/
Allow: /v1/events
Disallow: /v1/auth/
Disallow: /v1/users/

User-agent: CCBot
Disallow: /

User-agent: anthropic-ai
Allow: /v1/menus/
Allow: /v1/events
Allow: /v1/restaurant
Allow: /v1/taxonomy
Disallow: /v1/auth/
Disallow: /v1/users/

User-agent: Google-Extended
Allow: /v1/menus/
Allow: /v1/events
Allow: /v1/restaurant
Disallow: /v1/auth/
Disallow: /v1/users/
"""
        return app.response_class(content, mimetype='text/plain', status=200)
    
    # ========================================
    # COMMANDES CLI
    # ========================================
    @app.cli.command('create-activation-link')
    def create_activation_link():
        """Crée un lien d'activation pour le premier administrateur."""
        import click
        
        # Vérifier s'il existe déjà des utilisateurs admin
        existing_admin = User.query.filter_by(role='admin').first()
        if existing_admin:
            click.echo("❌ Un administrateur existe déjà. Utilisez l'interface admin pour inviter des utilisateurs.")
            return
        
        # Créer le lien d'activation
        link = ActivationLink.create_first_admin_link(expires_hours=24)
        db.session.add(link)
        db.session.commit()
        
        frontend_url = os.environ.get('FRONTEND_URL', 'http://localhost:5173')
        activation_url = f"{frontend_url}/activate/{link.token}"
        
        click.echo("\n" + "=" * 60)
        click.echo("🔐 LIEN D'ACTIVATION PREMIER ADMINISTRATEUR")
        click.echo("=" * 60)
        click.echo(f"\nURL : {activation_url}")
        click.echo(f"\n⚠️  Ce lien expire dans 24 heures.")
        click.echo("⚠️  Ce lien ne peut être utilisé qu'une seule fois.")
        click.echo("=" * 60 + "\n")
    
    @app.cli.command('init-restaurant')
    def init_restaurant():
        """Initialise un restaurant par défaut."""
        import click
        
        existing = Restaurant.query.first()
        if existing:
            click.echo(f"ℹ️  Restaurant existant : {existing.name} ({existing.code})")
            return
        
        restaurant = Restaurant(
            name="Restaurant Universitaire",
            code="RU_DEFAULT"
        )
        db.session.add(restaurant)
        db.session.commit()
        
        click.echo(f"✅ Restaurant créé : {restaurant.name} (ID: {restaurant.id})")

    @app.cli.command('create-password-reset-link')
    def create_password_reset_link_cmd():
        """
        Crée un lien de réinitialisation de mot de passe.
        Lit l'email depuis la variable d'environnement RESET_PASSWORD_EMAIL.
        """
        import click

        email = os.environ.get('RESET_PASSWORD_EMAIL', '').strip()
        if not email:
            click.echo("❌ Variable d'environnement RESET_PASSWORD_EMAIL non définie.")
            return

        user = User.query.filter_by(email=email).first()
        if not user:
            click.echo(f"❌ Aucun utilisateur trouvé avec l'email : {email}")
            return

        if not user.is_active:
            click.echo(f"❌ Le compte {email} est désactivé.")
            return

        if not user.mfa_enabled:
            click.echo(f"⚠️  Le compte {email} n'a pas de MFA configuré. Réinitialisation impossible.")
            return

        # Créer le lien de reset
        link = ActivationLink.create_password_reset_link(
            email=email,
            expires_hours=72
        )
        db.session.add(link)

        # Logger
        AuditLog.log(
            action=AuditLog.ACTION_PASSWORD_RESET_REQUEST,
            target_type='user',
            target_id=user.id,
            details={'email': email, 'method': 'env_var_startup'},
            ip_address='container-startup'
        )

        db.session.commit()

        frontend_url = os.environ.get('FRONTEND_URL', 'http://localhost:5173')
        reset_url = f"{frontend_url}/reset-password/{link.token}"

        click.echo("\n" + "=" * 60)
        click.echo("🔐 LIEN DE RÉINITIALISATION DE MOT DE PASSE")
        click.echo("=" * 60)
        click.echo(f"\nUtilisateur : {email}")
        click.echo(f"URL : {reset_url}")
        click.echo(f"\n⚠️  Ce lien expire dans 72 heures.")
        click.echo("⚠️  Ce lien ne peut être utilisé qu'une seule fois.")
        click.echo("⚠️  L'authentification MFA sera requise.")
        click.echo("=" * 60 + "\n")
    
    # ========================================
    # SCHEDULER — Notifications push planifiées
    # ========================================
    _start_notification_scheduler(app)
    
    return app


def _start_notification_scheduler(app):
    """
    Démarre APScheduler pour envoyer les notifications push planifiées.
    Exécute check_and_send_notifications() toutes les minutes.
    """
    vapid_key = os.environ.get('VAPID_PRIVATE_KEY', '')
    if not vapid_key:
        app.logger.info("ℹ️  VAPID_PRIVATE_KEY non définie — scheduler de notifications désactivé")
        return
    
    # Empêche le scheduler de se lancer deux fois en mode debug (reloader de Flask)
    if os.environ.get('WERKZEUG_RUN_MAIN') != 'true' and app.debug:
        return
    
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        from .services.notification_service import check_and_send_notifications
        
        scheduler = BackgroundScheduler(daemon=True)
        scheduler.add_job(
            func=check_and_send_notifications,
            trigger='cron',
            minute='*',  # Toutes les minutes
            args=[app],
            id='push_notifications',
            name='Envoi des notifications push planifiées',
            replace_existing=True,
        )
        scheduler.start()
        app.logger.info("✅ Scheduler de notifications push démarré (toutes les minutes)")
        
    except Exception as e:
        app.logger.error(f"❌ Impossible de démarrer le scheduler : {e}")