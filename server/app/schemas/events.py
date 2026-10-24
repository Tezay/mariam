from marshmallow import EXCLUDE, Schema, ValidationError, fields, validate, validates_schema

from ..models import Event
from .images import ImageSchema
from .public import PublicEventSchema

EDITORS = {'description': "For the site's editors"}
TITLE = validate.Length(min=1, max=100)
SUBTITLE = validate.Length(max=200)
COLOR = validate.Regexp(r'^#[0-9A-Fa-f]{6}$', error='Une couleur au format #RRGGBB.')
STATUS = validate.OneOf(Event.VALID_STATUS)
VISIBILITY = validate.OneOf(Event.VALID_VISIBILITY)


class EventSchema(PublicEventSchema):
    """An event; the fields described as for the site's editors are absent for anyone else."""
    status = fields.Str(validate=STATUS, metadata=EDITORS)
    visibility = fields.Str(validate=VISIBILITY, metadata=EDITORS)
    created_at = fields.DateTime(allow_none=True, metadata=EDITORS)
    updated_at = fields.DateTime(allow_none=True, metadata=EDITORS)
    images = fields.List(fields.Nested(ImageSchema), required=True)


class EventListSchema(Schema):
    items = fields.List(fields.Nested(EventSchema), required=True)


class EventQuerySchema(Schema):
    class Meta:
        unknown = EXCLUDE

    start = fields.Date(
        data_key='from',
        metadata={'description': "Today, at the earliest, for anyone but the site's editors"},
    )
    end = fields.Date(data_key='to', metadata={'description': "Included"})
    visibility = fields.Str(
        validate=validate.OneOf(['tv', 'mobile']),
        metadata={'description': "Only the events shown on that screen"},
    )
    limit = fields.Int(validate=validate.Range(min=1, max=100))

    @validates_schema
    def check_range(self, data, **kwargs):
        if 'start' in data and 'end' in data and data['end'] < data['start']:
            raise ValidationError('La fin précède le début.', 'to')


class EventInputSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    title = fields.Str(required=True, validate=TITLE)
    subtitle = fields.Str(allow_none=True, validate=SUBTITLE)
    description = fields.Str(allow_none=True, metadata={'description': "HTML, sanitized on write"})
    color = fields.Str(load_default='#3498DB', validate=COLOR)
    date = fields.Date(required=True)
    status = fields.Str(load_default='draft', validate=STATUS)
    visibility = fields.Str(load_default='all', validate=VISIBILITY)


class EventPatchSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    title = fields.Str(validate=TITLE)
    subtitle = fields.Str(allow_none=True, validate=SUBTITLE)
    description = fields.Str(allow_none=True)
    color = fields.Str(validate=COLOR)
    date = fields.Date()
    visibility = fields.Str(validate=VISIBILITY)


class EventDuplicateSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    date = fields.Date(metadata={'description': "A week after the original by default"})
