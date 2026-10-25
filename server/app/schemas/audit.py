from marshmallow import EXCLUDE, Schema, ValidationError, fields, validate, validates_schema


class AuditFilterSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    action = fields.Str()
    user_id = fields.Int(metadata={'description': "The account that acted"})
    start = fields.Date(data_key='from', metadata={'description': "In Paris time"})
    end = fields.Date(data_key='to', metadata={'description': "Included"})

    @validates_schema
    def check_range(self, data, **kwargs):
        if 'start' in data and 'end' in data and data['end'] < data['start']:
            raise ValidationError('La fin précède le début.', 'to')


class OrgAuditFilterSchema(AuditFilterSchema):
    site = fields.Str(metadata={'description': "Only the entries of this site"})


class AuditQuerySchema(AuditFilterSchema):
    page = fields.Int(load_default=1, validate=validate.Range(min=1))
    per_page = fields.Int(load_default=50, validate=validate.Range(min=1, max=100))


class OrgAuditQuerySchema(OrgAuditFilterSchema, AuditQuerySchema):
    pass


class AuditLogSchema(Schema):
    id = fields.Int(required=True)
    user_id = fields.Int(required=True, allow_none=True)
    user_email = fields.Str(required=True, allow_none=True)
    site = fields.Str(required=True, allow_none=True, metadata={'description': "The site's slug"})
    action = fields.Str(required=True)
    target_type = fields.Str(required=True, allow_none=True)
    target_id = fields.Int(required=True, allow_none=True)
    details = fields.Dict(required=True, allow_none=True)
    ip_address = fields.Str(required=True, allow_none=True)
    created_at = fields.DateTime(required=True)


class AuditLogListSchema(Schema):
    items = fields.List(fields.Nested(AuditLogSchema), required=True)
    total_count = fields.Int(required=True)
