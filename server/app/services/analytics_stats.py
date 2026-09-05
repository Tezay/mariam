"""Aggregates behind /v1/analytics, shared by the site and org dashboards.

Every query groups by site so their number stays constant as sites are added.
"""
import hashlib
import json
import os
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from flask import request

from ..extensions import db
from ..models import (
    DishCatalog,
    Menu,
    MenuCategory,
    MenuItem,
    PageViewRollup,
    Restaurant,
    VisitorDailyUnique,
)
from ..models.telemetry import ORG_PAGE_KINDS
from ..routes.helpers import accessible_restaurant_ids
from ..utils.time import PARIS_TZ, paris_today, parse_iso_date, utc_naive_to_paris
from .redis_client import get_redis
from .service_calendar import closures_by_site
from .telemetry import live_uniques

PERIODS = {'7d': 7, '30d': 30, '90d': 90}
DEFAULT_PERIOD = '30d'
MAX_RANGE_DAYS = 366

# The status matrix is one entry per site and day; capping it keeps the payload
# bounded on a year-long range (the heatmap only renders the last 30 days).
MATRIX_MAX_DAYS = 60

DEFAULT_OPEN_TIME = '11:30'


@dataclass(frozen=True)
class Scope:
    site_ids: list[int]
    start: date
    end: date
    prev_start: date
    prev_end: date

    @property
    def days(self) -> int:
        return (self.end - self.start).days + 1

    def previous(self) -> 'Scope':
        span = self.days
        return Scope(
            site_ids=self.site_ids,
            start=self.prev_start,
            end=self.prev_end,
            prev_start=self.prev_start - timedelta(days=span),
            prev_end=self.prev_start - timedelta(days=1),
        )


def resolve_scope(user) -> Scope:
    """Build the request scope, intersecting `site_ids` with what the user may read.

    Ids outside the caller's reach are dropped silently: a director filtering on
    a foreign site gets that site's data omitted, never a 403.
    """
    accessible = accessible_restaurant_ids(user)
    requested = request.args.get('site_ids', '')
    if requested:
        wanted = {int(part) for part in requested.split(',') if part.strip().isdigit()}
        site_ids = sorted(accessible & wanted)
    else:
        site_ids = sorted(accessible)

    today = paris_today()
    end = min(parse_iso_date(request.args.get('end')) or today, today)
    start = parse_iso_date(request.args.get('start'))
    if start is None:
        span = PERIODS.get(request.args.get('period', DEFAULT_PERIOD), PERIODS[DEFAULT_PERIOD])
        start = end - timedelta(days=span - 1)
    start = min(start, end)
    if (end - start).days + 1 > MAX_RANGE_DAYS:
        start = end - timedelta(days=MAX_RANGE_DAYS - 1)

    span = (end - start).days + 1
    prev_end = start - timedelta(days=1)
    return Scope(
        site_ids=site_ids,
        start=start,
        end=end,
        prev_start=prev_end - timedelta(days=span - 1),
        prev_end=prev_end,
    )


def _cache_ttl() -> int:
    try:
        return max(0, int(os.environ.get('ORG_CACHE_TTL_SECONDS', '60')))
    except ValueError:
        return 60


def cached_json(org_id, name: str, scope: Scope, producer, extra: dict | None = None):
    """Memoize an aggregate for a short while, or compute it when Redis is absent.

    The resolved site ids are part of the key: a site admin and a director must
    never share an entry for the same endpoint.
    """
    ttl = _cache_ttl()
    client = get_redis()
    if client is None or ttl == 0:
        return producer()

    payload = {
        'sites': scope.site_ids,
        'start': scope.start.isoformat(),
        'end': scope.end.isoformat(),
        **(extra or {}),
    }
    digest = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()[:32]
    key = f'mariam:anacache:{org_id}:{name}:{digest}'

    try:
        hit = client.get(key)
        if hit:
            return json.loads(hit)
    except Exception:
        return producer()

    result = producer()
    try:
        client.setex(key, ttl, json.dumps(result, default=str))
    except Exception:
        pass
    return result


