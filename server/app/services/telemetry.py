"""Page-view counting for the public pages.

Counters live in Redis during the day and are flushed to Postgres by the
scheduler. Uniqueness is approximated with a HyperLogLog whose members are
hashes of the visitor's IP and user agent, salted with a key that rotates daily
and is never persisted: yesterday's hashes cannot be linked to today's, and
nothing identifying survives the salt's expiry. No address is ever stored in the
clear, not even as a Redis key -- the abuse budgets below are keyed by the same
salted digest.
"""
import hashlib
import logging
import os
import secrets
from datetime import date, timedelta

from sqlalchemy.dialects.postgresql import insert

from ..extensions import db
from ..models import VISITOR_PAGE_KINDS, PageViewRollup, VisitorDailyUnique
from ..utils.time import paris_now, paris_today
from .redis_client import acquire_job_lock, get_redis

logger = logging.getLogger(__name__)

# Counters and salt outlive the day they describe, so a late flush still finds
# them and the day-close job can still read yesterday.
_DAY_TTL = 48 * 3600

_DEFAULT_RETENTION_DAYS = 400

# Abuse budgets cover a calendar day; the extra hours absorb the timezone offset.
_BUDGET_TTL = 26 * 3600


def _enabled() -> bool:
    return os.environ.get('TELEMETRY_ENABLED', '1') != '0'


def _owner_token(restaurant_id: int | None, organization_id: int | None) -> str:
    return f'r{restaurant_id}' if restaurant_id else f'o{organization_id}'


def _owner_columns(token: str) -> dict:
    owner_id = int(token[1:])
    return (
        {'restaurant_id': owner_id, 'organization_id': None}
        if token[0] == 'r'
        else {'restaurant_id': None, 'organization_id': owner_id}
    )


def _views_key(token: str, day: date) -> str:
    return f'mariam:pv:{token}:{day.isoformat()}'


def _dirty_key(day: date) -> str:
    return f'mariam:pv:dirty:{day.isoformat()}'


def _uniques_key(restaurant_id: int, day: date) -> str:
    return f'mariam:uv:{restaurant_id}:{day.isoformat()}'


def daily_salt(client, day: date) -> str | None:
    """Fetch the day's salt, creating it once. Never stored outside Redis."""
    key = f'mariam:salt:{day.isoformat()}'
    try:
        client.set(key, secrets.token_hex(32), nx=True, ex=_DAY_TTL)
        return client.get(key)
    except Exception:
        return None


