# The route modules are imported for the routes they register on user_bp.
from . import account, passkeys, password, totp
from .blueprint import user_bp

__all__ = ['user_bp']
