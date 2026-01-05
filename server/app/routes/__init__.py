"""
Routes MARIAM - Exports centralisés.
"""
from .auth import auth_bp
from .admin import admin_bp
from .menus import menus_bp
from .events import events_bp
from .public import public_bp
from .csv_import import csv_import_bp

__all__ = [
    'auth_bp',
    'admin_bp',
    'menus_bp',
    'events_bp',
    'public_bp',
    'csv_import_bp'
]
