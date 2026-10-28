"""Public URL helpers."""
import os
from datetime import date

DEFAULT_FRONTEND_URL = 'http://localhost:5173'


def frontend_base_url() -> str:
    """First origin of ``FRONTEND_URL``, which CORS lets carry several."""
    value = os.environ.get('FRONTEND_URL', DEFAULT_FRONTEND_URL)
    return value.split(',')[0].strip() or DEFAULT_FRONTEND_URL


def api_base_url() -> str:
    """``API_URL`` as the front end reads it: absolute, or a path on its own origin."""
    value = os.environ.get('API_URL', '').strip().rstrip('/') or '/v1'
    return value if '://' in value else f'{frontend_base_url()}{value}'


def public_page_path(restaurant, day: date | None = None) -> str:
    """A site's public page, on its organization's host; a single-site one redirects it to `/`."""
    path = f'/{restaurant.slug}'
    return f'{path}?date={day.isoformat()}' if day else path
