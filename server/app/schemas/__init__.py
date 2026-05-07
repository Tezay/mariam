"""
MARIAM - Schemas Marshmallow centralisés.
Utilisés par Flask-Smorest pour la documentation OpenAPI et la validation.
"""
from .auth import (
    ActivateAccountSchema,
    ChangePasswordSchema,
    LoginResponseSchema,
    LoginSchema,
    MFAVerifySchema,
    MFAVerifySetupSchema,
    ResetPasswordSchema,
    TokenRefreshSchema,
    UserSchema,
)
from .common import ErrorSchema, MessageSchema
from .events import EventCreateSchema, EventListSchema, EventSchema, EventUpdateSchema
from .gallery import GalleryImageSchema, GalleryListSchema, GalleryTagSchema
from .imports import ImportConfirmSchema, ImportPreviewSchema, ImportUploadSchema
from .menus import (
    MenuCreateSchema,
    MenuItemSchema,
    MenuListSchema,
    MenuSchema,
    MenuUpdateSchema,
    PublicDayMenuSchema,
    PublicMenuSchema,
    WeekMenuSchema,
)
from .notifications import PreferencesUpdateSchema, SubscribeSchema
from .restaurant import RestaurantConfigSchema, RestaurantSchema, RestaurantUpdateSchema
from .taxonomy import TaxonomySchema
from .users import InvitationSchema, InviteSchema, UserAdminSchema

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
