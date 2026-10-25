"""One page of a list, with the links to the others (RFC 8288)."""
from math import ceil
from urllib.parse import urlencode

from flask import request


def _page_url(page: int, per_page: int) -> str:
    args = request.args.to_dict(flat=False)
    args.update(page=[str(page)], per_page=[str(per_page)])
    return f'{request.base_url}?{urlencode(args, doseq=True)}'


def paginate(items, page: int, per_page: int) -> tuple[dict, dict[str, str]]:
    """The `{items, total_count}` body of a page, and its `Link` header.

    `items` is a list, or a query that is counted and sliced in the database.
    """
    if isinstance(items, list):
        total = len(items)
        start = (page - 1) * per_page
        page_items = items[start:start + per_page]
    else:
        total = items.count()
        page_items = items.offset((page - 1) * per_page).limit(per_page).all()
    last = max(1, ceil(total / per_page))
    pages = {'first': 1, 'last': last}
    if page > 1:
        pages['prev'] = min(page - 1, last)
    if page < last:
        pages['next'] = page + 1
    link = ', '.join(f'<{_page_url(number, per_page)}>; rel="{rel}"' for rel, number in pages.items())
    return {'items': page_items, 'total_count': total}, {'Link': link}
