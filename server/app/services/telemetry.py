"""Page-view counting for the public pages.

Counters live in Redis during the day and are flushed to Postgres by the
scheduler. Uniqueness is approximated with a HyperLogLog whose members are
hashes of the visitor's IP and user agent (see anti_abuse). No address is ever
stored in the clear, not even as a Redis key: the abuse budgets below are keyed
by the same salted digest.
"""
import logging
import os
from datetime import date, timedelta

from sqlalchemy.dialects.postgresql import insert

from ..extensions import db
from ..models import VISITOR_PAGE_KINDS, MenuVote, PageViewRollup, VisitorDailyUnique
from ..utils.time import paris_now, paris_today
from .anti_abuse import claim_budget, daily_salt, digest, env_cap
from .redis_client import acquire_job_lock, get_redis
from .votes import forget_device_ids

logger = logging.getLogger(__name__)

# Counters outlive the day they describe, so a late flush still finds them and
# the day-close job can still read yesterday.
_DAY_TTL = 48 * 3600

_DEFAULT_RETENTION_DAYS = 400


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


def _budget_key(scope: str, owner: str, day: date, source: str) -> str:
    return f'mariam:cap:{scope}:{owner}:{day.isoformat()}:{source[:32]}'


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
        visitor = digest(salt, ip, user_agent)
        address = digest(salt, ip)
        if not claim_budget(
            client,
            _budget_key('visitor', owner, day, visitor),
            env_cap('TELEMETRY_VISITOR_DAILY_CAP', 120),
        ):
            return
        if not claim_budget(
            client,
            _budget_key('address', owner, day, address),
            env_cap('TELEMETRY_IP_DAILY_CAP', 50000),
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
    cap = env_cap('TELEMETRY_IP_UNIQUE_CAP', 5000)
    if int(client.get(budget) or 0) >= cap:
        return
    if client.pfadd(_uniques_key(restaurant_id, day), visitor):
        claim_budget(client, budget, cap)
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


def persist_uniques(app, days: list[date] | None = None) -> int:
    """Write the visitor estimates of the given days (today by default) to Postgres.

    GREATEST on conflict keeps this monotonic, so a day still in progress can be
    written at every flush rather than only once, at its close.
    """
    client = get_redis()
    if client is None:
        return 0

    targets = days if days is not None else [paris_today()]
    with app.app_context():
        written = 0
        try:
            for target in targets:
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
            logger.exception('Unique-visitor write failed')
            return 0
        return written


def close_day_uniques(app, day: date | None = None) -> int:
    """Freeze a day's unique-visitor estimate before its salt expires."""
    target = day or (paris_today() - timedelta(days=1))
    flush_view_counters(app, days=[target])
    return persist_uniques(app, [target])


def purge_telemetry(app) -> int:
    """Drop every dated analytics row older than the retention window."""
    with app.app_context():
        try:
            days = int(os.environ.get('TELEMETRY_RETENTION_DAYS', _DEFAULT_RETENTION_DAYS))
        except ValueError:
            days = _DEFAULT_RETENTION_DAYS
        cutoff = paris_today() - timedelta(days=days)
        try:
            deleted = PageViewRollup.query.filter(PageViewRollup.date < cutoff).delete()
            deleted += VisitorDailyUnique.query.filter(VisitorDailyUnique.date < cutoff).delete()
            deleted += MenuVote.query.filter(MenuVote.date < cutoff).delete()
            db.session.commit()
        except Exception:
            db.session.rollback()
            logger.exception('Analytics purge failed')
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
        persist_uniques(app)


def run_day_close_job(app) -> None:
    target = paris_today() - timedelta(days=1)
    if acquire_job_lock(f'mariam:day_close_lock:{target.isoformat()}', 3600):
        close_day_uniques(app, target)
        forget_device_ids(app, before=target)


def run_purge_job(app) -> None:
    year, week, _ = paris_today().isocalendar()
    if acquire_job_lock(f'mariam:purge_lock:{year}W{week}', 3600):
        purge_telemetry(app)
