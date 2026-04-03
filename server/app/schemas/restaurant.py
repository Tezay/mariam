from marshmallow import Schema, fields, EXCLUDE


class ServiceHoursDaySchema(Schema):
    class Meta:
        unknown = EXCLUDE
    open = fields.Str(required=True)   # "HH:MM"
    close = fields.Str(required=True)  # "HH:MM"


class RestaurantConfigSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    service_days = fields.List(fields.Int(), description="Active service days (0=Monday, 6=Sunday)")
    service_hours = fields.Dict(
        keys=fields.Str(),
        values=fields.Nested(ServiceHoursDaySchema),
        description="Opening hours per day index {'0': {open, close}, ...}",
    )
    menu_categories = fields.List(fields.Dict(), description="Menu category definitions")
    dietary_tags = fields.List(fields.Dict(), description="Available dietary tags")
    certifications = fields.List(fields.Dict(), description="Available certifications")


class RestaurantSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    id = fields.Int(dump_only=True)
    name = fields.Str()
    code = fields.Str(description="Unique restaurant code")
    logo_url = fields.Str(allow_none=True)
    is_active = fields.Bool()
    # Address (BAN-verified)
    address_label = fields.Str(allow_none=True)
    address_lat = fields.Float(allow_none=True)
    address_lon = fields.Float(allow_none=True)
    # Contact
    email = fields.Str(allow_none=True)
    phone = fields.Str(allow_none=True)
    capacity = fields.Int(allow_none=True)
    # Payment & accessibility
    payment_methods = fields.List(fields.Str(), allow_none=True)
    pmr_access = fields.Bool(allow_none=True)
    # Service hours (serialized from RestaurantServiceHours rows)
    service_hours = fields.Dict(
        keys=fields.Str(),
        values=fields.Nested(ServiceHoursDaySchema),
        dump_only=True,
    )
    config = fields.Nested(RestaurantConfigSchema, dump_only=True)


class RestaurantUpdateSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    name = fields.Str()
    logo_url = fields.Str(allow_none=True)
    is_active = fields.Bool()
    # Address
    address_label = fields.Str(allow_none=True)
    address_lat = fields.Float(allow_none=True)
    address_lon = fields.Float(allow_none=True)
    # Contact
    email = fields.Str(allow_none=True)
    phone = fields.Str(allow_none=True)
    capacity = fields.Int(allow_none=True)
    # Payment & accessibility
    payment_methods = fields.List(fields.Str(), allow_none=True)
    pmr_access = fields.Bool(allow_none=True)
    # Service hours: {"0": {"open": "11:30", "close": "14:00"}, ...}
    service_hours = fields.Dict(
        keys=fields.Str(),
        values=fields.Nested(ServiceHoursDaySchema),
        allow_none=True,
    )
    # Existing fields
    service_days = fields.List(fields.Int())
    menu_categories = fields.List(fields.Dict())
    dietary_tags = fields.List(fields.Raw(), description="List of tag IDs or tag objects with 'id'")
    certifications = fields.List(fields.Raw(), description="List of cert IDs or cert objects with 'id'")
