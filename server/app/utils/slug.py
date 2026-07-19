"""URL slug helpers for tenant paths (organizations and restaurants)."""
import re

# Slugs that would collide with app routes or reserved subpaths.
RESERVED_SLUGS = frozenset({
    'menu', 'admin', 'login', 'logout', 'notifications', 'activate',
    'reset-password', 'setup', 'install', 'api', 'v1', 'public', 'org',
    'assets', 'static', 'health', 'robots', 'sitemap', 'docs', 'www',
})

_SLUG_RE = re.compile(r'^[a-z0-9]+(?:-[a-z0-9]+)*$')


def normalize_slug(value: str) -> str:
    """Lowercase, replace runs of non-alphanumerics with a single dash, trim dashes."""
    value = (value or '').strip().lower()
    value = re.sub(r'[^a-z0-9]+', '-', value)
    return value.strip('-')


def is_valid_slug(slug: str) -> bool:
    """A slug is URL-safe, non-empty, not reserved, and not purely numeric."""
    return (
        bool(slug)
        and slug not in RESERVED_SLUGS
        and bool(_SLUG_RE.match(slug))
        and not slug.isdigit()
    )
