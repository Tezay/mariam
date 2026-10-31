import os
from datetime import timedelta
from pathlib import Path

from flask import Flask
from flask_cors import CORS
from flask_jwt_extended.exceptions import CSRFError

from .converters import IsoDateConverter
from .extensions import db, jwt, migrate
from .models import (
    ActivationLink,
    AuditLog,
    CategorySubstitution,
    DishCatalog,
    Event,
    EventImage,
    ImportSession,
    Menu,
    MenuCategory,
    MenuItem,
    Organization,
    PushSubscription,
    Restaurant,
    User,
)
from .problems import Api, Problem, answer_problem, problem_response
from .security import ACCESS_COOKIE, REFRESH_COOKIE, SESSION_CLAIM, is_token_blacklisted, limiter
from .services.storage import storage
from .utils.urls import frontend_base_url


def create_app(config_class=None):
    app = Flask(__name__)

    # Before anything logs.
    from .logging_config import configure_logging
    configure_logging(app)

    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')
    app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get(
        'DATABASE_URL', 
        'postgresql://mariam:mariam_secret@localhost:5432/mariam_db'
    )
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    
    app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
        'pool_size': int(os.environ.get('DB_POOL_SIZE', 2)),
        'max_overflow': int(os.environ.get('DB_MAX_OVERFLOW', 2)),
        'pool_pre_ping': True,
        'pool_recycle': int(os.environ.get('DB_POOL_RECYCLE', 1800)),
    }
    
    app.config['JWT_SECRET_KEY'] = os.environ.get('JWT_SECRET_KEY', 'jwt-secret-key-change-in-production')

    _dev_defaults = {
        'dev-secret-key-change-in-production',
        'jwt-secret-key-change-in-production',
        'dev-device-secret-change-me',
    }
    _is_dev = (
        os.environ.get('FLASK_DEBUG') == '1'
        or os.environ.get('FLASK_ENV') == 'development'
    )
    if not _is_dev:
        missing = []
        if _dev_defaults & {app.config['SECRET_KEY'], app.config['JWT_SECRET_KEY']}:
            missing.append('SECRET_KEY/JWT_SECRET_KEY (development defaults)')
        # Signs the vote device tokens; sharing JWT_SECRET_KEY would let a leak
        # of either one forge both.
        device_secret = os.environ.get('DEVICE_ID_SECRET')
        if not device_secret or device_secret in _dev_defaults:
            missing.append('DEVICE_ID_SECRET')
        elif device_secret == app.config['JWT_SECRET_KEY']:
            missing.append('DEVICE_ID_SECRET (must differ from JWT_SECRET_KEY)')
        if not os.environ.get('MFA_ENCRYPTION_KEY'):
            missing.append('MFA_ENCRYPTION_KEY')
        if not os.environ.get('DATABASE_URL'):
            missing.append('DATABASE_URL')
        # Without it the token blacklist lets revoked tokens through, and the
        # scheduler drops every traffic count without an error.
        redis_url = os.environ.get('REDIS_URL', '')
        if not redis_url or redis_url.startswith('memory://'):
            missing.append('REDIS_URL')
        if not all(os.environ.get(k) for k in
                   ('S3_ENDPOINT_URL', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY')):
            missing.append('S3_ENDPOINT_URL/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY')
        if missing:
            raise RuntimeError(
                'Missing or left at their development default in production: '
                + ', '.join(missing)
            )
    app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(
        minutes=int(os.environ.get('JWT_ACCESS_TOKEN_MINUTES', 30))
    )
    app.config['JWT_REFRESH_TOKEN_EXPIRES'] = timedelta(days=7)
    # The browser holds its session in cookies no script can read; the header
    # serves every other client.
    app.config['JWT_TOKEN_LOCATION'] = ['headers', 'cookies']
    app.config['JWT_ACCESS_COOKIE_NAME'] = ACCESS_COOKIE
    app.config['JWT_REFRESH_COOKIE_NAME'] = REFRESH_COOKIE
    app.config['JWT_ACCESS_CSRF_COOKIE_NAME'] = '__Host-csrf-access'
    app.config['JWT_REFRESH_CSRF_COOKIE_NAME'] = '__Host-csrf-refresh'
    app.config['JWT_COOKIE_SECURE'] = True
    app.config['JWT_COOKIE_SAMESITE'] = 'Strict'
    
    app.config['MFA_ISSUER_NAME'] = os.environ.get('MFA_ISSUER_NAME', 'MARIAM')

    app.config['WEBAUTHN_RP_ID'] = os.environ.get('WEBAUTHN_RP_ID', 'localhost')
    app.config['WEBAUTHN_RP_NAME'] = os.environ.get('WEBAUTHN_RP_NAME', 'MARIAM')
    app.config['WEBAUTHN_ORIGIN'] = os.environ.get('WEBAUTHN_ORIGIN', 'http://localhost:5173')
    
    app.config['S3_ENDPOINT_URL'] = os.environ.get('S3_ENDPOINT_URL')
    app.config['S3_ACCESS_KEY_ID'] = os.environ.get('S3_ACCESS_KEY_ID')
    app.config['S3_SECRET_ACCESS_KEY'] = os.environ.get('S3_SECRET_ACCESS_KEY')
    app.config['S3_BUCKET_NAME'] = os.environ.get('S3_BUCKET_NAME', 'mariam-uploads')
    app.config['S3_REGION'] = os.environ.get('S3_REGION')
    app.config['S3_PUBLIC_URL'] = os.environ.get('S3_PUBLIC_URL', '')
    
    app.config['MAX_CONTENT_LENGTH'] = 32 * 1024 * 1024
    
    app.config['API_TITLE'] = 'MARIAM API'
    app.config['API_VERSION'] = 'v1'
    app.config['OPENAPI_VERSION'] = '3.0.3'
    # Under /v1, which every proxy in front already sends to the API.
    app.config['OPENAPI_URL_PREFIX'] = '/v1'
    app.config['OPENAPI_SWAGGER_UI_PATH'] = '/docs'
    app.config['OPENAPI_SWAGGER_UI_URL'] = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.33.2/'
    # Otherwise Swagger UI sends the spec's address to swagger.io for a badge.
    app.config['OPENAPI_SWAGGER_UI_CONFIG'] = {'validatorUrl': None, 'persistAuthorization': True}
    # A session by default; a route open to anyone says `security=[]`.
    app.config['API_SPEC_OPTIONS'] = {'security': [{'bearer': []}, {'session': []}]}
    
    sentry_dsn = os.environ.get('SENTRY_DSN')
    if sentry_dsn:
        import sentry_sdk
        from sentry_sdk.integrations.flask import FlaskIntegration
        sentry_sdk.init(
            dsn=sentry_dsn,
            integrations=[FlaskIntegration()],
            environment=os.environ.get('SENTRY_ENVIRONMENT', 'production'),
            release=os.environ.get('APP_VERSION'),
            traces_sample_rate=float(os.environ.get('SENTRY_TRACES_SAMPLE_RATE', '0')),
            send_default_pii=False,
            # Bodies hold passwords and codes under names the scrubber does not know.
            max_request_body_size='never',
        )

    db.init_app(app)
    jwt.init_app(app)
    migrate.init_app(app, db)
    storage.init_app(app)
    limiter.init_app(app)
    
    @jwt.invalid_token_loader
    def invalid_token_callback(error_string):
        return problem_response(
            401, 'token_invalid', 'Session invalide, veuillez vous reconnecter.'
        )

    @jwt.unauthorized_loader
    def missing_token_callback(error_string):
        return problem_response(401, 'token_missing', 'Connexion requise.')

    @jwt.expired_token_loader
    def expired_token_callback(jwt_header, jwt_payload):
        return problem_response(
            401, 'token_expired', 'Votre session a expiré, veuillez vous reconnecter.'
        )

    @jwt.token_in_blocklist_loader
    def check_if_token_revoked(jwt_header, jwt_payload):
        # A token issued for one step of a flow is never a session, whatever
        # route it is shown to.
        if (
            jwt_payload.get('mfa_pending')
            or jwt_payload.get('webauthn_pending')
            or jwt_payload.get('session_transfer')
            or jwt_payload.get('setup_phase')
            or jwt_payload.get('totp_enrolment')
        ):
            return True

        # Every view behind a session takes its account for granted: this is the
        # one place that refuses a token whose account is gone or disabled.
        sub = jwt_payload.get('sub')
        iat = jwt_payload.get('iat')
        if sub and iat:
            user = db.session.get(User, int(sub))
            if (
                user is None
                or not user.is_active
                or user.has_revoked(iat, jwt_payload.get(User.REVOCATION_MARKER))
            ):
                return True

        session = jwt_payload.get(SESSION_CLAIM)
        if session and is_token_blacklisted(session):
            return True

        jti = jwt_payload.get('jti')
        if not jti:
            return False
        return is_token_blacklisted(jti)

    @jwt.revoked_token_loader
    def revoked_token_callback(jwt_header, jwt_payload):
        if jwt_payload.get('mfa_pending'):
            return problem_response(
                401, 'authentication_incomplete', 'Veuillez compléter la vérification MFA.'
            )
        if jwt_payload.get('webauthn_pending') or jwt_payload.get('setup_phase'):
            return problem_response(
                401, 'token_restricted', 'Ce jeton ne peut pas être utilisé sur cette route.'
            )
        if jwt_payload.get('session_transfer'):
            return problem_response(
                401, 'token_restricted', "Ce jeton ne peut pas être utilisé comme jeton d'accès."
            )
        return problem_response(
            401, 'token_revoked', 'Votre session a été invalidée, veuillez vous reconnecter.'
        )

    # The library answers 401, after which the client renews a session that is
    # fine: what is refused is the request.
    def csrf_refused(error):
        return problem_response(
            403, 'csrf_invalid', "La requête n'a pas pu être vérifiée. Rechargez la page."
        )

    app.register_error_handler(CSRFError, csrf_refused)

    frontend_urls = os.environ.get('FRONTEND_URL', 'http://localhost:5173')
    origins = [url.strip() for url in frontend_urls.split(',') if url.strip()]
    
    CORS(
        app,
        origins=origins,
        supports_credentials=True,
        allow_headers=['Content-Type', 'Authorization', 'X-CSRF-TOKEN'],
        methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
    )

    from .security_headers import configure_security_headers
    configure_security_headers(app)

    api = Api(app)
    app.register_error_handler(Problem, answer_problem)
    api.spec.components.security_scheme(
        'bearer', {'type': 'http', 'scheme': 'bearer', 'bearerFormat': 'JWT'}
    )
    api.spec.components.security_scheme(
        'session', {'type': 'apiKey', 'in': 'cookie', 'name': ACCESS_COOKIE}
    )
    app.url_map.converters['date'] = IsoDateConverter
    api.register_converter(IsoDateConverter, lambda _: {'type': 'string', 'format': 'date'})

    from .routes.analytics import analytics_bp
    from .routes.audit import audit_bp
    from .routes.auth import auth_bp
    from .routes.categories import categories_bp
    from .routes.closures import closures_bp
    from .routes.devices import devices_bp
    from .routes.dish_groups import dish_groups_bp
    from .routes.dishes import dishes_bp
    from .routes.domains import domains_bp
    from .routes.holidays import holidays_bp
    from .routes.imports import imports_bp
    from .routes.members import members_bp
    from .routes.menus import menus_bp
    from .routes.news import news_bp
    from .routes.orgs import orgs_bp
    from .routes.push_subscriptions import push_bp
    from .routes.quality import quality_bp
    from .routes.sites import sites_bp
    from .routes.taxonomy import taxonomy_bp
    from .routes.user import user_bp
    from .routes.weekly_emails import weekly_emails_bp

    api.register_blueprint(auth_bp,          url_prefix='/v1/auth')
    api.register_blueprint(taxonomy_bp,      url_prefix='/v1/taxonomy')
    api.register_blueprint(holidays_bp,      url_prefix='/v1')
    api.register_blueprint(user_bp,          url_prefix='/v1/user')
    api.register_blueprint(weekly_emails_bp, url_prefix='/v1/weekly-emails')
    api.register_blueprint(push_bp,          url_prefix='/v1')
    api.register_blueprint(domains_bp,       url_prefix='/v1/domains')
    api.register_blueprint(orgs_bp,          url_prefix='/v1/orgs')
    api.register_blueprint(members_bp,       url_prefix='/v1/orgs')
    api.register_blueprint(audit_bp,         url_prefix='/v1/orgs')
    api.register_blueprint(analytics_bp,     url_prefix='/v1/orgs')
    api.register_blueprint(dish_groups_bp,   url_prefix='/v1/orgs/<org>/dish-groups')
    api.register_blueprint(sites_bp,         url_prefix='/v1/orgs/<org>/sites')
    api.register_blueprint(menus_bp,         url_prefix='/v1/orgs/<org>/sites/<site>/menus')
    api.register_blueprint(dishes_bp,        url_prefix='/v1/orgs/<org>/sites/<site>/dishes')
    api.register_blueprint(imports_bp,       url_prefix='/v1/orgs/<org>/sites/<site>')
    api.register_blueprint(categories_bp,    url_prefix='/v1/orgs/<org>/sites/<site>/categories')
    api.register_blueprint(news_bp,          url_prefix='/v1/orgs/<org>/sites/<site>/news')
    api.register_blueprint(closures_bp,      url_prefix='/v1/orgs/<org>/sites/<site>/closures')
    api.register_blueprint(quality_bp,       url_prefix='/v1/orgs/<org>/sites/<site>')
    api.register_blueprint(devices_bp,       url_prefix='/v1/devices')

    @app.route('/health')
    @limiter.exempt
    def health_check():
        # Liveness: the process is up. Used by the container healthcheck; must
        # stay shallow so a DB/Redis outage does not trigger container restarts.
        return {
            'status': 'healthy',
            'message': 'MARIAM API is running',
            'version': os.environ.get('APP_VERSION', 'dev'),
            'docs': '/v1/docs',
        }

    @app.route('/health/ready')
    @limiter.exempt
    def health_ready():
        # For the external uptime monitor only: as a container healthcheck it would
        # pull a working backend out of rotation whenever the scheduler stops.
        from sqlalchemy import text

        from .security import _get_blacklist_redis
        from .services.telemetry import flush_is_recent
        checks = {'db': False, 'redis': None, 'scheduler': None}
        healthy = True

        try:
            db.session.execute(text('SELECT 1'))
            checks['db'] = True
        except Exception:
            healthy = False

        redis_client = _get_blacklist_redis()
        if redis_client is not None:  # None in dev (no REDIS_URL) — not required
            try:
                redis_client.ping()
                checks['redis'] = True
            except Exception:
                checks['redis'] = False
                healthy = False

        checks['scheduler'] = flush_is_recent()
        if checks['scheduler'] is False:
            healthy = False

        return (
            {'status': 'ready' if healthy else 'degraded', 'checks': checks},
            200 if healthy else 503,
        )

    import click

    @app.cli.command('create-activation-link')
    def create_activation_link():
        """Create the activation link of the first administrator."""
        existing_admin = User.query.filter_by(role='admin').first()
        if existing_admin:
            click.echo("An administrator already exists. Invite users from the dashboard.")
            return
        
        link = ActivationLink.create_first_admin_link(expires_hours=24)
        # An account without a site would have nothing to manage.
        restaurant = Restaurant.query.first()
        if restaurant:
            link.restaurant_id = restaurant.id
            link.organization_id = restaurant.organization_id
        db.session.add(link)
        db.session.commit()
        
        frontend_url = frontend_base_url()
        activation_url = f"{frontend_url}/activate/{link.token}"
        
        click.echo("\n" + "=" * 60)
        click.echo("FIRST ADMINISTRATOR ACTIVATION LINK")
        click.echo("=" * 60)
        click.echo(f"\nURL: {activation_url}")
        click.echo("\nThis link expires in 24 hours.")
        click.echo("This link can only be used once.")
        click.echo("=" * 60 + "\n")
    
    @app.cli.command('init-restaurant')
    def init_restaurant():
        """Create a default restaurant and its categories, unless one exists."""

        existing = Restaurant.query.first()
        if existing:
            click.echo(f"Existing restaurant: {existing.name} ({existing.code})")
            return

        org_slug = os.environ.get('DEFAULT_ORG_SLUG', 'demo')
        org = Organization.query.filter_by(slug=org_slug).first()
        if not org:
            org = Organization(name="Organisation par défaut", slug=org_slug)
            db.session.add(org)
            db.session.flush()

        restaurant = Restaurant(
            name="Restaurant Universitaire",
            code="RU_DEFAULT",
            slug="ru-default",
            organization_id=org.id,
        )
        db.session.add(restaurant)
        db.session.flush()

        MenuCategory.create_defaults(restaurant.id)
        db.session.commit()

        click.echo(f"Restaurant created: {restaurant.name} (id {restaurant.id})")
        click.echo("Default categories created.")

    @app.cli.command('create-org')
    @click.option('--name', required=True, help='Organization name')
    @click.option('--slug', required=True, help='URL slug, its subdomain')
    def create_org(name, slug):
        """Create an organization, unless its slug is taken."""
        from .models.organization import RESERVED_ORG_SLUGS
        from .utils.slug import is_valid_slug, normalize_slug

        slug = normalize_slug(slug)
        if not is_valid_slug(slug) or slug in RESERVED_ORG_SLUGS:
            click.echo('Invalid or reserved slug.')
            return
        if Organization.query.filter_by(slug=slug).first():
            click.echo(f"Organization '{slug}' already exists.")
            return
        org = Organization(name=name, slug=slug)
        db.session.add(org)
        db.session.commit()
        click.echo(f'Organization created: {name} ({slug}), id={org.id}')

    @app.cli.command('seed-categories')
    def seed_categories_cmd():
        """Create the default categories of the active restaurant, if it has none."""

        restaurant = Restaurant.query.filter_by(is_active=True).first()
        if not restaurant:
            click.echo("No active restaurant found.")
            return
        if MenuCategory.query.filter_by(restaurant_id=restaurant.id).count() > 0:
            click.echo(f"{restaurant.name} already has categories, nothing to do.")
            return
        MenuCategory.create_defaults(restaurant.id)
        db.session.commit()
        click.echo(f"Default categories created for {restaurant.name}")

    @app.cli.command('send-digest')
    @click.option('--to', required=True, help="The recipient's address, which must have an account")
    @click.option('--dry-run', is_flag=True, help='Print the email instead of sending it')
    @click.option('--html-out', default=None, help='Write the HTML rendering to this file')
    def send_digest(to, dry_run, html_out):
        """Send the weekly digest to one user, to check the SMTP settings."""
        from .services import email_service
        from .services.access import accessible_restaurant_ids

        user = User.query.filter_by(email=to.strip().lower()).first()
        if not user:
            click.echo(f'No account with {to}.')
            return
        site_ids = sorted(accessible_restaurant_ids(user))
        if not site_ids:
            click.echo(f"{to} has access to no site.")
            return

        start, end = email_service.last_week()
        digest = email_service.build_digest(user, site_ids, start, end)
        if html_out:
            Path(html_out).write_text(digest['html'], encoding='utf-8')
            click.echo(f'HTML output written to {html_out}.')
        if dry_run:
            click.echo(digest['subject'])
            click.echo('─' * 40)
            click.echo(digest['text'])
            return
        if not email_service.is_configured():
            click.echo('SMTP not configured (SMTP_HOST, SMTP_SENDER).')
            return
        ok = email_service.send_email(
            to, digest['subject'], digest['text'], digest['html'], kind=email_service.Kind.DIGEST
        )
        click.echo(f'Digest sent to {to}.' if ok else f'Sending to {to} failed.')

    from .commands.demo import register_commands as register_demo
    from .commands.seed import register_commands as register_seed
    from .commands.user import register_commands as register_user
    register_seed(app)
    register_demo(app)
    register_user(app)

    _start_scheduler(app)

    return app


def _start_scheduler(app):
    """Start the background jobs, in the dedicated scheduler process only.

    Gunicorn workers never start it (ENABLE_SCHEDULER=1), which is what keeps
    push notifications from being sent once per worker.
    """
    if os.environ.get('ENABLE_SCHEDULER') != '1':
        return

    # Under the Flask dev reloader, only the child process should start it.
    if app.debug and os.environ.get('WERKZEUG_RUN_MAIN') != 'true':
        return

    try:
        from apscheduler.schedulers.background import BackgroundScheduler

        from .services import email_service, retention, telemetry

        scheduler = BackgroundScheduler(daemon=True, timezone='Europe/Paris')

        # Push is the only job needing VAPID keys; the others run regardless.
        if os.environ.get('VAPID_PRIVATE_KEY'):
            from .services.notification_service import check_and_send_notifications
            scheduler.add_job(
                func=check_and_send_notifications,
                trigger='cron', minute='*', args=[app],
                id='push_notifications',
                name='Send the scheduled push notifications',
                replace_existing=True, misfire_grace_time=60,
            )
        else:
            app.logger.info('VAPID_PRIVATE_KEY unset — push notifications disabled')

        scheduler.add_job(
            func=telemetry.run_flush_job,
            trigger='cron', minute='*/5', args=[app],
            id='telemetry_flush',
            name='Flush the view counters',
            replace_existing=True, misfire_grace_time=300,
        )
        scheduler.add_job(
            func=telemetry.run_day_close_job,
            trigger='cron', hour=0, minute=30, args=[app],
            id='telemetry_day_close',
            name="Close the previous day's unique visitors",
            replace_existing=True, misfire_grace_time=300,
        )
        scheduler.add_job(
            func=telemetry.run_purge_job,
            trigger='cron', day_of_week='sun', hour=3, args=[app],
            id='analytics_purge',
            name='Purge expired telemetry',
            replace_existing=True, misfire_grace_time=300,
        )
        scheduler.add_job(
            func=retention.run_purge_job,
            trigger='cron', day_of_week='sun', hour=3, minute=30, args=[app],
            id='retention_purge',
            name='Purge expired audit logs',
            replace_existing=True, misfire_grace_time=300,
        )
        # Hourly: each recipient picks the day and hour of their summary.
        scheduler.add_job(
            func=email_service.send_weekly_digest,
            trigger='cron', minute=0, args=[app],
            id='weekly_digest',
            name='Send the weekly digest emails',
            replace_existing=True, misfire_grace_time=300,
        )

        scheduler.start()
        app.logger.info('Scheduler started (%d jobs)', len(scheduler.get_jobs()))

    except Exception as e:
        app.logger.error(f"Scheduler failed to start: {e}")
