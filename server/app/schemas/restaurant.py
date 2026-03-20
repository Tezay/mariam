from marshmallow import Schema, fields, EXCLUDE


class RestaurantConfigSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    service_days = fields.List(fields.Int(), description="Active service days (0=Monday, 6=Sunday)")
    menu_categories = fields.List(fields.Dict(), description="Menu category definitions")
    dietary_tags = fields.List(fields.Dict(), description="Available dietary tags")
    certifications = fields.List(fields.Dict(), description="Available certifications")


class RestaurantSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    id = fields.Int(dump_only=True)
    name = fields.Str()
    code = fields.Str(description="Unique restaurant code")
    address = fields.Str(allow_none=True)
    logo_url = fields.Str(allow_none=True)
    is_active = fields.Bool()
    config = fields.Nested(RestaurantConfigSchema, dump_only=True)


class RestaurantUpdateSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    name = fields.Str()
    address = fields.Str(allow_none=True)
    logo_url = fields.Str(allow_none=True)
    is_active = fields.Bool()
    service_days = fields.List(fields.Int())
    menu_categories = fields.List(fields.Dict())
    dietary_tags = fields.List(fields.Raw(), description="List of tag IDs (strings) or tag objects with 'id'")
    certifications = fields.List(fields.Raw(), description="List of cert IDs (strings) or cert objects with 'id'")
