"""
Test configuration for MARIAM backend.

Uses a dedicated PostgreSQL test database (mariam_test_db).

Run with: docker compose exec backend uv run pytest
"""
import os
import pytest
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from sqlalchemy import text
from werkzeug.security import generate_password_hash

from app import create_app
from app.extensions import db as _db
from app.security import limiter as _limiter

_TEST_DB_HOST = os.environ.get('DB_HOST', 'db')
_TEST_DB_NAME = 'mariam_test_db'
_TEST_DB_URL = f'postgresql://mariam:mariam_secret@{_TEST_DB_HOST}:5432/{_TEST_DB_NAME}'

TEST_PASSWORD = 'TestPass123!'
TEST_PASSWORD_HASH = generate_password_hash(TEST_PASSWORD)


def _ensure_test_db() -> None:
    conn = psycopg2.connect(
        host=_TEST_DB_HOST, user='mariam', password='mariam_secret', dbname='mariam_db'
    )
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    cur = conn.cursor()
    cur.execute('SELECT 1 FROM pg_database WHERE datname = %s', (_TEST_DB_NAME,))
    if not cur.fetchone():
        cur.execute(f'CREATE DATABASE "{_TEST_DB_NAME}"')
    cur.close()
    conn.close()


@pytest.fixture(scope='session')
def app():
    """Application Flask configurée pour les tests (session entière)."""
    _ensure_test_db()

    original_db_url = os.environ.get('DATABASE_URL')
    os.environ['DATABASE_URL'] = _TEST_DB_URL

    try:
        application = create_app()
        application.config.update({
            'TESTING': True,
            'JWT_ACCESS_TOKEN_EXPIRES': False,
            'JWT_REFRESH_TOKEN_EXPIRES': False,
        })
        _limiter.enabled = False

        with application.app_context():
            _db.create_all()
            yield application
            # Fermer toutes les sessions avant drop_all pour éviter les locks PostgreSQL
            _db.session.remove()
            _db.engine.dispose()
            _db.drop_all()
    finally:
        # Restaurer DATABASE_URL pour ne pas polluer l'environnement
        if original_db_url is not None:
            os.environ['DATABASE_URL'] = original_db_url
        else:
            os.environ.pop('DATABASE_URL', None)


@pytest.fixture()
def client(app):
    """Flask test client."""
    return app.test_client()


def _truncate_all() -> None:
    """Vide toutes les tables de la base de test (TRUNCATE CASCADE)."""
    _db.session.remove()
    table_names = [
        f'"{t.name}"'
        for t in _db.metadata.sorted_tables
        if not t.name.startswith('alembic')
    ]
    if table_names:
        _db.session.execute(
            text(f'TRUNCATE {", ".join(table_names)} RESTART IDENTITY CASCADE')
        )
        _db.session.commit()


@pytest.fixture(autouse=True)
def clean_db(app):
    """
    Vide toutes les tables AVANT chaque test via TRUNCATE CASCADE.
    Ferme la session SQLAlchemy APRÈS chaque test pour libérer les connexions PostgreSQL.
    Nettoyer avant garantit un état propre même si un run précédent a été interrompu.
    """
    _truncate_all()
    yield
    # Fermer la session après le test pour libérer les connexions
    _db.session.remove()


# ---------------------------------------------------------------------------
# Helpers partagés entre les suites
# ---------------------------------------------------------------------------

# Sentinel: distinguishes "auto-attach" from an explicit None.
_AUTO_RESTAURANT = object()


def make_user(app, email='admin@mariam.app', role='admin', restaurant_id=_AUTO_RESTAURANT):
    """
    Crée un utilisateur en base sans MFA (pour tests directs).
    """
    from app.models import Restaurant, User
    if restaurant_id is _AUTO_RESTAURANT:
        restaurant = Restaurant.query.order_by(Restaurant.id).first()
        if restaurant is None:
            restaurant = Restaurant(name='RU Test Auto', code='RU_AUTO', is_active=True)
            _db.session.add(restaurant)
            _db.session.commit()
        restaurant_id = restaurant.id
    user = User(
        email=email,
        password_hash=TEST_PASSWORD_HASH,
        username=email.split('@')[0],
        role=role,
        is_active=True,
        mfa_enabled=False,
        restaurant_id=restaurant_id,
    )
    _db.session.add(user)
    _db.session.commit()
    return user.id


def make_restaurant(app, name='RU Test', code='RU_TEST'):
    """Crée un restaurant en base."""
    from app.models import Restaurant
    restaurant = Restaurant(name=name, code=code, is_active=True)
    _db.session.add(restaurant)
    _db.session.commit()
    return restaurant.id


def make_category(app, restaurant_id, label='Plat principal', order=0):
    """Crée une catégorie de menu en base."""
    from app.models import MenuCategory
    category = MenuCategory(restaurant_id=restaurant_id, label=label, order=order)
    _db.session.add(category)
    _db.session.commit()
    return category.id


def get_token(client, email=None, password=None):
    """Authentifie un utilisateur et retourne son access token."""
    res = client.post('/v1/auth/login', json={
        'email': email or 'admin@mariam.app',
        'password': password or TEST_PASSWORD,
    })
    assert res.status_code == 200, f'Login failed: {res.get_json()}'
    return res.get_json()['access_token']


def auth_headers(token):
    """Renvoie les headers Authorization pour un token JWT."""
    return {'Authorization': f'Bearer {token}'}
