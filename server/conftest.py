import os
import re
import pytest
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from sqlalchemy import text
from werkzeug.security import generate_password_hash

from app import create_app
from app.extensions import db as _db
from app.security import limiter as _limiter

_TEST_DB_HOST = os.environ.get('DB_HOST', 'db')
# Workers of pytest-xdist run at the same time: each gets its own database.
_WORKER = os.environ.get('PYTEST_XDIST_WORKER')
_TEST_DB_NAME = f'mariam_test_db_{_WORKER}' if _WORKER else 'mariam_test_db'
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
    _ensure_test_db()

    original_db_url = os.environ.get('DATABASE_URL')
    os.environ['DATABASE_URL'] = _TEST_DB_URL
    # Cached aggregates outlive TRUNCATE, and RESTART IDENTITY makes the next
    # test reuse the same cache key — stale hits would leak between tests.
    os.environ['ORG_CACHE_TTL_SECONDS'] = '0'

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
            # An open session would block drop_all.
            _db.session.remove()
            _db.engine.dispose()
            _db.drop_all()
    finally:
        if original_db_url is not None:
            os.environ['DATABASE_URL'] = original_db_url
        else:
            os.environ.pop('DATABASE_URL', None)


@pytest.fixture()
def client(app):
    return app.test_client()


def _truncate_all() -> None:
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
def no_ambient_redis(monkeypatch):
    """Cut the suite off from any reachable Redis.

    Counters, caches and job locks live outside PostgreSQL, so a developer's
    local instance would otherwise leak state between tests and across runs.
    A suite that needs Redis substitutes its own double.
    """
    from app.services import analytics_stats, redis_client, telemetry
    for module in (redis_client, analytics_stats, telemetry):
        monkeypatch.setattr(module, 'get_redis', lambda: None)


@pytest.fixture(autouse=True)
def fresh_budgets(monkeypatch):
    """Per-account budgets counted in memory and from zero: user ids repeat from
    one test to the next, and so would the keys of a shared counter.
    """
    from limits.storage import MemoryStorage
    from limits.strategies import FixedWindowRateLimiter
    monkeypatch.setattr('app.security._budgets', FixedWindowRateLimiter(MemoryStorage()))


@pytest.fixture()
def smtp(monkeypatch):
    SmtpRecorder.sent = []
    monkeypatch.setenv('SMTP_HOST', 'smtp.example.org')
    monkeypatch.setenv('SMTP_SENDER', 'mariam@example.org')
    monkeypatch.setattr('smtplib.SMTP', SmtpRecorder)
    return SmtpRecorder


@pytest.fixture(scope='session', autouse=True)
def documented_auth_responses(app):
    """Fail any test whose auth route answers something its OpenAPI doc does not declare.

    flask-smorest writes 422 itself, from the request schema, so it is left out.
    """
    from flask import current_app, request

    @app.after_request
    def check(response):
        endpoint = request.endpoint or ''
        if not endpoint.startswith('auth.') or response.status_code == 422:
            return response
        # flask-smorest records the declared responses only in this private attribute.
        declared = current_app.view_functions[endpoint]._apidoc['response']['responses']
        assert response.status_code in declared, (
            f'{endpoint} answered an undocumented {response.status_code}'
        )
        errors = declared[response.status_code][0]['schema'].validate(response.get_json())
        assert not errors, f'{endpoint} {response.status_code} strays from its schema: {errors}'
        return response


@pytest.fixture()
def revocations(monkeypatch):
    """Token revocations held in memory for one test, instead of the ambient Redis."""
    store = MemoryRevocations()
    monkeypatch.setattr('app.security._get_blacklist_redis', lambda: store)
    return store


@pytest.fixture(autouse=True)
def clean_db(app):
    """Truncates before each test rather than after, so that an interrupted run leaves
    nothing behind.
    """
    _truncate_all()
    yield
    _db.session.remove()


