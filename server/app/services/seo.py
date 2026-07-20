"""Server-side SEO for the public menu pages.

Crawlers and Open Graph scrapers (WhatsApp, Discord, Twitter) do not run the
SPA's JavaScript, so per-restaurant metadata has to be present in the initial
HTML. This module injects a `<head>` meta block and Schema.org JSON-LD into the
SPA shell. The base shell is the frontend's own `index.html`, fetched from the
frontend container at runtime and cached in-process, so builds stay decoupled.
"""
import json
import os
import re
import time
from html import escape

import requests

# Base index.html fetched from the frontend container, cached in-process. It
# only changes on a frontend deploy (new container = fresh process), so a short
# TTL is enough to pick up dev changes while avoiding an internal hop per request.
_shell_html: str | None = None
_shell_fetched_at: float = 0.0
_SHELL_TTL_SECONDS = 60.0

_FALLBACK_SHELL = (
    '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">'
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
    '</head><body><div id="root"></div></body></html>'
)

_TITLE_RE = re.compile(r'<title>.*?</title>', re.IGNORECASE | re.DOTALL)
_DESCRIPTION_RE = re.compile(r'<meta\s+name=["\']description["\'][^>]*>', re.IGNORECASE)


def get_base_shell() -> str:
    """Return the frontend ``index.html``, cached in-process for a short TTL.

    Fetched from ``FRONTEND_ORIGIN`` (the internal frontend container URL). Any
    failure returns the last cached copy, or a minimal fallback shell, so a page
    always renders.
    """
    global _shell_html, _shell_fetched_at
    now = time.monotonic()
    if _shell_html is not None and (now - _shell_fetched_at) < _SHELL_TTL_SECONDS:
        return _shell_html

    origin = os.environ.get('FRONTEND_ORIGIN', 'http://frontend')
    try:
        resp = requests.get(f'{origin}/index.html', timeout=3)
        resp.raise_for_status()
        _shell_html = resp.text
        _shell_fetched_at = now
        return resp.text
    except requests.RequestException:
        return _shell_html if _shell_html is not None else _FALLBACK_SHELL


def _meta_block(*, title: str, description: str, canonical: str,
                image_url: str | None, site_name: str) -> list[str]:
    """Build the injected head tags (title, description, canonical, OG, Twitter)."""
    tags = [
        f'<title>{escape(title)}</title>',
        f'<meta name="description" content="{escape(description, quote=True)}">',
        f'<link rel="canonical" href="{escape(canonical, quote=True)}">',
        '<meta property="og:type" content="website">',
        f'<meta property="og:site_name" content="{escape(site_name, quote=True)}">',
        f'<meta property="og:title" content="{escape(title, quote=True)}">',
        f'<meta property="og:description" content="{escape(description, quote=True)}">',
        f'<meta property="og:url" content="{escape(canonical, quote=True)}">',
        '<meta name="twitter:card" content="summary_large_image">',
        f'<meta name="twitter:title" content="{escape(title, quote=True)}">',
        f'<meta name="twitter:description" content="{escape(description, quote=True)}">',
    ]
    if image_url:
        img = escape(image_url, quote=True)
        tags.append(f'<meta property="og:image" content="{img}">')
        tags.append(f'<meta name="twitter:image" content="{img}">')
    return tags


def render_public_shell(base_html: str, *, title: str, description: str, canonical: str,
                        site_name: str, image_url: str | None = None,
                        jsonld: dict | None = None) -> str:
    """Inject SEO meta and optional JSON-LD into the base SPA shell.

    Drops the placeholder title/description from ``index.html`` and injects a
    per-restaurant meta block (and a Schema.org script) just before ``</head>``.
    All dynamic values are HTML-escaped.
    """
    head_tags = _meta_block(
        title=title, description=description, canonical=canonical,
        image_url=image_url, site_name=site_name,
    )
    if jsonld:
        # Escape the closing-tag sequence so the payload cannot break out of the
        # <script> context.
        payload = json.dumps(jsonld, ensure_ascii=False).replace('</', '<\\/')
        head_tags.append(f'<script type="application/ld+json">{payload}</script>')

    injection = '\n'.join(head_tags)
    html = _DESCRIPTION_RE.sub('', _TITLE_RE.sub('', base_html, count=1), count=1)
    if '</head>' in html:
        return html.replace('</head>', f'{injection}\n</head>', 1)
    return html + injection
