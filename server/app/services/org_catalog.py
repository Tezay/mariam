"""The dishes an organization's sites serve, pooled by name.

Read-only. Sites own their dishes; nothing here writes to them, and the pool is
computed on each request rather than stored.
"""
from collections import Counter

from sqlalchemy import func

from ..extensions import db
from ..models import (
    MIN_SITE_VOTES,
    DishCatalog,
    Menu,
    MenuItem,
    MenuVote,
    Restaurant,
    menu_vote_dishes,
)
from ..utils.time import paris_today
from .dish_stats import period_cutoff, rating_distribution, rating_series

SORTS = ('usage', 'sites', 'name', 'photos', 'score')


def normalized_name_sql(col):
    """Grouping key for the pool: case and inner spacing folded.

    No unaccent: the extension is not guaranteed on the target database, so two
    spellings differing only by an accent stay two entries.
    """
    return func.lower(func.regexp_replace(func.btrim(col), r'\s+', ' ', 'g'))


def _usage_counts(org_id: int, cutoff=None) -> dict[int, int]:
    query = (
        db.session.query(MenuItem.dish_id, func.count(MenuItem.id))
        .join(Menu, Menu.id == MenuItem.menu_id)
        .join(Restaurant, Restaurant.id == Menu.restaurant_id)
        .filter(Restaurant.organization_id == org_id)
    )
    if cutoff:
        query = query.filter(Menu.date >= cutoff)
    return {dish_id: int(count) for dish_id, count in query.group_by(MenuItem.dish_id).all()}


def _vote_totals(org_id: int, cutoff=None) -> dict[int, tuple[int, float]]:
    """Vote count and rating sum per dish, so group means stay weighted."""
    query = (
        db.session.query(
            menu_vote_dishes.c.dish_id,
            func.count(MenuVote.id),
            func.sum(MenuVote.rating),
        )
        .join(MenuVote, MenuVote.id == menu_vote_dishes.c.vote_id)
        .filter(MenuVote.organization_id == org_id)
    )
    if cutoff:
        query = query.filter(MenuVote.date >= cutoff)
    return {
        dish_id: (int(count), float(total or 0))
        for dish_id, count, total in query.group_by(menu_vote_dishes.c.dish_id).all()
    }


def _sort(pooled: list[dict], sort: str, ascending: bool) -> None:
    """Sorts in place. Ties break on the name so paging stays stable."""
    way = 1 if ascending else -1

    if sort == 'name':
        pooled.sort(key=lambda row: row['display_name'].lower(), reverse=not ascending)
        return

    if sort == 'score':
        # Unrated dishes go last whichever way the sort points.
        pooled.sort(
            key=lambda row: (
                row['score'] is None,
                way * (row['score'] or 0),
                row['display_name'].lower(),
            )
        )
        return

    def measure(row: dict) -> float:
        if sort == 'sites':
            return row['site_count']
        if sort == 'photos':
            return row['photo_count'] / row['site_count']
        return row['usage_count']

    pooled.sort(key=lambda row: (way * measure(row), row['display_name'].lower()))