def _rate(numerator: int, denominator: int) -> float | None:
    return round(numerator / denominator, 4) if denominator else None


def _metric(value, previous) -> dict:
    delta = None
    delta_pct = None
    if value is not None and previous is not None:
        delta = round(value - previous, 4)
        if previous:
            delta_pct = round((value - previous) / abs(previous) * 100, 1)
    return {'value': value, 'previous': previous, 'delta': delta, 'delta_pct': delta_pct}


def _service_start(day: date, hhmm: str) -> datetime:
    try:
        hour, minute = (int(part) for part in hhmm.split(':'))
        return datetime(day.year, day.month, day.day, hour, minute, tzinfo=PARIS_TZ)
    except (ValueError, TypeError):
        return datetime(day.year, day.month, day.day, 11, 30, tzinfo=PARIS_TZ)


class _PublicationCounters:
    def __init__(self):
        self.open_days = 0
        self.published_on_open_days = 0
        self.published = 0
        self.punctual = 0
        self.lead_hours: list[float] = []
        self.categories_expected = 0
        self.categories_filled = 0
        self.items = 0
        self.items_with_photo = 0
        self.menus_with_note = 0

    @property
    def publication_rate(self):
        return _rate(self.published_on_open_days, self.open_days)

    @property
    def punctuality_rate(self):
        return _rate(self.punctual, self.published)

    @property
    def avg_lead_time_hours(self):
        if not self.lead_hours:
            return None
        return round(sum(self.lead_hours) / len(self.lead_hours), 1)

    def completeness(self) -> dict:
        return {
            'categories_filled_rate': _rate(self.categories_filled, self.categories_expected),
            'photo_rate': _rate(self.items_with_photo, self.items),
            'chef_note_rate': _rate(self.menus_with_note, self.published),
        }

    def as_summary(self) -> dict:
        return {
            'publication_rate': self.publication_rate,
            'punctuality_rate': self.punctuality_rate,
            'avg_lead_time_hours': self.avg_lead_time_hours,
            'completeness': self.completeness(),
        }


def _sites_in_scope(site_ids: list[int]) -> list[Restaurant]:
    if not site_ids:
        return []
    return (
        Restaurant.query.filter(Restaurant.id.in_(site_ids))
        .order_by(Restaurant.name)
        .all()
    )


def _menus_in_range(scope: Scope) -> list:
    return (
        db.session.query(
            Menu.id,
            Menu.restaurant_id,
            Menu.date,
            Menu.status,
            Menu.published_at,
            Menu.chef_note,
        )
        .filter(
            Menu.restaurant_id.in_(scope.site_ids),
            Menu.date >= scope.start,
            Menu.date <= scope.end,
        )
        .all()
    )


def _filled_categories_per_menu(scope: Scope) -> dict[int, set[int]]:
    parent_or_self = db.func.coalesce(MenuCategory.parent_id, MenuCategory.id)
    rows = (
        db.session.query(MenuItem.menu_id, parent_or_self.label('category_id'))
        .join(Menu, Menu.id == MenuItem.menu_id)
        .join(MenuCategory, MenuCategory.id == MenuItem.category_id)
        .filter(
            Menu.restaurant_id.in_(scope.site_ids),
            Menu.date >= scope.start,
            Menu.date <= scope.end,
        )
        .group_by(MenuItem.menu_id, parent_or_self)
        .all()
    )
    filled: dict[int, set[int]] = {}
    for menu_id, category_id in rows:
        filled.setdefault(menu_id, set()).add(category_id)
    return filled


