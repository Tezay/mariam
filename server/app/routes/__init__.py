"""
Routes MARIAM - Exports centralisés.
"""
from .auth import auth_bp
from .menus import menus_bp
from .events import events_bp
from .gallery import gallery_bp
from .restaurant import restaurant_bp
from .taxonomy import taxonomy_bp
from .users import users_bp
from .audit import audit_bp
from .imports import imports_bp
from .notifications import notifications_bp

__all__ = [
    'auth_bp',
    'menus_bp',
    'events_bp',
    'gallery_bp',
    'restaurant_bp',
    'taxonomy_bp',
    'users_bp',
    'audit_bp',
    'imports_bp',
    'notifications_bp',
]
