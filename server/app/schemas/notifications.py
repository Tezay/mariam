import re
from collections.abc import Callable

from marshmallow import EXCLUDE, Schema, ValidationError, fields, validate

from ..utils.push_endpoint import is_push_service_url

# RFC 8291: a P-256 point of 65 bytes and a secret of 16, in base64url.
_P256DH = re.compile(r'[A-Za-z0-9_-]{87}=?')
_AUTH = re.compile(r'[A-Za-z0-9_-]{22}(?:==)?')


def _push_service(url: str) -> None:
    if not is_push_service_url(url):
        raise ValidationError("Cette adresse n'est pas celle d'un service de notifications.")


def _shaped(shape: re.Pattern[str]) -> Callable[[str], None]:
    def check(value: str) -> None:
        if not shape.fullmatch(value):
            raise ValidationError('Clé de souscription invalide.')
    return check


class NotificationPreferencesSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    notify_today_menu = fields.Bool()
    notify_today_menu_time = fields.Str(description="Time HH:MM")
    notify_tomorrow_menu = fields.Bool()
    notify_tomorrow_menu_time = fields.Str(description="Time HH:MM")
    notify_events = fields.Bool()


class PushKeysSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    p256dh = fields.Str(required=True, validate=_shaped(_P256DH))
    auth = fields.Str(required=True, validate=_shaped(_AUTH))


class SubscriptionEndpointSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    endpoint = fields.Str(
        required=True, validate=_push_service, description="Push subscription endpoint URL"
    )


class BrowserSubscriptionSchema(SubscriptionEndpointSchema):
    keys = fields.Nested(PushKeysSchema, required=True)


class SubscribeSchema(BrowserSubscriptionSchema):
    preferences = fields.Nested(NotificationPreferencesSchema)
    platform = fields.Str(allow_none=True, validate=validate.OneOf(('ios', 'android', 'desktop')))
    restaurant_id = fields.Int(allow_none=True)


class PreferencesUpdateSchema(SubscriptionEndpointSchema):
    preferences = fields.Nested(NotificationPreferencesSchema, required=True)
