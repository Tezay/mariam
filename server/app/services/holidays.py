import json
import logging

import requests

logger = logging.getLogger(__name__)

CACHE_TTL_SECONDS = 86400


def get_jours_feries(year: int) -> list[dict] | None:
    """Sorted by date; None when the API is unreachable and nothing is cached."""
    from ..security import _get_blacklist_redis

    cache_key = f'jours_feries:{year}'
    r = _get_blacklist_redis()
    if r:
        try:
            cached = r.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception:
            logger.warning('Redis unavailable, cannot read %s', cache_key)

    try:
        resp = requests.get(
            f'https://calendrier.api.gouv.fr/jours-feries/metropole/{year}.json',
            timeout=5,
        )
        resp.raise_for_status()
        raw: dict = resp.json()
        # {"2026-01-01": "Jour de l'An", ...}
        result = [{'date': d, 'description': desc} for d, desc in sorted(raw.items())]
    except Exception:
        logger.warning('Public holidays API unreachable for %s', year)
        return None

    if r:
        try:
            r.setex(cache_key, CACHE_TTL_SECONDS, json.dumps(result))
        except Exception:
            logger.warning('Redis unavailable, cannot write %s', cache_key)

    return result
