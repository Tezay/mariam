from marshmallow import EXCLUDE, Schema, fields

from .common import NormalizedEmail


class UiPreferencesSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    tour_done = fields.Bool()
    tour_catalog_done = fields.Bool()
    tour_stats_done = fields.Bool()


class UserAdminSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    id = fields.Int(dump_only=True)
    email = fields.Email()
    username = fields.Str(allow_none=True)
    role = fields.Str(description="'admin', 'editor', or 'reader'")
    mfa_enabled = fields.Bool()
    is_active = fields.Bool()
    restaurant_id = fields.Int(allow_none=True)
    created_at = fields.Str(dump_only=True)
    last_login = fields.Str(dump_only=True, allow_none=True)


class UserUpdateSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    username = fields.Str()
    role = fields.Str(description="'admin', 'editor', or 'reader'")
    is_active = fields.Bool()
    restaurant_id = fields.Int(allow_none=True)


class InviteSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    email = NormalizedEmail(
        allow_none=True,
        load_default=None,
        description="Suggested address; the invitee may enter another at activation",
    )
    role = fields.Str(description="Role: 'admin', 'editor', or 'reader'")


class InvitationSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    id = fields.Int()
    token = fields.Str()
    email = fields.Email(allow_none=True)
    role = fields.Str()
    expires_at = fields.Str()
    created_by_name = fields.Str(allow_none=True)
