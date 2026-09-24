"""Cleaning the rich text the dashboard sends before it reaches a public page.

The menu pages render event descriptions as markup, so this allowlist is the
only thing between an author and a script tag.
"""
import nh3

# What Tiptap's StarterKit and Link extension can emit; anything wider would be
# markup the editor itself never produces.
_TAGS = {
    'p', 'br', 'strong', 'em', 's', 'code', 'pre', 'blockquote',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'hr', 'a',
}

_ATTRIBUTES = {'a': {'href', 'title'}}


def sanitize_html(value: str | None) -> str | None:
    """Strip everything outside the allowlist; None and empty pass through."""
    if not value:
        return value
    return nh3.clean(value, tags=_TAGS, attributes=_ATTRIBUTES)
