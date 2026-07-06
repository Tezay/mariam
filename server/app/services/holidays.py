"""Proxy des jours fériés français (calendrier.api.gouv.fr) avec cache Redis 24h."""
import json
import logging

import requests

logger = logging.getLogger(__name__)

CACHE_TTL_SECONDS = 86400


def get_jours_feries(year: int) -> list[dict] | None:
    """Retourne les jours fériés métropole pour une année donnée.

    Format : [{'date': 'YYYY-MM-DD', 'description': str}, ...], trié par date.
    Retourne None si l'API externe est injoignable et le cache vide.
    """
    from ..security import _get_blacklist_redis

    cache_key = f'jours_feries:{year}'
    r = _get_blacklist_redis()
    if r:
        try:
            cached = r.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception:
            logger.warning('Cache Redis indisponible en lecture pour %s', cache_key)

    try:
        resp = requests.get(
            f'https://calendrier.api.gouv.fr/jours-feries/metropole/{year}.json',
            timeout=5,
        )
        resp.raise_for_status()
        raw: dict = resp.json()
        # Format API : {"2026-01-01": "Jour de l'An", ...}
        result = [{'date': d, 'description': desc} for d, desc in sorted(raw.items())]
    except Exception:
        logger.warning('API jours fériés injoignable pour %s', year)
        return None

    if r:
        try:
            r.setex(cache_key, CACHE_TTL_SECONDS, json.dumps(result))
        except Exception:
            logger.warning('Cache Redis indisponible en écriture pour %s', cache_key)

    return result
