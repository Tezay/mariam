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
from ..models import DishCatalog, ExceptionalClosure, Menu, MenuCategory, MenuItem, Restaurant
from ..routes.helpers import accessible_restaurant_ids
from ..utils.time import PARIS_TZ, paris_today, parse_iso_date, utc_naive_to_paris
from .redis_client import get_redis

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


def _closed_days(scope: Scope) -> dict[int, list[tuple[date, date]]]:
    rows = (
        ExceptionalClosure.query.filter(
            ExceptionalClosure.restaurant_id.in_(scope.site_ids),
            ExceptionalClosure.is_active,
            ExceptionalClosure.start_date <= scope.end,
            ExceptionalClosure.end_date >= scope.start,
        )
        .with_entities(
            ExceptionalClosure.restaurant_id,
            ExceptionalClosure.start_date,
            ExceptionalClosure.end_date,
        )
        .all()
    )
    closures: dict[int, list[tuple[date, date]]] = {}
    for restaurant_id, start, end in rows:
        closures.setdefault(restaurant_id, []).append((start, end))
    return closures


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
    closures = _closed_days(scope)
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


def overview(scope: Scope) -> dict:
    """Headline KPIs, org trend and per-site table for the dashboard home.

    Traffic and satisfaction are not collected yet; their keys are present and
    null so the frontend contract does not change when they land.
    """
    sites = _sites_in_scope(scope.site_ids)
    current = publication_stats(scope, include_matrix=False)
    previous = publication_stats(scope.previous(), include_matrix=False)

    current_summary = current['summary']
    previous_summary = previous['summary']
    rates_by_site = {row['site_id']: row for row in current['sites']}
    last_published = _last_published_at(scope.site_ids) if scope.site_ids else {}

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
            'views': None,
            'unique_visitors': None,
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
            'views': None,
            'views_sparkline': None,
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
            'views': None,
            'unique_visitors': None,
            'satisfaction': None,
            'participation_rate': None,
        },
        'trend': trend,
        'sites': site_rows,
        'top_dishes': None,
        'flop_dishes': None,
    }
