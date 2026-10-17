"""Which organization serves a host name."""
import os

from ..models import Organization


def org_slug_from_host(host: str | None) -> str | None:
    """Production: ``<org>.<BASE_DOMAIN>``. Development: ``<org>.localhost``.

    A bare localhost, the apex or any other domain falls back to
    ``DEFAULT_ORG_SLUG``, which serves a single-organization instance.
    """
    default = os.environ.get('DEFAULT_ORG_SLUG')
    if not host:
        return default
    host = host.split(':')[0].lower()
    base = os.environ.get('BASE_DOMAIN', 'mariam.app')
    if host in ('localhost', '127.0.0.1'):
        return default
    if host.endswith('.localhost'):
        return host[: -len('.localhost')].split('.')[-1]
    if host.endswith('.' + base):
        return host[: -len('.' + base)].split('.')[-1]
    return default


def organization_for_host(host: str | None) -> Organization | None:
    slug = org_slug_from_host(host)
    if not slug:
        return None
    return Organization.query.filter_by(slug=slug, is_active=True).first()
