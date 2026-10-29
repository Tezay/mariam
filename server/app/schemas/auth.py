from marshmallow import Schema, fields, validate

from ..models.user import User
from .common import (
    DeviceName,
    DisplayName,
    NamedRefSchema,
    NewPassword,
    NormalizedEmail,
    RequestSchema,
)
from .user import AccountSchema, TotpSecretSchema

CODE = {'description': "Current authenticator-app code"}


class LoginSchema(RequestSchema):
    email = NormalizedEmail(required=True)
    password = fields.Str(required=True)


class MFAVerifySchema(RequestSchema):
    mfa_token = fields.Str(required=True, metadata={'description': "Returned by `/login`"})
    code = fields.Str(required=True, metadata=CODE)


class ActivateAccountSchema(RequestSchema):
    token = fields.Str(required=True, metadata={'description': "From the invitation link"})
    password = NewPassword(required=True)
    email = NormalizedEmail(
        required=True,
        metadata={'description': "Chosen by the invitee; the invitation only suggests one"},
    )
    username = DisplayName(
        required=True,
        metadata={'description': "Display name: 2 to 50 letters, spaces, hyphens, apostrophes"},
    )


class SetupTokenSchema(RequestSchema):
    setup_token = fields.Str(required=True, metadata={'description': "Returned by `/activate`"})


class ActivationCodeSchema(SetupTokenSchema):
    code = fields.Str(required=True, metadata={'description': "First code of the scanned secret"})


class ResetPasswordSchema(RequestSchema):
    token = fields.Str(required=True, metadata={'description': "From the reset link"})
    new_password = NewPassword(required=True)
    code = fields.Str(required=True, metadata=CODE)


class ResetTokenSchema(RequestSchema):
    reset_token = fields.Str(required=True, metadata={'description': "From the reset link"})


class StepUpPasswordSchema(RequestSchema):
    password = fields.Str(required=True)
    code = fields.Str(required=True, metadata=CODE)


class SessionTransferValidateSchema(RequestSchema):
    transfer_token = fields.Str(required=True)


class PasskeyAssertionSchema(RequestSchema):
    challenge_token = fields.Str(
        required=True, metadata={'description': "Returned with the options"}
    )
    credential = fields.Dict(
        required=True,
        metadata={'description': "The PublicKeyCredential the browser returned, JSON-encoded"},
    )


class PasskeyRegistrationSchema(PasskeyAssertionSchema):
    device_name = DeviceName(
        allow_none=True,
        metadata={'description': "1 to 100 characters; from the User-Agent when left out"},
    )


class PasskeyPasswordResetSchema(PasskeyAssertionSchema):
    new_password = NewPassword(required=True)
    reset_token = fields.Str(required=True, metadata={'description': "From the reset link"})


class SessionSchema(Schema):
    user = fields.Nested(AccountSchema, required=True)
    confirmed_for = fields.Int(
        required=True,
        metadata={'description': "Seconds the session stays confirmed, 0 when it is not"},
    )


class LoginResponseSchema(Schema):
    user = fields.Nested(AccountSchema, metadata={'description': "Once signed in"})
    confirmed_for = fields.Int(
        metadata={'description': "Seconds the session stays confirmed, 0 when it is not"}
    )
    mfa_required = fields.Bool(
        metadata={'description': "Set when the account has TOTP: finish with `/mfa/verify`"}
    )
    mfa_token = fields.Str(metadata={'description': "Valid 10 minutes, for `/mfa/verify` only"})


class ActivationLinkSchema(Schema):
    link_type = fields.Str(required=True, validate=validate.OneOf(['invite', 'first_admin']))
    email = fields.Email(
        required=True, allow_none=True, metadata={'description': "Suggested by the inviter, if any"}
    )
    role = fields.Str(required=True, validate=validate.OneOf(User.VALID_ROLES))
    site = fields.Nested(
        NamedRefSchema, required=True, allow_none=True,
        metadata={'description': "The site the account will belong to, if any"},
    )
    organization = fields.Nested(NamedRefSchema, required=True, allow_none=True)


class ResetLinkSchema(Schema):
    email = fields.Email(required=True)
    mfa_enabled = fields.Bool(required=True)
    has_passkeys = fields.Bool(required=True)


class ActivationSetupSchema(TotpSecretSchema):
    setup_token = fields.Str(
        required=True,
        metadata={
            'description': "Sets up TOTP or a passkey within 15 minutes; it carries the secret"
        },
    )


class ActivationSchema(Schema):
    user = fields.Nested(AccountSchema, required=True)
    mfa_setup = fields.Nested(ActivationSetupSchema, required=True)


class WebAuthnOptionsSchema(Schema):
    options = fields.Dict(
        required=True, metadata={'description': "For navigator.credentials.create() or .get()"}
    )
    challenge_token = fields.Str(
        required=True, metadata={'description': "Send back with the credential, within 120 seconds"}
    )


class ConfirmationSchema(Schema):
    confirmed_for = fields.Int(
        required=True,
        metadata={'description': "Seconds the session stays confirmed, 0 when it is not"},
    )


class SessionTransferSchema(Schema):
    transfer_token = fields.Str(required=True)
    expires_in = fields.Int(required=True, metadata={'description': "Seconds"})
