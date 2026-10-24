from marshmallow import EXCLUDE, Schema, ValidationError, fields, validate, validates_schema

REASON = validate.Length(max=100)


class ClosureSchema(Schema):
    id = fields.Int(required=True)
    start_date = fields.Date(required=True)
    end_date = fields.Date(required=True, metadata={'description': "Included"})
    reason = fields.Str(allow_none=True, required=True)
    description = fields.Str(allow_none=True, required=True)


class ClosureListSchema(Schema):
    items = fields.List(fields.Nested(ClosureSchema), required=True)


class ClosureQuerySchema(Schema):
    class Meta:
        unknown = EXCLUDE

    start = fields.Date(
        data_key='from',
        metadata={'description': "Today, at the earliest, for anyone but the site's editors"},
    )
    end = fields.Date(data_key='to', metadata={'description': "Included"})

    @validates_schema
    def check_range(self, data, **kwargs):
        if 'start' in data and 'end' in data and data['end'] < data['start']:
            raise ValidationError('La fin précède le début.', 'to')


class ClosureInputSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    start_date = fields.Date(required=True)
    end_date = fields.Date(required=True, metadata={'description': "Included"})
    reason = fields.Str(allow_none=True, validate=REASON)
    description = fields.Str(allow_none=True)

    @validates_schema
    def check_range(self, data, **kwargs):
        if data['end_date'] < data['start_date']:
            raise ValidationError('La fin précède le début.', 'end_date')


class ClosurePatchSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    start_date = fields.Date()
    end_date = fields.Date()
    reason = fields.Str(allow_none=True, validate=REASON)
    description = fields.Str(allow_none=True)