def pooled_dishes(org_id: int, q: str = '', sort: str = 'usage', order: str | None = None,
                  period: str | None = None, page: int = 1, per_page: int = 24) -> dict:
    """Dishes of every site of the organization, grouped by normalised name."""
    empty = {'dishes': [], 'total': 0, 'page': page, 'per_page': per_page, 'has_more': False}
    if not org_id:
        return empty

    rows = (
        db.session.query(
            normalized_name_sql(DishCatalog.name),
            DishCatalog.id,
            DishCatalog.name,
            DishCatalog.image_url,
            Restaurant.id,
            Restaurant.name,
        )
        .join(Restaurant, Restaurant.id == DishCatalog.restaurant_id)
        .filter(Restaurant.organization_id == org_id)
        .all()
    )
    if not rows:
        return empty

    cutoff = period_cutoff(period)
    usage = _usage_counts(org_id, cutoff)
    votes = _vote_totals(org_id, cutoff)

    groups: dict[str, dict] = {}
    for normalized, dish_id, name, image_url, site_id, site_name in rows:
        group = groups.setdefault(normalized, {
            'names': Counter(),
            'image_url': None,
            'usage_count': 0,
            'vote_count': 0,
            'rating_sum': 0.0,
            'sites': [],
        })
        group['names'][name] += 1
        group['image_url'] = group['image_url'] or image_url
        group['usage_count'] += usage.get(dish_id, 0)
        count, rating_sum = votes.get(dish_id, (0, 0.0))
        group['vote_count'] += count
        group['rating_sum'] += rating_sum
        group['sites'].append({
            'site_id': site_id,
            'site_name': site_name,
            'dish_id': dish_id,
            'has_image': bool(image_url),
        })

    pooled = []
    for normalized, group in groups.items():
        sites = sorted(group['sites'], key=lambda site: site['site_name'])
        count = group['vote_count']
        pooled.append({
            'normalized_name': normalized,
            'display_name': group['names'].most_common(1)[0][0],
            'image_url': group['image_url'],
            'site_count': len(sites),
            'photo_count': sum(1 for site in sites if site['has_image']),
            'usage_count': group['usage_count'],
            'votes': count,
            'score': round(group['rating_sum'] / count, 2) if count >= MIN_SITE_VOTES else None,
            'sites': sites,
        })

    needle = ' '.join(q.strip().lower().split())
    if needle:
        pooled = [row for row in pooled if needle in row['normalized_name']]

    chosen = sort if sort in SORTS else 'usage'
    # A name reads A to Z by default; a measure reads best-first.
    _sort(pooled, chosen, (order or ('asc' if chosen == 'name' else 'desc')) == 'asc')

    total = len(pooled)
    offset = max(0, (page - 1) * per_page)
    return {
        'dishes': pooled[offset:offset + per_page],
        'total': total,
        'page': page,
        'per_page': per_page,
        'has_more': offset + per_page < total,
    }


def dish_group(org_id: int, normalized_name: str) -> dict | None:
    """One pooled dish: the organization-wide aggregate, then each site's own figures."""
    rows = (
        db.session.query(
            DishCatalog.id,
            DishCatalog.name,
            DishCatalog.image_url,
            Restaurant.id,
            Restaurant.name,
        )
        .join(Restaurant, Restaurant.id == DishCatalog.restaurant_id)
        .filter(
            Restaurant.organization_id == org_id,
            normalized_name_sql(DishCatalog.name) == normalized_name,
        )
        .all()
    )
    if not rows:
        return None

    today = paris_today()
    dish_ids = [row[0] for row in rows]
    usage = _usage_counts(org_id)
    distribution = rating_distribution(dish_ids)
    series = rating_series(dish_ids, today)

    names: Counter = Counter()
    totals = {'1': 0, '2': 0, '3': 0}
    sites = []
    for dish_id, name, image_url, site_id, site_name in rows:
        names[name] += 1
        counts = distribution.get(dish_id, {'1': 0, '2': 0, '3': 0})
        for rating, count in counts.items():
            totals[rating] += count
        votes = sum(counts.values())
        weighted = sum(int(rating) * count for rating, count in counts.items())
        sites.append({
            'site_id': site_id,
            'site_name': site_name,
            'dish_id': dish_id,
            'has_image': bool(image_url),
            'usage_count': usage.get(dish_id, 0),
            'votes': votes,
            'score': round(weighted / votes, 2) if votes >= MIN_SITE_VOTES else None,
        })

    # One curve for the whole group: a site's day is merged with the others',
    # weighted by how many votes it carries.
    by_day: dict[str, list[int]] = {}
    for dish_id in dish_ids:
        for point in series.get(dish_id, []):
            day = by_day.setdefault(point['date'], [0, 0])
            day[0] += point['votes']
            day[1] += round(point['score'] * point['votes'])

    group_votes = sum(totals.values())
    group_weighted = sum(int(rating) * count for rating, count in totals.items())
    return {
        'normalized_name': normalized_name,
        'display_name': names.most_common(1)[0][0],
        'image_url': next((row[2] for row in rows if row[2]), None),
        'site_count': len(sites),
        'photo_count': sum(1 for site in sites if site['has_image']),
        'usage_count': sum(site['usage_count'] for site in sites),
        'votes': group_votes,
        'score': (
            round(group_weighted / group_votes, 2) if group_votes >= MIN_SITE_VOTES else None
        ),
        'distribution': totals,
        'series': [
            {'date': day, 'votes': votes, 'score': round(total / votes, 2)}
            for day, (votes, total) in sorted(by_day.items())
            if votes
        ],
        'sites': sorted(sites, key=lambda site: site['site_name']),
    }