class FakeRedis:
    """Enough of the Redis surface for the telemetry service.

    A dict-backed double keeps the suite free of a Redis dependency; the flush
    logic it exercises is the same one production runs.
    """

    def __init__(self):
        self.hashes: dict[str, dict[str, int]] = {}
        self.sets: dict[str, set] = {}
        self.strings: dict[str, str] = {}
        self.hll: dict[str, set] = {}

    def pipeline(self):
        return self

    def execute(self):
        return []

    def expire(self, *_args, **_kwargs):
        return True

    def hincrby(self, key, field, amount=1):
        self.hashes.setdefault(key, {})
        self.hashes[key][field] = self.hashes[key].get(field, 0) + amount
        return self.hashes[key][field]

    def hgetall(self, key):
        return {k: str(v) for k, v in self.hashes.get(key, {}).items()}

    def sadd(self, key, *values):
        self.sets.setdefault(key, set()).update(str(v) for v in values)
        return len(values)

    def smembers(self, key):
        return set(self.sets.get(key, set()))

    def set(self, key, value, nx=False, ex=None):
        if nx and key in self.strings:
            return False
        self.strings[key] = value
        return True

    def get(self, key):
        return self.strings.get(key)

    def exists(self, key):
        return int(key in self.strings)

    def incr(self, key):
        value = int(self.strings.get(key, 0)) + 1
        self.strings[key] = str(value)
        return value

    def pfadd(self, key, *members):
        bucket = self.hll.setdefault(key, set())
        before = len(bucket)
        bucket.update(members)
        return int(len(bucket) > before)

    def pfcount(self, key):
        return len(self.hll.get(key, set()))


class SmtpRecorder:
    """Stands in for smtplib.SMTP, keeping what would have been sent."""

    sent: list = []

    def __init__(self, host, port, timeout=None):
        self.host = host
        self.port = port

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def starttls(self):
        pass

    def login(self, username, password):
        pass

    def send_message(self, message):
        SmtpRecorder.sent.append(message)


class MemoryRevocations:
    """The two calls the token blacklist makes on Redis."""

    def __init__(self):
        self.keys: set[str] = set()

    def setex(self, key, _ttl, _value):
        self.keys.add(key)

    def set(self, key, _value, nx=False, ex=None):
        if nx and key in self.keys:
            return None
        self.keys.add(key)
        return True

    def exists(self, key):
        return int(key in self.keys)


_ARGUMENT = re.compile(r'<(?:(\w+)(?:\([^)]*\))?:)?(\w+)>')
# A value each URL converter accepts, so that a probe reaches the view.
_CONVERTER_SAMPLES = {'date': '2026-01-05'}


def probe_path(rule: str) -> str:
    return _ARGUMENT.sub(lambda match: _CONVERTER_SAMPLES.get(match.group(1), '1'), rule)


# Sentinel: distinguishes "auto-attach" from an explicit None.
_AUTO_RESTAURANT = object()


def make_user(app, email='admin@mariam.app', role='admin', restaurant_id=_AUTO_RESTAURANT):
    """Written straight to the database, without a second factor."""
    from app.models import Restaurant, User
    if restaurant_id is _AUTO_RESTAURANT:
        restaurant = Restaurant.query.order_by(Restaurant.id).first()
        restaurant_id = restaurant.id if restaurant else make_restaurant(app, 'RU Test Auto', 'RU_AUTO')
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


TEST_ORG_SLUG = 'test-org'


def make_restaurant(app, name='RU Test', code='RU_TEST', organization_id=None):
    """A site of `organization_id`, or of the shared test organization; its slug
    comes from its code.
    """
    from app.models import Organization, Restaurant
    if organization_id is None:
        org = Organization.query.filter_by(slug=TEST_ORG_SLUG).first()
        if org is None:
            org = Organization(name='Organisation de test', slug=TEST_ORG_SLUG)
            _db.session.add(org)
            _db.session.flush()
        organization_id = org.id
    restaurant = Restaurant(
        name=name,
        code=code,
        slug=code.lower().replace('_', '-'),
        organization_id=organization_id,
        is_active=True,
    )
    _db.session.add(restaurant)
    _db.session.commit()
    return restaurant.id


def own_site(client, token) -> tuple[int, str]:
    """The id and address of the caller's own site, as its profile names them."""
    user = client.get('/v1/auth/me', headers=auth_headers(token)).get_json()['user']
    return (
        user['restaurant_id'],
        f"/v1/orgs/{user['organization_slug']}/sites/{user['restaurant_slug']}",
    )


def site_path(restaurant_id: int) -> str:
    from app.models import Organization, Restaurant
    site = _db.session.get(Restaurant, restaurant_id)
    org = _db.session.get(Organization, site.organization_id)
    return f'/v1/orgs/{org.slug}/sites/{site.slug}'


def make_category(app, restaurant_id, label='Plat principal', order=0):
    from app.models import MenuCategory
    category = MenuCategory(restaurant_id=restaurant_id, label=label, order=order)
    _db.session.add(category)
    _db.session.commit()
    return category.id


def get_token(client, email=None, password=None):
    res = client.post('/v1/auth/login', json={
        'email': email or 'admin@mariam.app',
        'password': password or TEST_PASSWORD,
    })
    assert res.status_code == 200, f'Login failed: {res.get_json()}'
    return res.get_json()['access_token']


def auth_headers(token):
    return {'Authorization': f'Bearer {token}'}
