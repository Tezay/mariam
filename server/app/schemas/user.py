from marshmallow import Schema, ValidationError, fields, validate, validates_schema

from .common import (
    DeviceName,
    DisplayName,
    NamedRefSchema,
    NewPassword,
    NormalizedEmail,
    RequestSchema,
)
from .members import MemberSchema


class AccountSchema(MemberSchema):
    organization = fields.Nested(
        NamedRefSchema, required=True, allow_none=True,
        metadata={'description': "A site's team reads its site's"},
    )


class TotpSecretSchema(Schema):
    qr_code = fields.Str(required=True, metadata={'description': "PNG data URI"})
    secret = fields.Str(
        required=True, metadata={'description': "For typing into the app instead of scanning"}
    )


class ProfilePatchSchema(RequestSchema):
    username = DisplayName(
        metadata={'description': "Display name: 2 to 50 letters, spaces, hyphens, apostrophes"}
    )
    email = NormalizedEmail(metadata={'description': "New sign-in address"})

    @validates_schema
    def changes_something(self, data, **kwargs):
        if not data:
            raise ValidationError('Aucune modification demandée.')


class ProfileSchema(Schema):
    user = fields.Nested(AccountSchema, required=True)
    access_token = fields.Str(
        metadata={'description': "With `refresh_token`, when the address changed: the session "
                                 "that replaces the caller's, every other one being closed"}
    )
    refresh_token = fields.Str()


class UiPreferencesSchema(RequestSchema):
    tour_done = fields.Bool()
    tour_catalog_done = fields.Bool()
    tour_stats_done = fields.Bool()


class NotificationPreferencesSchema(RequestSchema):
    notify_menu_unpublished = fields.Bool()
    notify_menu_during_service = fields.Bool()
    notify_menu_tomorrow = fields.Bool()
    notify_traffic_drop = fields.Bool()
    notify_low_satisfaction = fields.Bool()
    notify_vote_anomaly = fields.Bool()
    notify_site_inactive = fields.Bool()
    notify_holiday_approaching = fields.Bool()
    holiday_alert_days_before = fields.Int(strict=True, validate=validate.Range(min=1, max=30))
    weekly_digest = fields.Bool()
    digest_day = fields.Int(strict=True, validate=validate.Range(min=0, max=6))
    digest_hour = fields.Int(strict=True, validate=validate.Range(min=6, max=21))


class AlertSchema(Schema):
    key = fields.Str(required=True)
    title = fields.Str(required=True)
    body = fields.Str(required=True)
    severity = fields.Str(required=True, validate=validate.OneOf(['info', 'warning', 'error']))
    sites = fields.List(fields.Nested(NamedRefSchema), required=True)


class AlertListSchema(Schema):
    items = fields.List(fields.Nested(AlertSchema), required=True)


class PasskeySchema(Schema):
    id = fields.Int(required=True)
    device_name = fields.Str(required=True)
    transports = fields.List(fields.Str(), required=True)
    created_at = fields.DateTime(required=True, allow_none=True)
    last_used_at = fields.DateTime(required=True, allow_none=True)


class PasskeyListSchema(Schema):
    items = fields.List(fields.Nested(PasskeySchema), required=True)


class PasskeyPatchSchema(RequestSchema):
    device_name = DeviceName(required=True, metadata={'description': "1 to 100 characters"})


class TotpEnrolmentSchema(TotpSecretSchema):
    enrolment_token = fields.Str(
        required=True, metadata={'description': "Send back with a first code, within 10 minutes"}
    )


class TotpInputSchema(RequestSchema):
    enrolment_token = fields.Str(
        required=True, metadata={'description': "Returned by `POST /v1/user/totp/enrolment`"}
    )
    code = fields.Str(
        required=True, metadata={'description': "First code of the app that scanned the secret"}
    )


class PasswordOptionsSchema(RequestSchema):
    current_password = fields.Str(required=True)


class PasswordChangeSchema(RequestSchema):
    """The new password, and one proof: the current one with a TOTP code, or a passkey."""
    BY_PASSWORD = {'current_password', 'code'}
    BY_PASSKEY = {'challenge_token', 'credential'}

    new_password = NewPassword(required=True)
    current_password = fields.Str()
    code = fields.Str(
        metadata={'description': "Current authenticator-app code, if the account has TOTP"}
    )
    challenge_token = fields.Str(
        metadata={'description': "Returned by `POST /v1/user/password/options`"}
    )
    credential = fields.Dict(
        metadata={'description': "The PublicKeyCredential the browser returned, JSON-encoded"}
    )

    @validates_schema
    def one_proof(self, data, **kwargs):
        proof = data.keys() - {'new_password'}
        by_password = 'current_password' in proof and proof <= self.BY_PASSWORD
        if not (by_password or proof == self.BY_PASSKEY):
            raise ValidationError(
                'Envoyez le mot de passe actuel, avec un code si le compte en a un, ou bien '
                'une passkey.'
            )
