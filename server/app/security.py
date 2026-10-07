"""
MARIAM - Configuration de sécurité (Rate Limiting + Token Blacklist)

Protège l'API contre les scans automatisés et les attaques par force brute.
Flask-Limiter s'appuie sur Redis pour un compteur partagé entre les workers
Gunicorn ; la blacklist de tokens utilise le même Redis (préfixe
"mariam:revoked:").

Sans REDIS_URL, fallback automatique sur un stockage en mémoire (dev).
"""
import os

from flask_limiter import Limiter
from limits import RateLimitItem
from limits.storage import storage_from_string
from limits.strategies import FixedWindowRateLimiter

try:
    import redis as _redis_lib
    _REDIS_AVAILABLE = True
except ImportError:
    _REDIS_AVAILABLE = False

# On an access token: the id of the refresh token it descends from. Revoking
# that one ends every access token of the session, those it replaced included.
SESSION_CLAIM = 'sid'

_redis_blacklist = None


def _get_blacklist_redis():
    """Returns a Redis client for the token blacklist, or None in local dev."""
    global _redis_blacklist
    if _redis_blacklist is None and _REDIS_AVAILABLE:
        url = os.environ.get('REDIS_URL', '')
        if url and not url.startswith('memory://'):
            _redis_blacklist = _redis_lib.from_url(url, decode_responses=True)
    return _redis_blacklist


def blacklist_token(jti: str, ttl_seconds: int) -> None:
    """Add a token JTI to the blacklist with the given TTL (seconds)."""
    r = _get_blacklist_redis()
    if r:
        r.setex(f'mariam:revoked:{jti}', max(1, ttl_seconds), '1')


def claim_token(jti: str, ttl_seconds: int) -> bool:
    """Blacklist a single-use token; True for the one call that got there first.

    A single Redis command, where a lookup followed by a write would let two
    racing requests both pass. Fails closed like `is_token_blacklisted`, and
    lets every call through when Redis is not configured at all.
    """
    import logging
    r = _get_blacklist_redis()
    if not r:
        return True
    try:
        return bool(r.set(f'mariam:revoked:{jti}', '1', nx=True, ex=max(1, ttl_seconds)))
    except Exception:
        logging.getLogger(__name__).error(
            "Redis blacklist unavailable — refusing the single-use token as a precaution"
        )
        return False


def is_token_blacklisted(jti: str) -> bool:
    """
    Return True if the token JTI is present in the blacklist.

    Fail-closed: if Redis is configured but unreachable, the token is
    rejected (returns True) to prevent revoked tokens from being reused.
    If Redis is not configured at all (dev / memory://), tokens are allowed.
    """
    import logging
    r = _get_blacklist_redis()
    if r:
        try:
            return r.exists(f'mariam:revoked:{jti}') > 0
        except Exception:
            logging.getLogger(__name__).error(
                "Redis blacklist unavailable — rejecting token as a precaution"
            )
            return True
    return False


def get_client_ip():
    """
    Retourne l'adresse IP réelle du client.

    - Production (Cloudflare) : utilise CF-Connecting-IP (fiable, non falsifiable).
    - Fallback : X-Forwarded-For, puis remote_addr.
    """
    from flask import request
    cf_ip = request.headers.get('CF-Connecting-IP', '').strip()
    if cf_ip:
        return cf_ip
    forwarded_for = request.headers.get('X-Forwarded-For', '')
    if forwarded_for:
        return forwarded_for.split(',')[0].strip()
    return request.remote_addr or '127.0.0.1'


# Redis URL depuis l'environnement (service local ou instance managée)
# Fallback sur memory:// en développement local
REDIS_URL = os.environ.get('REDIS_URL', 'memory://')

limiter = Limiter(
    key_func=get_client_ip,
    storage_uri=REDIS_URL,
    default_limits=["60 per minute"],
    headers_enabled=True,
    strategy="fixed-window",
)

# Its own counters rather than the limiter's: the tests swap them for
# in-memory ones without reaching into Flask-Limiter.
_budgets = FixedWindowRateLimiter(storage_from_string(REDIS_URL))


def spend(limit: RateLimitItem, *subject: str) -> bool:
    """Count one use against a limit the route decorators cannot express: keyed
    by account rather than by address, and decided inside the view.

    False once the limit is exhausted.
    """
    return _budgets.hit(limit, *subject)
