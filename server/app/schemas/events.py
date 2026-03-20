from marshmallow import Schema, fields, EXCLUDE


class EventImageSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    id = fields.Int()
    url = fields.Str()
    filename = fields.Str(allow_none=True)
    order = fields.Int()


class EventSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    id = fields.Int(dump_only=True)
    restaurant_id = fields.Int()
    title = fields.Str()
    subtitle = fields.Str(allow_none=True)
    description = fields.Str(allow_none=True)
    color = fields.Str(description="Hex color code (e.g. '#3498DB')")
    event_date = fields.Str(description="Event date (YYYY-MM-DD)")
    status = fields.Str(description="'draft' or 'published'")
    visibility = fields.Str(description="'tv', 'mobile', or 'all'")
    is_active = fields.Bool()
    images = fields.List(fields.Nested(EventImageSchema))
    created_at = fields.Str(dump_only=True, allow_none=True)
    updated_at = fields.Str(dump_only=True, allow_none=True)


class EventListSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    events = fields.List(fields.Nested(EventSchema))


class EventCreateSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    title = fields.Str(required=True, description="Event title")
    event_date = fields.Str(required=True, description="Event date (YYYY-MM-DD)")
    restaurant_id = fields.Int()
    subtitle = fields.Str(allow_none=True)
    description = fields.Str(allow_none=True, description="Markdown description")
    color = fields.Str(description="Hex color code (e.g. '#3498DB')")
    status = fields.Str(description="'draft' or 'published'")
    visibility = fields.Str(description="'tv', 'mobile', or 'all'")


class EventUpdateSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    title = fields.Str()
    subtitle = fields.Str(allow_none=True)
    description = fields.Str(allow_none=True)
    color = fields.Str()
    event_date = fields.Str(description="Event date (YYYY-MM-DD)")
    status = fields.Str(description="'draft' or 'published'")
    visibility = fields.Str(description="'tv', 'mobile', or 'all'")
    is_active = fields.Bool()


class PublicEventsResponseSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    today_event = fields.Dict(allow_none=True)
    upcoming_events = fields.List(fields.Dict())
    events = fields.List(fields.Dict(), description="All events (backward compat)")
