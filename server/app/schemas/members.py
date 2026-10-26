from marshmallow import EXCLUDE, Schema, ValidationError, fields, validate, validates_schema

from ..models import User
from .common import NamedRefSchema, NormalizedEmail

SITE_ROLES = (User.ROLE_ADMIN, User.ROLE_EDITOR, User.ROLE_READER)


class MemberSchema(Schema):
    id = fields.Int(required=True)
    email = fields.Email(required=True)
    username = fields.Str(required=True, allow_none=True, metadata={'description': "Display name"})
    role = fields.Str(required=True, validate=validate.OneOf(User.VALID_ROLES))
    is_active = fields.Bool(required=True)
    mfa_enabled = fields.Bool(required=True, metadata={'description': "An authenticator app is set up"})
    passkeys_count = fields.Int(required=True)
    is_rescue_account = fields.Bool(required=True)
    site = fields.Nested(
        NamedRefSchema, required=True, allow_none=True,
        metadata={'description': "None for a supervisor"},
    )
    created_at = fields.DateTime(required=True, allow_none=True)
    last_login = fields.DateTime(required=True, allow_none=True)


class MemberListSchema(Schema):
    items = fields.List(fields.Nested(MemberSchema), required=True)
    total_count = fields.Int(required=True)


class MemberPatchSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    role = fields.Str(validate=validate.OneOf(SITE_ROLES))
    is_active = fields.Bool(metadata={'description': "False ends the account's sessions"})


class SupervisorPatchSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    is_active = fields.Bool(metadata={'description': "False ends the account's sessions"})


class PasswordResetSchema(Schema):
    emailed = fields.Bool(
        required=True, metadata={'description': "Whether the link reached the account's address"}
    )
    reset_url = fields.Str(
        required=True, allow_none=True,
        metadata={'description': "The link, only when it could not be emailed"},
    )


class InvitationSchema(Schema):
    id = fields.Int(required=True)
    token = fields.Str(required=True, metadata={'description': "Enough to create the account"})
    email = fields.Email(
        required=True, allow_none=True,
        metadata={'description': "Suggested by the inviter; the invitee may enter another"},
    )
    role = fields.Str(required=True, validate=validate.OneOf(User.VALID_ROLES))
    expires_at = fields.DateTime(required=True)
    emailed = fields.Bool(required=True, metadata={'description': "Whether it was emailed to `email`"})
    created_by_name = fields.Str(required=True, allow_none=True)


class InvitationListSchema(Schema):
    items = fields.List(fields.Nested(InvitationSchema), required=True)


class SupervisorInvitationInputSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    email = NormalizedEmail(
        allow_none=True, load_default=None,
        metadata={'description': "Suggested address; the invitee may enter another at activation"},
    )
    send_email = fields.Bool(
        load_default=False, metadata={'description': "Email the invitation to `email` as well"}
    )

    @validates_schema
    def an_address_to_write_to(self, data, **kwargs):
        if data['send_email'] and not data['email']:
            raise ValidationError("Une adresse est nécessaire pour envoyer l'invitation.", 'email')


class SiteInvitationInputSchema(SupervisorInvitationInputSchema):
    role = fields.Str(load_default=User.ROLE_EDITOR, validate=validate.OneOf(SITE_ROLES))
