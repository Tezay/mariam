from marshmallow import Schema, fields, EXCLUDE


class ClosureSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    id            = fields.Int(dump_only=True)
    restaurant_id = fields.Int()
    start_date    = fields.Str(description="Start date (YYYY-MM-DD)")
    end_date      = fields.Str(description="End date (YYYY-MM-DD), equals start_date for single-day closure")
    reason        = fields.Str(allow_none=True, description="Short reason (e.g. 'Vacances scolaires')")
    description   = fields.Str(allow_none=True, description="Optional longer description")
    is_active     = fields.Bool()
    is_current    = fields.Bool(dump_only=True, description="True if today is within the closure range")
    notified_7d   = fields.Bool(dump_only=True)
    notified_1d   = fields.Bool(dump_only=True)
    created_at    = fields.Str(dump_only=True, allow_none=True)
    updated_at    = fields.Str(dump_only=True, allow_none=True)


class ClosureCreateSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    start_date    = fields.Str(required=True, description="Start date (YYYY-MM-DD)")
    end_date      = fields.Str(required=True, description="End date (YYYY-MM-DD)")
    reason        = fields.Str(allow_none=True)
    description   = fields.Str(allow_none=True)
    restaurant_id = fields.Int()


class ClosureUpdateSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    start_date  = fields.Str(description="Start date (YYYY-MM-DD)")
    end_date    = fields.Str(description="End date (YYYY-MM-DD)")
    reason      = fields.Str(allow_none=True)
    description = fields.Str(allow_none=True)
    is_active   = fields.Bool()


class PublicClosuresResponseSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    current_closure   = fields.Dict(allow_none=True)
    upcoming_closures = fields.List(fields.Dict())
    closures          = fields.List(fields.Dict(), description="All closures (editor view)")
