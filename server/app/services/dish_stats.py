"""Usage and satisfaction of catalogue dishes, as their detail page shows them.

Every query is batched over a list of dishes: the comparison view asks for
several at once, and the single-dish route is the one-element case.
"""
from datetime import date, timedelta

from ..extensions import db
from ..models import MIN_SITE_VOTES, DishCatalog, Menu, MenuItem, MenuVote, menu_vote_dishes
from ..utils.time import paris_today

HISTORY_WEEKS = 52
SERIES_DAYS = 90
MAX_BATCH = 5

# Catalogue figures default to the whole history: a dish served twice a year is
# not noise, and a fresh deployment would otherwise show nothing.
CATALOG_PERIODS = {'7d': 7, '30d': 30, '90d': 90, '12m': 365}

_WINDOWS = {'week': 7, 'month': 30, 'semester': 182, 'year': 365}


def period_cutoff(period: str | None) -> date | None:
    """First day the given window covers, or None for the whole history."""
    days = CATALOG_PERIODS.get(period or 'all')
    return paris_today() - timedelta(days=days) if days else None


def _window_sum(days: int, today: date):
    return db.func.coalesce(
        db.func.sum(db.case((Menu.date >= today - timedelta(days=days), 1), else_=0)), 0
    )


def _usage(dish_ids: list[int], today: date) -> dict[int, dict]:
    rows = (
        db.session.query(
            MenuItem.dish_id,
            *[_window_sum(days, today) for days in _WINDOWS.values()],
        )
        .join(Menu, Menu.id == MenuItem.menu_id)
        .filter(
            MenuItem.dish_id.in_(dish_ids),
            Menu.date >= today - timedelta(days=max(_WINDOWS.values())),
        )
        .group_by(MenuItem.dish_id)
        .all()
    )
    return {
        row[0]: dict(zip(_WINDOWS, (int(value) for value in row[1:]), strict=True))
        for row in rows
    }


def _history(dish_ids: list[int], today: date) -> dict[int, list[dict]]:
    week = db.func.date_trunc('week', Menu.date)
    rows = (
        db.session.query(MenuItem.dish_id, week, db.func.count(MenuItem.id))
        .join(Menu, Menu.id == MenuItem.menu_id)
        .filter(
            MenuItem.dish_id.in_(dish_ids),
            Menu.date >= today - timedelta(weeks=HISTORY_WEEKS),
        )
        .group_by(MenuItem.dish_id, week)
        .order_by(week)
        .all()
    )
    history: dict[int, list[dict]] = {}
    for dish_id, week_start, count in rows:
        history.setdefault(dish_id, []).append(
            {'week': week_start.strftime('%Y-%m-%d'), 'count': int(count)}
        )
    return history


def rating_distribution(
    dish_ids: list[int], cutoff: date | None = None
) -> dict[int, dict[str, int]]:
    query = (
        db.session.query(
            menu_vote_dishes.c.dish_id, MenuVote.rating, db.func.count(MenuVote.id)
        )
        .join(MenuVote, MenuVote.id == menu_vote_dishes.c.vote_id)
        .filter(menu_vote_dishes.c.dish_id.in_(dish_ids))
    )
    if cutoff:
        query = query.filter(MenuVote.date >= cutoff)
    rows = query.group_by(menu_vote_dishes.c.dish_id, MenuVote.rating).all()
    distribution: dict[int, dict[str, int]] = {}
    for dish_id, rating, count in rows:
        bucket = distribution.setdefault(dish_id, {'1': 0, '2': 0, '3': 0})
        bucket[str(int(rating))] = int(count)
    return distribution


def rating_series(dish_ids: list[int], today: date,
                  cutoff: date | None = None) -> dict[int, list[dict]]:
    rows = (
        db.session.query(
            menu_vote_dishes.c.dish_id,
            MenuVote.date,
            db.func.count(MenuVote.id),
            db.func.avg(MenuVote.rating),
        )
        .join(MenuVote, MenuVote.id == menu_vote_dishes.c.vote_id)
        .filter(
            menu_vote_dishes.c.dish_id.in_(dish_ids),
            MenuVote.date >= (cutoff or today - timedelta(days=SERIES_DAYS)),
        )
        .group_by(menu_vote_dishes.c.dish_id, MenuVote.date)
        .order_by(MenuVote.date)
        .all()
    )
    series: dict[int, list[dict]] = {}
    for dish_id, day, count, average in rows:
        series.setdefault(dish_id, []).append(
            {'date': day.isoformat(), 'votes': int(count), 'score': round(float(average), 2)}
        )
    return series


