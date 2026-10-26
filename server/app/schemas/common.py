import re
import unicodedata
from urllib.parse import urlsplit

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


class PlainText(fields.Str):
    """Text shown as typed, never as markup: one line, or paragraphs.

    An empty text reads as None, and is refused where None is.
    """

    def __init__(self, max_length: int, *, multiline: bool = False, **kwargs):
        super().__init__(**kwargs)
        self.max_length = max_length
        self.multiline = multiline

    def _deserialize(self, value, attr, data, **kwargs):
        text = unicodedata.normalize('NFC', super()._deserialize(value, attr, data, **kwargs))
        if self.multiline:
            lines = (' '.join(line.split()) for line in text.replace('\r\n', '\n').split('\n'))
            text = re.sub(r'\n{3,}', '\n\n', '\n'.join(lines)).strip()
        else:
            text = ' '.join(text.split())
        if not all(char == '\n' or char.isprintable() for char in text):
            raise ValidationError('Le texte contient un caractère non autorisé.')
        if len(text) > self.max_length:
            raise ValidationError(f'Le texte fait {self.max_length} caractères au plus.')
        if not text and not self.allow_none:
            raise ValidationError('Ce texte ne peut pas être vide.')
        return text or None


class HttpsUrl(fields.Url):
    """An https address with a domain name, no credentials, 500 characters at most."""

    def __init__(self, **kwargs):
        super().__init__(
            schemes={'https'}, require_tld=True, validate=validate.Length(max=500),
            error_messages={
                'invalid': 'Une adresse en https://, par exemple https://www.crous.fr.'
            },
            **kwargs,
        )

    def _deserialize(self, value, attr, data, **kwargs):
        url = super()._deserialize(value, attr, data, **kwargs)
        if urlsplit(url).username is not None:
            raise ValidationError("Une adresse sans nom d'utilisateur ni mot de passe.")
        return url


class PageQuerySchema(Schema):
    class Meta:
        unknown = EXCLUDE

    page = fields.Int(load_default=1, validate=validate.Range(min=1))
    per_page = fields.Int(load_default=50, validate=validate.Range(min=1, max=200))


class FileUploadSchema(Schema):
    file = Upload(required=True)