def _photo_counts_per_menu(scope: Scope) -> dict[int, tuple[int, int]]:
    rows = (
        db.session.query(
            MenuItem.menu_id,
            db.func.count(MenuItem.id).label('total'),
            db.func.count(DishCatalog.image_url).label('with_photo'),
        )
        .join(Menu, Menu.id == MenuItem.menu_id)
        .join(DishCatalog, DishCatalog.id == MenuItem.dish_id)
        .filter(
            Menu.restaurant_id.in_(scope.site_ids),
            Menu.date >= scope.start,
            Menu.date <= scope.end,
        )
        .group_by(MenuItem.menu_id)
        .all()
    )
    return {row.menu_id: (row.total, row.with_photo) for row in rows}


def _top_level_category_counts(site_ids: list[int]) -> dict[int, int]:
    rows = (
        db.session.query(MenuCategory.restaurant_id, db.func.count(MenuCategory.id))
        .filter(
            MenuCategory.restaurant_id.in_(site_ids),
            MenuCategory.parent_id.is_(None),
        )
        .group_by(MenuCategory.restaurant_id)
        .all()
    )
    return {restaurant_id: count for restaurant_id, count in rows}


def _open_times(site_ids: list[int]) -> dict[tuple[int, int], str]:
    from ..models import RestaurantServiceHours

    rows = (
        db.session.query(
            RestaurantServiceHours.restaurant_id,
            RestaurantServiceHours.day_of_week,
            RestaurantServiceHours.open_time,
        )
        .filter(RestaurantServiceHours.restaurant_id.in_(site_ids))
        .all()
    )
    return {(restaurant_id, day): open_time for restaurant_id, day, open_time in rows}


def _last_published_at(site_ids: list[int]) -> dict[int, datetime]:
    rows = (
        db.session.query(Menu.restaurant_id, db.func.max(Menu.published_at))
        .filter(Menu.restaurant_id.in_(site_ids), Menu.status == 'published')
        .group_by(Menu.restaurant_id)
        .all()
    )
    return {restaurant_id: published_at for restaurant_id, published_at in rows if published_at}


def publication_stats(scope: Scope, include_matrix: bool = True) -> dict:
    """Publication compliance and content completeness per site over the period."""
    sites = _sites_in_scope(scope.site_ids)
    if not sites:
        return {'summary': _PublicationCounters().as_summary(), 'sites': [], 'matrix': []}

    menus = _menus_in_range(scope)
    filled = _filled_categories_per_menu(scope)
    photos = _photo_counts_per_menu(scope)
    expected_categories = _top_level_category_counts(scope.site_ids)
    closures = closures_by_site(scope.site_ids, scope.start, scope.end)
    open_times = _open_times(scope.site_ids)

    menus_by_site_date = {(menu.restaurant_id, menu.date): menu for menu in menus}

    matrix_start = scope.start
    if include_matrix and scope.days > MATRIX_MAX_DAYS:
        matrix_start = scope.end - timedelta(days=MATRIX_MAX_DAYS - 1)

    overall = _PublicationCounters()
    site_rows = []
    matrix = []

    for site in sites:
        counters = _PublicationCounters()
        service_days = set(site.get_service_days())
        site_closures = closures.get(site.id, [])
        expected = expected_categories.get(site.id, 0)
        days = []

        day = scope.start
        while day <= scope.end:
            is_closed = any(start <= day <= end for start, end in site_closures)
            is_open = day.weekday() in service_days and not is_closed
            menu = menus_by_site_date.get((site.id, day))
            status = 'closed'

            if is_open:
                counters.open_days += 1

            if menu is not None and menu.status == 'published':
                counters.published += 1
                if is_open:
                    counters.published_on_open_days += 1

                punctual = True
                if menu.published_at is not None:
                    service_start = _service_start(
                        day, open_times.get((site.id, day.weekday()), DEFAULT_OPEN_TIME)
                    )
                    lead = (
                        service_start - utc_naive_to_paris(menu.published_at)
                    ).total_seconds() / 3600
                    counters.lead_hours.append(round(lead, 2))
                    punctual = lead >= 0
                if punctual:
                    counters.punctual += 1

                counters.categories_expected += expected
                # A category removed after publication would push the rate above 1.
                counters.categories_filled += min(len(filled.get(menu.id, ())), expected)
                item_total, item_photos = photos.get(menu.id, (0, 0))
                counters.items += item_total
                counters.items_with_photo += item_photos
                if menu.chef_note:
                    counters.menus_with_note += 1

                if not is_closed:
                    status = 'published_on_time' if punctual else 'published_late'
            elif is_open:
                status = 'draft' if menu is not None else 'missing'

            if include_matrix and day >= matrix_start:
                days.append({'date': day.isoformat(), 'status': status})
            day += timedelta(days=1)

        overall.open_days += counters.open_days
        overall.published_on_open_days += counters.published_on_open_days
        overall.published += counters.published
        overall.punctual += counters.punctual
        overall.lead_hours.extend(counters.lead_hours)
        overall.categories_expected += counters.categories_expected
        overall.categories_filled += counters.categories_filled
        overall.items += counters.items
        overall.items_with_photo += counters.items_with_photo
        overall.menus_with_note += counters.menus_with_note

        completeness = counters.completeness()
        site_rows.append({
            'site_id': site.id,
            'name': site.name,
            'publication_rate': counters.publication_rate,
            'punctuality_rate': counters.punctuality_rate,
            'avg_lead_time_hours': counters.avg_lead_time_hours,
            **completeness,
        })
        if include_matrix:
            matrix.append({'site_id': site.id, 'name': site.name, 'days': days})

    return {'summary': overall.as_summary(), 'sites': site_rows, 'matrix': matrix}


