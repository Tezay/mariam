from flask_smorest.fields import Upload
from marshmallow import EXCLUDE, Schema, ValidationError, fields, validate

from ..models.user import User
from ..utils.display_name import parse_display_name
from ..utils.email_address import canonical_email
from ..utils.site_name import SITE_NAME_MAX, parse_site_name


class ValidationIssueSchema(Schema):
    pointer = fields.Str(metadata={'description': "JSON Pointer (RFC 6901) to the field in the body"})
    parameter = fields.Str(metadata={'description': "Query, path or header parameter"})
    detail = fields.Str(required=True)


class ProblemSchema(Schema):
    """RFC 9457 problem details; `type` is left out and reads as about:blank."""
    class Meta:
        unknown = EXCLUDE
    title = fields.Str(required=True, metadata={'description': "HTTP status phrase"})
    status = fields.Int(required=True)
    detail = fields.Str(
        required=True, metadata={'description': "What happened, in French, for the person"}
    )
    code = fields.Str(required=True, metadata={'description': "Stable identifier, for programs"})
    errors = fields.List(
        fields.Nested(ValidationIssueSchema),
        metadata={'description': "One entry per invalid field, on a 422"},
    )


class RequestSchema(Schema):
    """A request body that ignores the keys it does not know."""
    class Meta:
        unknown = EXCLUDE


class NamedRefSchema(Schema):
    slug = fields.Str(required=True)
    name = fields.Str(required=True)


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


class NewPassword(fields.Str):
    def _deserialize(self, value, attr, data, **kwargs):
        password = super()._deserialize(value, attr, data, **kwargs)
        if not User.validate_password_strength(password):
            raise ValidationError(
                'Le mot de passe doit contenir au moins 12 caractères, une majuscule, une '
                'minuscule, un chiffre et un caractère spécial.'
            )
        return password


class SiteName(fields.Str):
    def _deserialize(self, value, attr, data, **kwargs):
        name = parse_site_name(super()._deserialize(value, attr, data, **kwargs))
        if name is None:
            raise ValidationError(
                f'Le nom doit faire 1 à {SITE_NAME_MAX} caractères et ne contenir ni adresse '
                'web ni adresse e-mail (« / », « : » et « @ » sont refusés).'
            )
        return name


class DeviceName(fields.Str):
    MAX = 100

    def _deserialize(self, value, attr, data, **kwargs):
        name = ' '.join(super()._deserialize(value, attr, data, **kwargs).split())
        if not 1 <= len(name) <= self.MAX or not name.isprintable():
            raise ValidationError(f'Le nom doit faire 1 à {self.MAX} caractères.')
        return name


class PageQuerySchema(Schema):
    class Meta:
        unknown = EXCLUDE

    page = fields.Int(load_default=1, validate=validate.Range(min=1))
    per_page = fields.Int(load_default=50, validate=validate.Range(min=1, max=200))


class FileUploadSchema(Schema):
    file = Upload(required=True)
