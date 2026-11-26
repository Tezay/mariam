"""Where a site stands in its subscription, read from the periods its operator recorded.

Nothing here acts on a site: an expired subscription only reads as expired.
"""
from dataclasses import dataclass, replace
from datetime import date, timedelta

from ..extensions import db
from ..models import SubscriptionPeriod

NONE = 'none'
UPCOMING = 'upcoming'
ACTIVE = 'active'
EXPIRED = 'expired'
DISABLED = 'disabled'

COVERED = 'covered'
UNDECIDED = 'undecided'
ENDING = 'ending'

PERIOD_FIELDS = (
    'kind', 'starts_on', 'ends_on', 'renewal', 'tacit_until', 'notice_by',
    'quote_ref', 'order_ref', 'payer_name', 'payer_siret', 'payer_service_code',
)


@dataclass(frozen=True)
class Period:
    kind: str
    starts_on: date
    ends_on: date
    renewal: str
    tacit_until: date | None
    notice_by: date | None
    quote_ref: str | None
    order_ref: str | None
    payer_name: str | None
    payer_siret: str | None
    payer_service_code: str | None
    id: int | None = None
    # A year of a tacit renewal, which no row records.
    renewed_tacitly: bool = False

    @classmethod
    def of(cls, row: SubscriptionPeriod) -> 'Period':
        return cls(id=row.id, **{field: getattr(row, field) for field in PERIOD_FIELDS})


@dataclass(frozen=True)
class Standing:
    state: str
    current: Period | None = None
    next: Period | None = None
    end: str | None = None
    days_left: int | None = None
    past: tuple[Period, ...] = ()


def add_years(day: date, years: int) -> date:
    try:
        return day.replace(year=day.year + years)
    except ValueError:
        return day.replace(year=day.year + years, day=28)


def _tacit_year(last: Period, today: date, following: Period | None) -> Period | None:
    """The renewal year of `last`, which ended before `today`, that holds `today`."""
    if last.renewal != 'tacit' or not last.tacit_until or today > last.tacit_until:
        return None
    limit = last.tacit_until
    if following:
        limit = min(limit, following.starts_on - timedelta(days=1))
    years = 0
    start = last.ends_on + timedelta(days=1)
    while True:
        years += 1
        end = min(add_years(start, 1) - timedelta(days=1), limit)
        if today <= end:
            break
        if end == limit:
            return None
        start = end + timedelta(days=1)
    return replace(
        last,
        id=None,
        starts_on=start,
        ends_on=end,
        notice_by=add_years(last.notice_by, years) if last.notice_by else None,
        quote_ref=None,
        order_ref=None,
        renewed_tacitly=True,
    )


def _end_of(current: Period, following: Period | None) -> str:
    if following and following.starts_on == current.ends_on + timedelta(days=1):
        return COVERED
    if current.renewal == 'tacit' and current.tacit_until and current.tacit_until > current.ends_on:
        return COVERED
    return ENDING if current.renewal == 'ending' else UNDECIDED


def standing(periods: list[Period], today: date, site_active: bool = True) -> Standing:
    """`periods` in any order; they never overlap."""
    if not periods:
        return Standing(NONE)
    periods = sorted(periods, key=lambda period: period.starts_on)
    current = next((p for p in periods if p.starts_on <= today <= p.ends_on), None)
    following = next((p for p in periods if p.starts_on > today), None)
    past = tuple(p for p in reversed(periods) if p.ends_on < today)
    if current is None and past:
        current = _tacit_year(past[0], today, following)

    if current is not None:
        state, end, days_left = (
            ACTIVE, _end_of(current, following), (current.ends_on - today).days
        )
    else:
        state, end, days_left = (UPCOMING if following else EXPIRED), None, None
    return Standing(
        DISABLED if not site_active else state,
        current=current,
        next=following,
        end=end,
        days_left=days_left,
        past=past,
    )


def periods_by_site(site_ids: list[int]) -> dict[int, list[Period]]:
    rows = SubscriptionPeriod.query.filter(SubscriptionPeriod.restaurant_id.in_(site_ids)).all()
    grouped: dict[int, list[Period]] = {site_id: [] for site_id in site_ids}
    for row in rows:
        grouped[row.restaurant_id].append(Period.of(row))
    return grouped


def site_standing(site, today: date) -> Standing:
    return standing(periods_by_site([site.id])[site.id], today, site.is_active)


def overlapping(site_id: int, starts_on: date, ends_on: date, other_than: int | None = None):
    query = SubscriptionPeriod.query.filter(
        SubscriptionPeriod.restaurant_id == site_id,
        SubscriptionPeriod.starts_on <= ends_on,
        SubscriptionPeriod.ends_on >= starts_on,
    )
    if other_than is not None:
        query = query.filter(SubscriptionPeriod.id != other_than)
    return db.session.query(query.exists()).scalar()