def overview(scope: Scope, organization_id=None) -> dict:
    """Headline KPIs, org trend and per-site table for the dashboard home.

    Satisfaction is not collected yet; its keys are present and null so the
    frontend contract does not change when it lands.
    """
    sites = _sites_in_scope(scope.site_ids)
    current = publication_stats(scope, include_matrix=False)
    previous = publication_stats(scope.previous(), include_matrix=False)

    current_summary = current['summary']
    previous_summary = previous['summary']
    rates_by_site = {row['site_id']: row for row in current['sites']}
    last_published = _last_published_at(scope.site_ids) if scope.site_ids else {}

    traffic = traffic_stats(scope, organization_id) if scope.site_ids else None
    traffic_previous = (
        traffic_stats(scope.previous(), organization_id) if scope.site_ids else None
    )
    traffic_by_date = {row['date']: row for row in (traffic['series'] if traffic else [])}
    traffic_by_site = {row['site_id']: row for row in (traffic['by_site'] if traffic else [])}

    published_per_date: dict[date, int] = {}
    for menu in _menus_in_range(scope) if scope.site_ids else []:
        if menu.status == 'published':
            published_per_date[menu.date] = published_per_date.get(menu.date, 0) + 1

    trend = []
    day = scope.start
    while day <= scope.end:
        trend.append({
            'date': day.isoformat(),
            'published_sites': published_per_date.get(day, 0),
            'views': traffic_by_date.get(day.isoformat(), {}).get('views'),
            'unique_visitors': traffic_by_date.get(day.isoformat(), {}).get('unique_visitors'),
            'score': None,
        })
        day += timedelta(days=1)

    site_rows = []
    for site in sites:
        rates = rates_by_site.get(site.id, {})
        published_at = last_published.get(site.id)
        site_rows.append({
            'site_id': site.id,
            'name': site.name,
            'is_active': site.is_active,
            'publication_rate': rates.get('publication_rate'),
            'punctuality_rate': rates.get('punctuality_rate'),
            'last_published_at': (
                utc_naive_to_paris(published_at).isoformat() if published_at else None
            ),
            'views': traffic_by_site.get(site.id, {}).get('views'),
            'views_sparkline': traffic_by_site.get(site.id, {}).get('sparkline'),
            'score': None,
            'votes': None,
        })

    return {
        'period': {
            'start': scope.start.isoformat(),
            'end': scope.end.isoformat(),
            'days': scope.days,
        },
        'scope': {'site_count': len(sites)},
        'kpis': {
            'sites': {
                'total': len(sites),
                'active': sum(1 for site in sites if site.is_active),
            },
            'publication_rate': _metric(
                current_summary['publication_rate'], previous_summary['publication_rate']
            ),
            'punctuality_rate': _metric(
                current_summary['punctuality_rate'], previous_summary['punctuality_rate']
            ),
            'avg_lead_time_hours': _metric(
                current_summary['avg_lead_time_hours'], previous_summary['avg_lead_time_hours']
            ),
            'completeness': current_summary['completeness'],
            'views': _metric(
                traffic['totals']['views'] if traffic else None,
                traffic_previous['totals']['views'] if traffic_previous else None,
            ),
            'unique_visitors': _metric(
                traffic['totals']['unique_visitors'] if traffic else None,
                traffic_previous['totals']['unique_visitors'] if traffic_previous else None,
            ),
            'satisfaction': None,
            'participation_rate': None,
        },
        'trend': trend,
        'sites': site_rows,
        'top_dishes': None,
        'flop_dishes': None,
    }


