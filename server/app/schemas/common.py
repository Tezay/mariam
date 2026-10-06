from marshmallow import EXCLUDE, Schema, ValidationError, fields

from ..utils.display_name import parse_display_name
from ..utils.email_address import canonical_email


class ErrorSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    error = fields.Str(description="Error message")
    message = fields.Str(description="Detailed error description")


class MessageSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    message = fields.Str(description="Success message")


class NormalizedEmail(fields.Email):
    def _deserialize(self, value, attr, data, **kwargs):
        if isinstance(value, str):
            try:
                value = canonical_email(value)
            except ValueError as exc:
                raise ValidationError(str(exc)) from exc
        return super()._deserialize(value, attr, data, **kwargs)


class DisplayName(fields.Str):
    def _deserialize(self, value, attr, data, **kwargs):
        name = parse_display_name(super()._deserialize(value, attr, data, **kwargs))
        if name is None:
            raise ValidationError(
                'Le nom doit contenir 2 à 50 caractères : lettres, espaces, tirets, '
                'apostrophes ou points.'
            )
        return name