def _cap(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


def _digest(salt: str, *parts: str) -> str:
    return hashlib.sha256('\x1f'.join((salt, *parts)).encode()).hexdigest()


def _budget_key(scope: str, owner: str, day: date, digest: str) -> str:
    return f'mariam:cap:{scope}:{owner}:{day.isoformat()}:{digest[:32]}'


def _claim(client, key: str, cap: int) -> bool:
    """Consume one unit of a daily budget; False once it is exhausted."""
    used = client.incr(key)
    if used == 1:
        client.expire(key, _BUDGET_TTL)
    return used <= cap


def record_page_view(
    page_kind: str,
    ip: str,
    user_agent: str,
    restaurant_id: int | None = None,
    organization_id: int | None = None,
) -> None:
    """Count one view, and the visitor when the page belongs to a site.

    Two budgets bound how far one source can move the figures. The per-visitor
    one is tight and catches a refresh loop; the per-address one is deliberately
    far above what a whole campus behind a single NAT address produces, since
    clipping a school's real traffic would be the worse failure.
    """
    if not _enabled():
        return
    client = get_redis()
    if client is None:
        return

    now = paris_now()
    day = now.date()
    owner = _owner_token(restaurant_id, organization_id)
    try:
        salt = daily_salt(client, day)
        if not salt:
            return
        visitor = _digest(salt, ip, user_agent)
        address = _digest(salt, ip)
        if not _claim(
            client,
            _budget_key('visitor', owner, day, visitor),
            _cap('TELEMETRY_VISITOR_DAILY_CAP', 120),
        ):
            return
        if not _claim(
            client,
            _budget_key('address', owner, day, address),
            _cap('TELEMETRY_IP_DAILY_CAP', 50000),
        ):
            return

        pipe = client.pipeline()
        pipe.hincrby(_views_key(owner, day), f'{now.hour:02d}:{page_kind}', 1)
        pipe.expire(_views_key(owner, day), _DAY_TTL)
        pipe.sadd(_dirty_key(day), owner)
        pipe.expire(_dirty_key(day), _DAY_TTL)
        pipe.execute()

        if restaurant_id and page_kind in VISITOR_PAGE_KINDS:
            _count_visitor(client, restaurant_id, day, visitor, address)
    except Exception:
        logger.warning('Telemetry write skipped: Redis unavailable')


def _count_visitor(client, restaurant_id: int, day: date, visitor: str, address: str) -> None:
    """Add the visitor to the day's estimate, within this address's budget.

    Mixing the user agent in is what keeps students sharing one NAT address
    apart; the same property would let a single machine mint visitors by
    rotating the header, so only distinct contributions consume the budget.
    """
    budget = _budget_key('uniques', _owner_token(restaurant_id, None), day, address)
    cap = _cap('TELEMETRY_IP_UNIQUE_CAP', 5000)
    if int(client.get(budget) or 0) >= cap:
        return
    if client.pfadd(_uniques_key(restaurant_id, day), visitor):
        _claim(client, budget, cap)
    client.expire(_uniques_key(restaurant_id, day), _DAY_TTL)


def _upsert_views(rows) -> None:
    """Write counters, keeping the highest value seen for each bucket.

    Redis holds absolute counts for the day, so replaying a flush rewrites
    identical values; GREATEST additionally prevents a Redis restart, which
    resets the counters to zero, from walking Postgres backwards.
    """
    if not rows:
        return
    statement = insert(PageViewRollup).values(rows)
    db.session.execute(
        statement.on_conflict_do_update(
            constraint='uq_pv_rollup_owner_date_hour_kind',
            set_={'views': db.func.greatest(PageViewRollup.views, statement.excluded.views)},
        )
    )


def flush_view_counters(app, days: list[date] | None = None) -> int:
    """Move the Redis counters of the given days (today and yesterday) into Postgres."""
    client = get_redis()
    if client is None:
        return 0

    with app.app_context():
        today = paris_today()
        targets = days if days is not None else [today, today - timedelta(days=1)]
        written = 0
        try:
            for day in targets:
                rows = []
                for token in client.smembers(_dirty_key(day)) or set():
                    counters = client.hgetall(_views_key(token, day)) or {}
                    for field, value in counters.items():
                        hour, _, page_kind = field.partition(':')
                        rows.append({
                            **_owner_columns(token),
                            'date': day,
                            'hour': int(hour),
                            'page_kind': page_kind,
                            'views': int(value),
                        })
                _upsert_views(rows)
                written += len(rows)
            db.session.commit()
        except Exception:
            db.session.rollback()
            logger.exception('Telemetry flush failed')
            return 0
        return written


def close_day_uniques(app, day: date | None = None) -> int:
    """Freeze a day's unique-visitor estimate before its salt expires."""
    client = get_redis()
    if client is None:
        return 0

    target = day or (paris_today() - timedelta(days=1))
    flush_view_counters(app, days=[target])

    with app.app_context():
        written = 0
        try:
            for token in client.smembers(_dirty_key(target)) or set():
                if not token.startswith('r'):
                    continue
                restaurant_id = int(token[1:])
                count = client.pfcount(_uniques_key(restaurant_id, target))
                if not count:
                    continue
                statement = insert(VisitorDailyUnique).values(
                    restaurant_id=restaurant_id, date=target, unique_visitors=count
                )
                db.session.execute(
                    statement.on_conflict_do_update(
                        constraint='uq_uv_site_date',
                        set_={
                            'unique_visitors': db.func.greatest(
                                VisitorDailyUnique.unique_visitors,
                                statement.excluded.unique_visitors,
                            )
                        },
                    )
                )
                written += 1
            db.session.commit()
        except Exception:
            db.session.rollback()
            logger.exception('Unique-visitor day close failed')
            return 0
        return written


def purge_telemetry(app) -> int:
    """Drop rollups older than the retention window."""
    with app.app_context():
        try:
            days = int(os.environ.get('TELEMETRY_RETENTION_DAYS', _DEFAULT_RETENTION_DAYS))
        except ValueError:
            days = _DEFAULT_RETENTION_DAYS
        cutoff = paris_today() - timedelta(days=days)
        try:
            deleted = PageViewRollup.query.filter(PageViewRollup.date < cutoff).delete()
            deleted += VisitorDailyUnique.query.filter(VisitorDailyUnique.date < cutoff).delete()
            db.session.commit()
        except Exception:
            db.session.rollback()
            logger.exception('Telemetry purge failed')
            return 0
        return deleted


def live_uniques(site_ids, day: date) -> dict[int, int]:
    """Unique visitors for a day still held in Redis, before the day close."""
    client = get_redis()
    if client is None or not site_ids:
        return {}
    try:
        return {site_id: client.pfcount(_uniques_key(site_id, day)) or 0 for site_id in site_ids}
    except Exception:
        return {}


def run_flush_job(app) -> None:
    if acquire_job_lock(f'mariam:tel_flush_lock:{paris_now():%Y%m%d%H%M}', 240):
        flush_view_counters(app)


def run_day_close_job(app) -> None:
    target = paris_today() - timedelta(days=1)
    if acquire_job_lock(f'mariam:day_close_lock:{target.isoformat()}', 3600):
        close_day_uniques(app, target)


def run_purge_job(app) -> None:
    year, week, _ = paris_today().isocalendar()
    if acquire_job_lock(f'mariam:purge_lock:{year}W{week}', 3600):
        purge_telemetry(app)
