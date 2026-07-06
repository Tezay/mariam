"""
Routes MARIAM - Exports centralisés.
"""
from .audit import audit_bp
from .auth import auth_bp
from .catalog import catalog_bp
from .categories import categories_bp
from .closures import closures_bp
from .events import events_bp
from .imports import imports_bp
from .inbox import inbox_bp
from .menus import menus_bp
from .notifications import notifications_bp
from .restaurant import restaurant_bp
from .taxonomy import taxonomy_bp
from .users import users_bp

__all__ = [
    'auth_bp',
    'menus_bp',
    'categories_bp',
    'catalog_bp',
    'events_bp',
    'restaurant_bp',
    'taxonomy_bp',
    'users_bp',
    'audit_bp',
    'inbox_bp',
    'imports_bp',
    'notifications_bp',
    'closures_bp',
]
