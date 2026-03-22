"""
MARIAM - Configuration de sécurité (Rate Limiting + Token Blacklist)

Protège l'API contre les scans automatisés et les attaques par force brute.
Utilise Flask-Limiter avec Redis (Upstash) pour un rate limiting centralisé
partagé entre toutes les instances de containers serverless.

En développement (sans REDIS_URL), fallback automatique sur stockage en mémoire.
La blacklist de tokens utilise le même Redis avec le préfixe "mariam:revoked:".
"""
import os
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

try:
    import redis as _redis_lib
    _REDIS_AVAILABLE = True
except ImportError:
    _REDIS_AVAILABLE = False

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


def is_token_blacklisted(jti: str) -> bool:
    """
    Return True if the token JTI is present in the blacklist.
    """
    r = _get_blacklist_redis()
    if r:
        try:
            return r.exists(f'mariam:revoked:{jti}') > 0
        except Exception:
            return False
    return False


def get_client_ip():
    """
    Récupère l'adresse IP réelle du client.
    En serverless, le proxy ajoute X-Forwarded-For.
    """
    from flask import request
    forwarded_for = request.headers.get('X-Forwarded-For', '')
    if forwarded_for:
        return forwarded_for.split(',')[0].strip()
    return request.remote_addr or '127.0.0.1'


# Redis URL depuis l'environnement (Upstash ou Redis managé)
# Fallback sur memory:// en développement local
REDIS_URL = os.environ.get('REDIS_URL', 'memory://')

limiter = Limiter(
    key_func=get_client_ip,
    storage_uri=REDIS_URL,
    default_limits=["60 per minute"],
    headers_enabled=True,
    strategy="fixed-window",
)