def _category_standing(categories: dict[int, int | None],
                       cutoff: date | None) -> dict[int, dict]:
    """Where a dish sits among the rated dishes of its own category."""
    wanted = {category for category in categories.values() if category}
    if not wanted:
        return {}

    query = (
        db.session.query(
            DishCatalog.category_id,
            menu_vote_dishes.c.dish_id,
            db.func.count(MenuVote.id),
            db.func.avg(MenuVote.rating),
        )
        .join(menu_vote_dishes, menu_vote_dishes.c.dish_id == DishCatalog.id)
        .join(MenuVote, MenuVote.id == menu_vote_dishes.c.vote_id)
        .filter(DishCatalog.category_id.in_(wanted))
    )
    if cutoff:
        query = query.filter(MenuVote.date >= cutoff)

    by_category: dict[int, list[tuple[int, float]]] = {}
    for category_id, dish_id, count, average in query.group_by(
        DishCatalog.category_id, menu_vote_dishes.c.dish_id
    ).all():
        if int(count) >= MIN_SITE_VOTES:
            by_category.setdefault(category_id, []).append((dish_id, float(average)))

    standing: dict[int, dict] = {}
    for scored in by_category.values():
        scored.sort(key=lambda row: -row[1])
        mean = sum(score for _, score in scored) / len(scored)
        for rank, (dish_id, score) in enumerate(scored, start=1):
            standing[dish_id] = {
                'rank': rank,
                'rated_in_category': len(scored),
                'gap_to_average': round(score - mean, 2),
            }
    return standing


def dish_stats(restaurant, dish_ids: list[int], period: str | None = None) -> dict[int, dict]:
    """Usage windows, weekly history and satisfaction, keyed by dish id.

    The period bounds the satisfaction block only: the usage windows are a scale
    of their own, and the weekly history is what the period would be read from.
    """
    if not dish_ids:
        return {}

    today = paris_today()
    cutoff = period_cutoff(period)
    usage = _usage(dish_ids, today)
    history = _history(dish_ids, today)
    distribution = rating_distribution(dish_ids, cutoff)
    series = rating_series(dish_ids, today, cutoff)

    votable = set(restaurant.get_votable_category_ids())
    categories = dict(
        db.session.query(DishCatalog.id, DishCatalog.category_id)
        .filter(DishCatalog.id.in_(dish_ids))
        .all()
    )
    standing = _category_standing(categories, cutoff)

    result = {}
    for dish_id in dish_ids:
        counts = distribution.get(dish_id, {'1': 0, '2': 0, '3': 0})
        votes = sum(counts.values())
        weighted = sum(int(rating) * count for rating, count in counts.items())
        result[dish_id] = {
            **{window: usage.get(dish_id, {}).get(window, 0) for window in _WINDOWS},
            'history': history.get(dish_id, []),
            'satisfaction': {
                'enabled': bool(restaurant.vote_enabled),
                'votable': categories.get(dish_id) in votable,
                'icon_preset': restaurant.vote_icon_preset,
                'votes': votes,
                'score': round(weighted / votes, 2) if votes >= MIN_SITE_VOTES else None,
                'distribution': counts,
                'series': series.get(dish_id, []),
                'standing': standing.get(dish_id),
            },
        }
    return result


def first_served(site_ids: list[int], start: date, end: date) -> dict[int, date]:
    """Dishes whose very first appearance in a menu falls inside the window.

    The first service is read over the whole history, not over the window: a
    dish served last month and again this week is not a novelty.
    """
    if not site_ids:
        return {}
    rows = (
        db.session.query(MenuItem.dish_id, db.func.min(Menu.date))
        .join(Menu, Menu.id == MenuItem.menu_id)
        .filter(Menu.restaurant_id.in_(site_ids))
        .group_by(MenuItem.dish_id)
        .all()
    )
    return {dish_id: day for dish_id, day in rows if start <= day <= end}
