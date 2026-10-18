"""One page of a list, with the links to the others (RFC 8288)."""
from math import ceil
from urllib.parse import urlencode

from flask import request


def _page_url(page: int, per_page: int) -> str:
    args = request.args.to_dict(flat=False)
    args.update(page=[str(page)], per_page=[str(per_page)])
    return f'{request.base_url}?{urlencode(args, doseq=True)}'


def paginate(items: list, page: int, per_page: int) -> tuple[dict, dict[str, str]]:
    """The `{items, total_count}` body of a page, and its `Link` header."""
    total = len(items)
    last = max(1, ceil(total / per_page))
    pages = {'first': 1, 'last': last}
    if page > 1:
        pages['prev'] = min(page - 1, last)
    if page < last:
        pages['next'] = page + 1
    link = ', '.join(f'<{_page_url(number, per_page)}>; rel="{rel}"' for rel, number in pages.items())
    start = (page - 1) * per_page
    return {'items': items[start:start + per_page], 'total_count': total}, {'Link': link}
