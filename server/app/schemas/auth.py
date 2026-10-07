from marshmallow import EXCLUDE, Schema, ValidationError, fields, validate, validates_schema

from ..models.user import User
from .common import DisplayName, ErrorSchema, NormalizedEmail


class _RequestSchema(Schema):
    class Meta:
        unknown = EXCLUDE


class LoginSchema(_RequestSchema):
    email = NormalizedEmail(required=True)
    password = fields.Str(required=True)


class MFAVerifySchema(_RequestSchema):
    mfa_token = fields.Str(
        required=True, metadata={'description': 'Token returned by the password step.'}
    )
    code = fields.Str(required=True, metadata={'description': 'Current authenticator-app code.'})


class ActivateAccountSchema(_RequestSchema):
    token = fields.Str(required=True, metadata={'description': 'Token from the invitation link.'})
    password = fields.Str(required=True)
    email = NormalizedEmail(
        required=True,
        metadata={'description': 'Chosen by the invitee; the invitation only suggests one.'},
    )
    username = DisplayName(
        required=True,
        metadata={'description': 'Display name: 2 to 50 letters, spaces, hyphens, apostrophes.'},
    )


class MFAVerifySetupSchema(_RequestSchema):
    user_id = fields.Int(required=True)
    code = fields.Str(required=True, metadata={'description': 'Current authenticator-app code.'})
    setup_token = fields.Str(
        required=True, metadata={'description': 'Token returned by account activation.'}
    )


class TotpCodeSchema(_RequestSchema):
    code = fields.Str(required=True, metadata={'description': 'Current authenticator-app code.'})


class LogoutSchema(_RequestSchema):
    access_token = fields.Str(
        allow_none=True,
        metadata={
            'description': 'Revoked along with the refresh token that authenticates the call.'
        },
    )


class ChangePasswordSchema(_RequestSchema):
    current_password = fields.Str(required=True)
    new_password = fields.Str(required=True)
    mfa_code = fields.Str(
        required=True, metadata={'description': 'Checked when the account has TOTP enabled.'}
    )


class ResetPasswordSchema(_RequestSchema):
    token = fields.Str(required=True, metadata={'description': 'Token from the reset link.'})
    new_password = fields.Str(required=True)
    mfa_code = fields.Str(
        required=True, metadata={'description': 'Current authenticator-app code.'}
    )


class StepUpPasswordSchema(_RequestSchema):
    password = fields.Str(required=True)
    mfa_code = fields.Str(
        required=True, metadata={'description': 'Current authenticator-app code.'}
    )


class ProfileUpdateSchema(_RequestSchema):
    username = DisplayName(
        metadata={'description': 'Display name: 2 to 50 letters, spaces, hyphens, apostrophes.'}
    )
    email = NormalizedEmail(metadata={'description': 'New sign-in address.'})

    @validates_schema
    def _changes_something(self, data, **kwargs):
        if not data:
            raise ValidationError('Aucune modification demandée')


class SessionTransferValidateSchema(_RequestSchema):
    transfer_token = fields.Str(required=True)


class PasskeySetupBeginSchema(_RequestSchema):
    user_id = fields.Int(required=True)
    setup_token = fields.Str(
        required=True, metadata={'description': 'Token returned by account activation.'}
    )


class PasskeyRenameSchema(_RequestSchema):
    device_name = fields.Str(required=True, metadata={'description': 'At most 100 characters.'})


class PasswordCheckSchema(_RequestSchema):
    current_password = fields.Str(required=True)


class ResetTokenSchema(_RequestSchema):
    reset_token = fields.Str(required=True, metadata={'description': 'Token from the reset link.'})


class _CeremonyResultSchema(_RequestSchema):
    challenge_token = fields.Str(
        required=True, metadata={'description': 'Token returned with the options.'}
    )
    credential = fields.Dict(
        required=True,
        metadata={'description': 'The PublicKeyCredential the browser returned, JSON-encoded.'},
    )


class PasskeyAssertionSchema(_CeremonyResultSchema):
    pass


class PasskeyRegistrationSchema(_CeremonyResultSchema):
    device_name = fields.Str(
        allow_none=True, metadata={'description': 'Derived from the User-Agent when omitted.'}
    )


class PasskeySetupCompleteSchema(PasskeyRegistrationSchema):
    user_id = fields.Int(required=True)


class PasskeyPasswordChangeSchema(_CeremonyResultSchema):
    new_password = fields.Str(required=True)


class PasskeyPasswordResetSchema(PasskeyPasswordChangeSchema):
    reset_token = fields.Str(required=True, metadata={'description': 'Token from the reset link.'})


