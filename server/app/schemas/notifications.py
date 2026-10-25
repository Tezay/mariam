import re
from collections.abc import Callable

from marshmallow import EXCLUDE, Schema, ValidationError, fields, validate

from ..utils.push_endpoint import is_push_service_url

# RFC 8291: a P-256 point of 65 bytes and a secret of 16, in base64url.
_P256DH = re.compile(r'[A-Za-z0-9_-]{87}=?')
_AUTH = re.compile(r'[A-Za-z0-9_-]{22}(?:==)?')
TIME = validate.Regexp(r'^([01]\d|2[0-3]):[0-5]\d$', error='Une heure au format HH:MM.')
PLATFORMS = ('ios', 'android', 'desktop')


def _push_service(url: str) -> None:
    if not is_push_service_url(url):
        raise ValidationError("Cette adresse n'est pas celle d'un service de notifications.")


def _shaped(shape: re.Pattern[str]) -> Callable[[str], None]:
    def check(value: str) -> None:
        if not shape.fullmatch(value):
            raise ValidationError('Clé de souscription invalide.')
    return check


class PushKeySchema(Schema):
    public_key = fields.Str(required=True, metadata={'description': "VAPID, for PushManager.subscribe"})


class PushPreferencesSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    notify_today_menu = fields.Bool()
    notify_today_menu_time = fields.Str(validate=TIME, metadata={'description': "Paris time"})
    notify_tomorrow_menu = fields.Bool()
    notify_tomorrow_menu_time = fields.Str(validate=TIME, metadata={'description': "Paris time"})
    notify_events = fields.Bool()


class PushKeysSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    p256dh = fields.Str(required=True, validate=_shaped(_P256DH))
    auth = fields.Str(required=True, validate=_shaped(_AUTH))


class PushSubscriptionInputSchema(PushPreferencesSchema):
    endpoint = fields.Str(required=True, validate=_push_service)
    keys = fields.Nested(PushKeysSchema, required=True)
    platform = fields.Str(allow_none=True, validate=validate.OneOf(PLATFORMS))


class PushSubscriptionSchema(Schema):
    id = fields.Str(required=True, metadata={'description': "SHA-256 of the endpoint, in base64url"})
    notify_today_menu = fields.Bool(required=True)
    notify_today_menu_time = fields.Str(required=True)
    notify_tomorrow_menu = fields.Bool(required=True)
    notify_tomorrow_menu_time = fields.Str(required=True)
    notify_events = fields.Bool(required=True)
    platform = fields.Str(required=True, allow_none=True)
    created_at = fields.DateTime(required=True)
