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
from .models import User, Restaurant, Menu, MenuItem, Event, ActivationLink, AuditLog


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
    
    # Configuration JWT - Sessions courtes pour sécurité (postes partagés)
    app.config['JWT_SECRET_KEY'] = os.environ.get('JWT_SECRET_KEY', 'jwt-secret-key-change-in-production')
    app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(
        minutes=int(os.environ.get('JWT_ACCESS_TOKEN_MINUTES', 30))
    )
    app.config['JWT_REFRESH_TOKEN_EXPIRES'] = timedelta(days=7)
    
    # Configuration MFA
    app.config['MFA_ISSUER_NAME'] = os.environ.get('MFA_ISSUER_NAME', 'MARIAM')
    
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
    # CONFIGURATION CORS
    # ========================================
    frontend_url = os.environ.get('FRONTEND_URL', 'http://localhost:5173')
    CORS(
        app,
        origins=[frontend_url],
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
    
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(admin_bp, url_prefix='/api/admin')
    app.register_blueprint(menus_bp, url_prefix='/api/menus')
    app.register_blueprint(events_bp, url_prefix='/api/events')
    app.register_blueprint(public_bp, url_prefix='/api/public')
    
    # Route de santé
    @app.route('/api/health')
    def health_check():
        return {
            'status': 'healthy', 
            'message': 'MARIAM API is running',
            'version': '0.2.0',
            'docs': '/api/v1/docs'
        }
    
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
    
    # Créer les tables
    with app.app_context():
        db.create_all()
    
    return app
