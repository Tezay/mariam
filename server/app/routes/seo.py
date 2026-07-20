"""Public HTML shell with server-injected SEO, plus a per-host sitemap.

Serves the crawlable public pages (menu) with per-restaurant meta and JSON-LD,
and a ``sitemap.xml`` scoped to the organization of the current host. Registered
as a plain Flask blueprint (not the flask-smorest ``Api``) so it returns raw
HTML/XML outside the ``/v1`` namespace and stays out of the OpenAPI docs.
"""
from collections import OrderedDict
from html import escape

from flask import Blueprint, Response, request

from ..models import Menu, Restaurant
from ..models.category import MenuCategory
from ..models.menu import MenuItem
from ..services.seo import get_base_shell, render_public_shell
from ..utils.time import paris_today
from .public import resolve_organization, resolve_restaurant

seo_bp = Blueprint('seo', __name__)

# SPA pages that must never receive an SEO shell (they are private app routes).
# nginx serves these statically in prod; this guard also covers dev/direct hits.
_PRIVATE_PREFIXES = frozenset(
    {'admin', 'org', 'login', 'activate', 'reset-password', 'notifications'}
)

_SHELL_MAX_AGE = 'public, max-age=300'


def _published_menu_today(restaurant: Restaurant) -> Menu | None:
    return Menu.query.filter_by(
        restaurant_id=restaurant.id, date=paris_today(), status='published'
    ).first()


def _is_mono_site(org) -> bool:
    return (
        Restaurant.query.filter_by(organization_id=org.id, is_active=True).count() == 1
    )


def _menu_url(host: str, restaurant: Restaurant, mono_site: bool) -> str:
    if mono_site:
        return f'https://{host}/menu'
    return f'https://{host}/{restaurant.slug}/menu'


def _menu_sections(restaurant: Restaurant, menu: Menu) -> list[dict]:
    """Schema.org MenuSection list built from the published dishes of the day."""
    labels = {c.id: c.label for c in MenuCategory.query.filter_by(restaurant_id=restaurant.id).all()}
    items = MenuItem.query.filter_by(menu_id=menu.id).order_by(MenuItem.order).all()
    by_cat: OrderedDict[str, list[str]] = OrderedDict()
    for item in items:
        if not item.dish:
            continue
        by_cat.setdefault(labels.get(item.category_id, 'Menu'), []).append(item.dish.name)
    return [
        {
            '@type': 'MenuSection',
            'name': label,
            'hasMenuItem': [{'@type': 'MenuItem', 'name': n} for n in names],
        }
        for label, names in by_cat.items()
    ]


def _restaurant_jsonld(restaurant: Restaurant, url: str, menu: Menu | None) -> dict:
    data: dict = {
        '@context': 'https://schema.org',
        '@type': 'Restaurant',
        'name': restaurant.name,
        'url': url,
        'servesCuisine': 'Restauration universitaire',
    }
    if restaurant.logo_url:
        data['image'] = restaurant.logo_url
    if restaurant.address_label:
        data['address'] = restaurant.address_label
    if restaurant.phone:
        data['telephone'] = restaurant.phone
    if menu:
        sections = _menu_sections(restaurant, menu)
        if sections:
            data['hasMenu'] = {
                '@type': 'Menu',
                'name': f'Menu du {menu.date.strftime("%d/%m/%Y")}',
                'hasMenuSection': sections,
            }
    return data


def _description(restaurant: Restaurant, org, menu: Menu | None) -> str:
    if menu:
        items = MenuItem.query.filter_by(menu_id=menu.id).order_by(MenuItem.order).all()
        names = [item.dish.name for item in items if item.dish][:4]
        if names:
            return f'Menu du jour au {restaurant.name} : {", ".join(names)}. Consultez le menu complet.'
    return (
        f'Consultez le menu du {restaurant.name} ({org.name}) : plats du jour, '
        'horaires et informations pratiques.'
    )


def _html_response(html: str) -> Response:
    resp = Response(html, mimetype='text/html')
    resp.headers['Cache-Control'] = _SHELL_MAX_AGE
    return resp


def _render_restaurant(restaurant: Restaurant, org) -> Response:
    host = request.host
    mono_site = _is_mono_site(org)
    canonical = _menu_url(host, restaurant, mono_site)
    menu = _published_menu_today(restaurant)
    html = render_public_shell(
        get_base_shell(),
        title=f'Menu {restaurant.name} — {org.name}',
        description=_description(restaurant, org, menu),
        canonical=canonical,
        site_name=org.name,
        image_url=restaurant.logo_url,
        jsonld=_restaurant_jsonld(restaurant, canonical, menu),
    )
    return _html_response(html)


def _render_org(org) -> Response:
    """Organization-level shell for a multi-site root (list of restaurants)."""
    host = request.host
    html = render_public_shell(
        get_base_shell(),
        title=f'{org.name} — Nos restaurants',
        description=f'Découvrez les menus des restaurants de {org.name}.',
        canonical=f'https://{host}/',
        site_name=org.name,
    )
    return _html_response(html)


def _passthrough() -> Response:
    """Return the base shell unchanged (private route or unresolved tenant)."""
    return _html_response(get_base_shell())


def _render_for_path(path: str) -> Response:
    org = resolve_organization()
    if not org:
        return _passthrough()

    segments = [s for s in path.split('/') if s]
    first = segments[0] if segments else ''

    # Root or the legacy mono-site menu path.
    if first in ('', 'menu'):
        sites = Restaurant.query.filter_by(organization_id=org.id, is_active=True).all()
        if len(sites) == 1:
            return _render_restaurant(sites[0], org)
        return _render_org(org)

    # Private SPA routes keep the untouched shell.
    if first in _PRIVATE_PREFIXES:
        return _passthrough()

    # Otherwise the first segment is a restaurant slug (e.g. /efrei or /efrei/menu).
    restaurant = resolve_restaurant(first)
    if restaurant:
        return _render_restaurant(restaurant, org)
    return _passthrough()


@seo_bp.route('/sitemap.xml')
def sitemap() -> Response:
    org = resolve_organization()
    host = request.host
    urls: list[str] = []
    if org:
        sites = (
            Restaurant.query.filter_by(organization_id=org.id, is_active=True)
            .order_by(Restaurant.name)
            .all()
        )
        if len(sites) == 1:
            urls.append(f'https://{host}/menu')
        elif sites:
            urls.append(f'https://{host}/')
            urls.extend(f'https://{host}/{s.slug}/menu' for s in sites if s.slug)
    body = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        + ''.join(f'<url><loc>{escape(u)}</loc></url>' for u in urls)
        + '</urlset>'
    )
    resp = Response(body, mimetype='application/xml')
    resp.headers['Cache-Control'] = _SHELL_MAX_AGE
    return resp


@seo_bp.route('/')
def shell_root() -> Response:
    return _render_for_path('')


@seo_bp.route('/<path:subpath>')
def shell_path(subpath: str) -> Response:
    return _render_for_path(subpath)
