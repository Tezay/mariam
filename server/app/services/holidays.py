import json
import logging
from datetime import UTC, datetime

import requests

from ..utils.time import PARIS_TZ

logger = logging.getLogger(__name__)

CACHE_TTL_SECONDS = 86400
SCHOOL_ZONES = ('A', 'B', 'C')


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


def _paris_date(value: str) -> str:
    moment = datetime.fromisoformat(value)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    return moment.astimezone(PARIS_TZ).date().isoformat()


def get_school_holidays(year: int, zone: str) -> list[dict] | None:
    """The school holidays of a zone over the two school years touching `year`,
    sorted by start; None when the API is unreachable and nothing is cached.
    """
    from ..security import _get_blacklist_redis

    cache_key = f'vacances_scolaires:{year}:{zone}'
    r = _get_blacklist_redis()
    if r:
        try:
            cached = r.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception:
            logger.warning('Redis unavailable, cannot read %s', cache_key)

    params: dict[str, str | int] = {
        'where': (
            f'(zones="Zone {zone}" AND annee_scolaire="{year - 1}-{year}") OR '
            f'(zones="Zone {zone}" AND annee_scolaire="{year}-{year + 1}")'
        ),
        'limit': 100,
        'order_by': 'start_date',
    }
    try:
        resp = requests.get(
            'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/'
            'fr-en-calendrier-scolaire/records',
            params=params,
            timeout=8,
        )
        resp.raise_for_status()
        records = resp.json().get('results', [])
    except Exception:
        logger.warning('School holidays API unreachable for %s, zone %s', year, zone)
        return None

    # One record per académie: the same holidays come back several times.
    unique: dict[tuple[str, str, str], dict] = {}
    for record in records:
        if not record.get('start_date') or not record.get('end_date'):
            continue
        holiday = {
            'start_date': _paris_date(record['start_date']),
            'end_date': _paris_date(record['end_date']),
            'description': record.get('description', ''),
        }
        unique[(holiday['description'], holiday['start_date'], holiday['end_date'])] = holiday
    result = sorted(unique.values(), key=lambda holiday: holiday['start_date'])

    if r and result:
        try:
            r.setex(cache_key, CACHE_TTL_SECONDS, json.dumps(result))
        except Exception:
            logger.warning('Redis unavailable, cannot write %s', cache_key)
    return result
