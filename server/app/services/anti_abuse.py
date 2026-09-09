"""Recognising a source on the anonymous public endpoints, without storing it.

View counting and vote guarding both need to tell one visitor from another and
to bound what a single source can do. A salt rotates daily and is never
persisted outside Redis: yesterday's digests cannot be linked to today's, and
nothing identifying survives its expiry.
"""
import hashlib
import os
import secrets
from datetime import date

# The salt outlives the day it covers so a late flush still finds it; budgets
# get the extra hours that absorb the timezone offset.
SALT_TTL = 48 * 3600
BUDGET_TTL = 26 * 3600


def daily_salt(client, day: date) -> str | None:
    """Fetch the day's salt, creating it once. Never stored outside Redis."""
    key = f'mariam:salt:{day.isoformat()}'
    try:
        client.set(key, secrets.token_hex(32), nx=True, ex=SALT_TTL)
        return client.get(key)
    except Exception:
        return None


def digest(salt: str, *parts: str) -> str:
    """Salted hash of the given parts, separated so they cannot run together."""
    return hashlib.sha256('\x1f'.join((salt, *parts)).encode()).hexdigest()


def env_cap(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


def claim_budget(client, key: str, cap: int, ttl: int = BUDGET_TTL) -> bool:
    """Consume one unit of a daily budget; False once it is exhausted."""
    used = client.incr(key)
    if used == 1:
        client.expire(key, ttl)
    return used <= cap
