from marshmallow import EXCLUDE, Schema, ValidationError, fields, validate, validates_schema

from ..models import Event
from .common import PlainText
from .images import ImageSchema
from .public import PublicNewsSchema

EDITORS = {'description': "For the site's editors"}
COLOR = validate.Regexp(r'^#[0-9A-Fa-f]{6}$', error='Une couleur au format #RRGGBB.')
STATUS = validate.OneOf(Event.VALID_STATUS)
VISIBILITY = validate.OneOf(Event.VALID_VISIBILITY)


class NewsSchema(PublicNewsSchema):
    """A news item; the fields described as for the site's editors are absent for anyone else."""
    status = fields.Str(validate=STATUS, metadata=EDITORS)
    visibility = fields.Str(validate=VISIBILITY, metadata=EDITORS)
    created_at = fields.DateTime(allow_none=True, metadata=EDITORS)
    updated_at = fields.DateTime(allow_none=True, metadata=EDITORS)
    images = fields.List(fields.Nested(ImageSchema), required=True)


class NewsListSchema(Schema):
    items = fields.List(fields.Nested(NewsSchema), required=True)


class NewsQuerySchema(Schema):
    class Meta:
        unknown = EXCLUDE

    sort = fields.Str(
        load_default='published',
        validate=validate.OneOf(['published', 'date']),
        metadata={
            'description': "`published`: pinned first, then the latest published; "
            "`date`: the dated items only, the soonest first"
        },
    )
    start = fields.Date(data_key='from', metadata={'description': "The dated items only"})
    end = fields.Date(data_key='to', metadata={'description': "Included"})
    visibility = fields.Str(
        validate=validate.OneOf(['tv', 'mobile']),
        metadata={'description': "Only the items shown on that screen"},
    )
    limit = fields.Int(
        validate=validate.Range(min=1, max=100),
        metadata={'description': "Eight at most for anyone but the site's editors"},
    )

    @validates_schema
    def check_range(self, data, **kwargs):
        if 'start' in data and 'end' in data and data['end'] < data['start']:
            raise ValidationError('La fin précède le début.', 'to')


class NewsInputSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    title = PlainText(100, required=True)
    summary = PlainText(200, allow_none=True)
    description = fields.Str(allow_none=True, metadata={'description': "HTML, sanitized on write"})
    color = fields.Str(load_default='#3498DB', validate=COLOR)
    date = fields.Date(load_default=None, allow_none=True)
    pinned = fields.Bool(load_default=False)
    status = fields.Str(load_default='draft', validate=STATUS)
    visibility = fields.Str(load_default='all', validate=VISIBILITY)


class NewsPatchSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    title = PlainText(100)
    summary = PlainText(200, allow_none=True)
    description = fields.Str(allow_none=True)
    color = fields.Str(validate=COLOR)
    date = fields.Date(allow_none=True)
    pinned = fields.Bool()
    visibility = fields.Str(validate=VISIBILITY)


class NewsDuplicateSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    date = fields.Date(
        allow_none=True,
        metadata={'description': "A week after the original by default; an undated one stays so"},
    )