SPARKLINE_DAYS = 14

# Signage screens refresh unattended all day; counting them as visits would make
# every other figure meaningless.
_SITE_VIEWS = db.and_(
    PageViewRollup.restaurant_id.isnot(None),
    PageViewRollup.page_kind != 'tv',
)


def _views_in_range(site_ids, start: date, end: date, *, all_kinds: bool = False):
    scope = PageViewRollup.restaurant_id.in_(site_ids)
    if not all_kinds:
        scope = db.and_(scope, _SITE_VIEWS)
    return db.session.query(PageViewRollup).filter(
        scope, PageViewRollup.date >= start, PageViewRollup.date <= end
    )


def _sum_by(site_ids, start: date, end: date, column, *, all_kinds: bool = False) -> dict:
    rows = (
        _views_in_range(site_ids, start, end, all_kinds=all_kinds)
        .with_entities(column, db.func.sum(PageViewRollup.views))
        .group_by(column)
        .all()
    )
    return {key: int(total or 0) for key, total in rows}


def _uniques_by_site(site_ids, start: date, end: date) -> dict[int, int]:
    rows = (
        db.session.query(
            VisitorDailyUnique.restaurant_id, db.func.sum(VisitorDailyUnique.unique_visitors)
        )
        .filter(
            VisitorDailyUnique.restaurant_id.in_(site_ids),
            VisitorDailyUnique.date >= start,
            VisitorDailyUnique.date <= end,
        )
        .group_by(VisitorDailyUnique.restaurant_id)
        .all()
    )
    totals = {site_id: int(count or 0) for site_id, count in rows}

    # The day close runs at 00:30, so today's estimate normally lives only in
    # Redis. Take the larger of the two rather than their sum: a close already
    # run for today would otherwise be counted twice.
    today = paris_today()
    if start <= today <= end:
        for site_id, count in live_uniques(site_ids, today).items():
            totals[site_id] = max(totals.get(site_id, 0), count)
    return totals


def _uniques_by_date(site_ids, start: date, end: date) -> dict[date, int]:
    rows = (
        db.session.query(VisitorDailyUnique.date, db.func.sum(VisitorDailyUnique.unique_visitors))
        .filter(
            VisitorDailyUnique.restaurant_id.in_(site_ids),
            VisitorDailyUnique.date >= start,
            VisitorDailyUnique.date <= end,
        )
        .group_by(VisitorDailyUnique.date)
        .all()
    )
    totals = {day: int(count or 0) for day, count in rows}
    today = paris_today()
    if start <= today <= end:
        live = sum(live_uniques(site_ids, today).values())
        if live:
            totals[today] = max(totals.get(today, 0), live)
    return totals