class AccountSchema(Schema):
    id = fields.Int(required=True)
    email = fields.Email(required=True)
    username = fields.Str(allow_none=True)
    role = fields.Str(required=True, validate=validate.OneOf(User.VALID_ROLES))
    mfa_enabled = fields.Bool(required=True)
    is_active = fields.Bool(required=True)
    restaurant_id = fields.Int(allow_none=True)
    organization_id = fields.Int(allow_none=True)
    restaurant_name = fields.Str(allow_none=True)
    organization_name = fields.Str(allow_none=True)
    passkeys_count = fields.Int(required=True)
    is_rescue_account = fields.Bool(
        allow_none=True, metadata={'description': 'Its address cannot be changed.'}
    )
    created_at = fields.DateTime(allow_none=True)
    last_login = fields.DateTime(allow_none=True)


class SessionSchema(Schema):
    message = fields.Str()
    user = fields.Nested(AccountSchema, required=True)
    access_token = fields.Str(required=True)
    refresh_token = fields.Str(required=True)


class LoginResponseSchema(Schema):
    message = fields.Str()
    user = fields.Nested(AccountSchema)
    access_token = fields.Str()
    refresh_token = fields.Str()
    mfa_required = fields.Bool(
        metadata={'description': 'Set when the account has TOTP: finish with /mfa/verify.'}
    )
    mfa_token = fields.Str(metadata={'description': 'Valid 10 minutes, for /mfa/verify only.'})


class TokenRefreshSchema(Schema):
    access_token = fields.Str(required=True)


class UserSchema(Schema):
    user = fields.Nested(AccountSchema, required=True)


class AccountUpdateSchema(Schema):
    message = fields.Str(required=True)
    user = fields.Nested(AccountSchema, required=True)


class ProfileUpdatedSchema(AccountUpdateSchema):
    access_token = fields.Str(
        metadata={'description': 'With `refresh_token`, when the address changed: the session '
                                 'that replaces the caller\'s, every other one being closed.'}
    )
    refresh_token = fields.Str()


class ActivationLinkSchema(Schema):
    valid = fields.Bool(required=True)
    link_type = fields.Str(required=True)
    email = fields.Email(
        allow_none=True, metadata={'description': 'Suggested by the inviter, if any.'}
    )
    role = fields.Str(allow_none=True, validate=validate.OneOf(User.VALID_ROLES))
    restaurant_name = fields.Str(allow_none=True)
    organization_name = fields.Str(allow_none=True)


class ResetLinkSchema(Schema):
    valid = fields.Bool(required=True)
    link_type = fields.Str(required=True)
    email = fields.Email(required=True)
    mfa_enabled = fields.Bool(required=True)
    has_passkeys = fields.Bool(required=True)


class InvalidLinkSchema(Schema):
    valid = fields.Bool(required=True)
    error = fields.Str(required=True)


class TotpEnrolmentSchema(Schema):
    qr_code = fields.Str(required=True, metadata={'description': 'PNG data URI.'})
    secret = fields.Str(
        required=True, metadata={'description': 'For typing into the app instead of scanning.'}
    )


class ActivationSetupSchema(TotpEnrolmentSchema):
    user_id = fields.Int(required=True)
    setup_token = fields.Str(
        required=True,
        metadata={'description': 'Authorises TOTP or passkey setup for 15 minutes.'},
    )


class ActivationSchema(Schema):
    message = fields.Str(required=True)
    user = fields.Nested(AccountSchema, required=True)
    mfa_setup = fields.Nested(ActivationSetupSchema, required=True)


class WebAuthnOptionsSchema(Schema):
    options = fields.Dict(
        required=True,
        metadata={'description': 'For navigator.credentials.create() or .get().'},
    )
    challenge_token = fields.Str(
        required=True,
        metadata={'description': 'Send back with the credential, within 120 seconds.'},
    )


class PasskeySchema(Schema):
    id = fields.Int(required=True)
    device_name = fields.Str(required=True)
    transports = fields.List(fields.Str(), required=True)
    created_at = fields.DateTime(allow_none=True)
    last_used_at = fields.DateTime(allow_none=True)


class PasskeyCreatedSchema(Schema):
    message = fields.Str(required=True)
    passkey = fields.Nested(PasskeySchema, required=True)


class PasskeyListSchema(Schema):
    passkeys = fields.List(fields.Nested(PasskeySchema), required=True)


class PasskeyRenamedSchema(Schema):
    message = fields.Str(required=True)
    device_name = fields.Str(required=True)


class StepUpTokenSchema(Schema):
    step_up_token = fields.Str(
        required=True,
        metadata={
            'description': 'Single-use proof for the X-Step-Up-Token header, valid 5 minutes.'
        },
    )


class SessionTransferSchema(Schema):
    transfer_token = fields.Str(required=True)
    expires_in = fields.Int(required=True, metadata={'description': 'Seconds.'})


class AuthErrorSchema(ErrorSchema):
    passkey_only = fields.Bool(
        metadata={'description': 'The account signs in with a passkey only.'}
    )
    passkey_required = fields.Bool(
        metadata={'description': 'The account has no TOTP: use the passkey route instead.'}
    )
    second_factor_required = fields.Bool(
        metadata={'description': 'The account has no second factor to confirm with.'}
    )
    step_up_required = fields.Bool(
        metadata={'description': 'Send a fresh proof of identity in `X-Step-Up-Token`.'}
    )
