"""Per-host sitemap of the public pages.

Registered as a plain Flask blueprint (not the flask-smorest ``Api``) so it
returns raw XML outside the ``/v1`` namespace and stays out of the OpenAPI docs.
"""
from html import escape

from flask import Blueprint, Response, request

from ..models import Restaurant
from .public import resolve_organization

sitemap_bp = Blueprint('sitemap', __name__)

_MAX_AGE = 'public, max-age=300'


@sitemap_bp.route('/sitemap.xml')
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
    resp.headers['Cache-Control'] = _MAX_AGE
    return resp