def _org_root_views(organization_id, start: date, end: date) -> int:
    if not organization_id:
        return 0
    total = (
        db.session.query(db.func.sum(PageViewRollup.views))
        .filter(
            PageViewRollup.organization_id == organization_id,
            PageViewRollup.page_kind.in_(ORG_PAGE_KINDS),
            PageViewRollup.date >= start,
            PageViewRollup.date <= end,
        )
        .scalar()
    )
    return int(total or 0)


def traffic_stats(scope: Scope, organization_id=None) -> dict:
    """Consultation of the public pages over the period, per day, site and hour."""
    sites = _sites_in_scope(scope.site_ids)
    if not sites:
        return {
            'series': [], 'by_site': [], 'by_page_kind': [], 'hour_profile': [],
            'totals': {'views': 0, 'unique_visitors': 0, 'org_root_views': 0},
        }

    site_ids = scope.site_ids
    views_by_date = _sum_by(site_ids, scope.start, scope.end, PageViewRollup.date)
    views_by_site = _sum_by(site_ids, scope.start, scope.end, PageViewRollup.restaurant_id)
    views_by_hour = _sum_by(site_ids, scope.start, scope.end, PageViewRollup.hour)
    views_by_kind = _sum_by(
        site_ids, scope.start, scope.end, PageViewRollup.page_kind, all_kinds=True
    )
    previous = scope.previous()
    previous_by_site = _sum_by(site_ids, previous.start, previous.end, PageViewRollup.restaurant_id)

    uniques_by_site = _uniques_by_site(site_ids, scope.start, scope.end)
    uniques_by_date = _uniques_by_date(site_ids, scope.start, scope.end)

    sparkline_start = max(scope.start, scope.end - timedelta(days=SPARKLINE_DAYS - 1))
    sparkline_rows = (
        _views_in_range(site_ids, sparkline_start, scope.end)
        .with_entities(
            PageViewRollup.restaurant_id, PageViewRollup.date, db.func.sum(PageViewRollup.views)
        )
        .group_by(PageViewRollup.restaurant_id, PageViewRollup.date)
        .all()
    )
    sparklines: dict[int, dict[date, int]] = {}
    for site_id, day, total in sparkline_rows:
        sparklines.setdefault(site_id, {})[day] = int(total or 0)

    series = []
    day = scope.start
    while day <= scope.end:
        series.append({
            'date': day.isoformat(),
            'views': views_by_date.get(day, 0),
            'unique_visitors': uniques_by_date.get(day, 0),
        })
        day += timedelta(days=1)

    sparkline_days = []
    day = sparkline_start
    while day <= scope.end:
        sparkline_days.append(day)
        day += timedelta(days=1)

    by_site = []
    for site in sites:
        current = views_by_site.get(site.id, 0)
        before = previous_by_site.get(site.id, 0)
        by_site.append({
            'site_id': site.id,
            'name': site.name,
            'views': current,
            'unique_visitors': uniques_by_site.get(site.id, 0),
            'delta_pct': (
                round((current - before) / before * 100, 1) if before else None
            ),
            'sparkline': [sparklines.get(site.id, {}).get(d, 0) for d in sparkline_days],
        })

    return {
        'series': series,
        'by_site': by_site,
        'by_page_kind': [
            {'page_kind': kind, 'views': total} for kind, total in sorted(views_by_kind.items())
        ],
        'hour_profile': [
            {'hour': hour, 'views': views_by_hour.get(hour, 0)} for hour in range(24)
        ],
        'totals': {
            'views': sum(views_by_date.values()),
            'unique_visitors': sum(uniques_by_site.values()),
            'org_root_views': _org_root_views(organization_id, scope.start, scope.end),
        },
    }
