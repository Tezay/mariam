"""Shared Redis accessor for features that degrade gracefully without it.

Distinct from `app.security`, which owns the rate limiter and the token
blacklist: those fail closed, while callers here (analytics caches, telemetry)
must keep working when Redis is absent — local dev may run without it.
"""
import logging
import os

try:
    import redis as _redis_lib
    _REDIS_AVAILABLE = True
except ImportError:  # pragma: no cover - redis is a hard dependency in practice
    _REDIS_AVAILABLE = False

logger = logging.getLogger(__name__)

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


def acquire_job_lock(key: str, ttl_seconds: int) -> bool:
    """Claim a scheduled job slot; True when this process owns it.

    Without Redis there is nothing to coordinate through, so the job runs: a
    deployment in that state is single-process by definition.
    """
    client = get_redis()
    if client is None:
        return True
    try:
        return bool(client.set(key, '1', nx=True, ex=ttl_seconds))
    except Exception:
        logger.warning('Redis unavailable for job lock %s — running anyway', key)
        return True
