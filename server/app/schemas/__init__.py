"""
MARIAM - Schemas Marshmallow centralisés.
Utilisés par Flask-Smorest pour la documentation OpenAPI et la validation.
"""
from .common import ErrorSchema, MessageSchema
from .auth import (
    LoginSchema, LoginResponseSchema,
    MFAVerifySchema, MFAVerifySetupSchema,
    ActivateAccountSchema, ResetPasswordSchema, ChangePasswordSchema,
    TokenRefreshSchema, UserSchema,
)
from .menus import (
    MenuSchema, MenuItemSchema, MenuListSchema,
    MenuCreateSchema, MenuUpdateSchema,
    WeekMenuSchema, PublicMenuSchema, PublicDayMenuSchema,
)
from .events import EventSchema, EventCreateSchema, EventUpdateSchema, EventListSchema
from .gallery import GalleryImageSchema, GalleryListSchema, GalleryTagSchema
from .users import UserAdminSchema, InviteSchema, InvitationSchema
from .restaurant import RestaurantSchema, RestaurantConfigSchema, RestaurantUpdateSchema
from .taxonomy import TaxonomySchema
from .notifications import SubscribeSchema, PreferencesUpdateSchema
from .imports import ImportUploadSchema, ImportPreviewSchema, ImportConfirmSchema

__all__ = [
    'ErrorSchema', 'MessageSchema',
    'LoginSchema', 'LoginResponseSchema', 'MFAVerifySchema', 'MFAVerifySetupSchema',
    'ActivateAccountSchema', 'ResetPasswordSchema', 'ChangePasswordSchema',
    'TokenRefreshSchema', 'UserSchema',
    'MenuSchema', 'MenuItemSchema', 'MenuListSchema',
    'MenuCreateSchema', 'MenuUpdateSchema',
    'WeekMenuSchema', 'PublicMenuSchema', 'PublicDayMenuSchema',
    'EventSchema', 'EventCreateSchema', 'EventUpdateSchema', 'EventListSchema',
    'GalleryImageSchema', 'GalleryListSchema', 'GalleryTagSchema',
    'UserAdminSchema', 'InviteSchema', 'InvitationSchema',
    'RestaurantSchema', 'RestaurantConfigSchema', 'RestaurantUpdateSchema',
    'TaxonomySchema',
    'SubscribeSchema', 'PreferencesUpdateSchema',
    'ImportUploadSchema', 'ImportPreviewSchema', 'ImportConfirmSchema',
]
