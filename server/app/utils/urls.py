"""Public URL helpers."""
import os

DEFAULT_FRONTEND_URL = 'http://localhost:5173'


def frontend_base_url() -> str:
    """First origin of ``FRONTEND_URL``, which CORS lets carry several."""
    value = os.environ.get('FRONTEND_URL', DEFAULT_FRONTEND_URL)
    return value.split(',')[0].strip() or DEFAULT_FRONTEND_URL
