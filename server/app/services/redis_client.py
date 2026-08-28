"""Shared Redis accessor for features that degrade gracefully without it.

Distinct from `app.security`, which owns the rate limiter and the token
blacklist: those fail closed, while callers here (analytics caches) must keep
working when Redis is absent — local dev runs without it.
"""
import os

try:
    import redis as _redis_lib
    _REDIS_AVAILABLE = True
except ImportError:  # pragma: no cover - redis is a hard dependency in practice
    _REDIS_AVAILABLE = False

_client = None
_resolved = False


def get_redis():
    """Return a shared Redis client, or None when Redis is not configured."""
    global _client, _resolved
    if not _resolved:
        _resolved = True
        if _REDIS_AVAILABLE:
            url = os.environ.get('REDIS_URL', '')
            if url and not url.startswith('memory://'):
                _client = _redis_lib.from_url(url, decode_responses=True)
    return _client
