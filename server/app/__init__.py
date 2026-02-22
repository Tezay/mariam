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
from .security import limiter


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
    app.config['API_TITLE'] = 'MARIAM Developer API'
    app.config['API_VERSION'] = 'v1'
    app.config['OPENAPI_VERSION'] = '3.0.3'
    app.config['OPENAPI_URL_PREFIX'] = '/api/v1'
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
        methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
    )
    
    # ========================================
    # API v1 (Public Developer API with Swagger)
    # ========================================
    from flask_smorest import Api
    api = Api(app)
    
    from .routes.api_v1 import api_v1_bp
    api.register_blueprint(api_v1_bp)
    
    # ========================================
    # ENREGISTREMENT DES BLUEPRINTS INTERNES
    # ========================================
    from .routes.auth import auth_bp
    from .routes.admin import admin_bp
    from .routes.menus import menus_bp
    from .routes.events import events_bp
    from .routes.public import public_bp
    from .routes.csv_import import csv_import_bp
    from .routes.gallery import gallery_bp
    from .routes.notifications import notifications_bp
    
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(admin_bp, url_prefix='/api/admin')
    app.register_blueprint(menus_bp, url_prefix='/api/menus')
    app.register_blueprint(events_bp, url_prefix='/api/events')
    app.register_blueprint(gallery_bp, url_prefix='/api/gallery')
    app.register_blueprint(public_bp, url_prefix='/api/public')
    app.register_blueprint(csv_import_bp, url_prefix='/api/menus/import')
    app.register_blueprint(notifications_bp, url_prefix='/api/public/notifications')
    
    # Route de santé
    @app.route('/api/health')
    @limiter.exempt
    def health_check():
        return {
            'status': 'healthy', 
            'message': 'MARIAM API is running',
            'version': '0.5.2',
            'docs': '/api/v1/docs'
        }
    
    # ========================================
    # ROBOTS.TXT — Contrôle d'accès crawlers & IA
    # ========================================
    @app.route('/robots.txt')
    @limiter.exempt
    def robots_txt():
        """
        Autorise le crawling des routes publiques (menus, API v1)
        et bloque les routes internes (auth, admin, gestion).
        """
        content = """User-agent: *
Allow: /api/v1/
Allow: /api/public/
Disallow: /api/auth/
Disallow: /api/admin/
Disallow: /api/menus/
Disallow: /api/events/
Disallow: /api/gallery/

User-agent: GPTBot
Allow: /api/v1/
Allow: /api/public/
Disallow: /api/auth/
Disallow: /api/admin/

User-agent: OAI-SearchBot
Allow: /api/v1/
Allow: /api/public/
Disallow: /api/auth/
Disallow: /api/admin/

User-agent: ChatGPT-User
Allow: /api/v1/
Allow: /api/public/
Disallow: /api/auth/
Disallow: /api/admin/

User-agent: CCBot
Disallow: /

User-agent: anthropic-ai
Allow: /api/v1/
Allow: /api/public/
Disallow: /api/auth/
Disallow: /api/admin/

User-agent: Google-Extended
Allow: /api/v1/
Allow: /api/public/
Disallow: /api/auth/
Disallow: /api/admin/
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