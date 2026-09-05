"""Whether a site serves on a given day, and the state of that day's menu.

A day without a menu is only a gap when the site was meant to open: weekly
service days and exceptional closures both have to be consulted before calling
a menu missing.
"""
from datetime import date

from ..models import ExceptionalClosure

ClosureRanges = dict[int, list[tuple[date, date]]]

MENU_STATUSES = ('published', 'draft', 'missing', 'closed')


def closures_by_site(site_ids, start: date, end: date) -> ClosureRanges:
    """Active closure ranges overlapping the window, grouped by site."""
    if not site_ids:
        return {}
    rows = (
        ExceptionalClosure.query.filter(
            ExceptionalClosure.restaurant_id.in_(site_ids),
            ExceptionalClosure.is_active,
            ExceptionalClosure.start_date <= end,
            ExceptionalClosure.end_date >= start,
        )
        .with_entities(
            ExceptionalClosure.restaurant_id,
            ExceptionalClosure.start_date,
            ExceptionalClosure.end_date,
        )
        .all()
    )
    closures: ClosureRanges = {}
    for restaurant_id, closure_start, closure_end in rows:
        closures.setdefault(restaurant_id, []).append((closure_start, closure_end))
    return closures


def is_closed(day: date, ranges: list[tuple[date, date]]) -> bool:
    return any(start <= day <= end for start, end in ranges)


def is_open_on(restaurant, day: date, ranges: list[tuple[date, date]]) -> bool:
    if day.weekday() not in set(restaurant.get_service_days()):
        return False
    return not is_closed(day, ranges)


def menu_status(restaurant, day: date, menu, ranges: list[tuple[date, date]]) -> str:
    """One of MENU_STATUSES, telling a closed day apart from a forgotten menu."""
    if not is_open_on(restaurant, day, ranges):
        return 'closed'
    if menu is None:
        return 'missing'
    return 'published' if menu.status == 'published' else 'draft'
