from marshmallow import Schema, fields, EXCLUDE


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
    email = fields.Email(required=True, description="Email address to invite")
    role = fields.Str(description="Role: 'admin', 'editor', or 'reader'")


class InvitationSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    token = fields.Str()
    email = fields.Email()
    role = fields.Str()
    expires_at = fields.Str()
