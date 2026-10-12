"""Public URL helpers."""
import os

DEFAULT_FRONTEND_URL = 'http://localhost:5173'


def frontend_base_url() -> str:
    """First origin of ``FRONTEND_URL``, which CORS lets carry several."""
    value = os.environ.get('FRONTEND_URL', DEFAULT_FRONTEND_URL)
    return value.split(',')[0].strip() or DEFAULT_FRONTEND_URL


def api_base_url() -> str:
    """``API_URL`` as the front end reads it: absolute, or a path on its own origin."""
    value = os.environ.get('API_URL', '').strip().rstrip('/') or '/v1'
    return value if '://' in value else f'{frontend_base_url()}{value}'
