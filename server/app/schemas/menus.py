from marshmallow import Schema, fields, EXCLUDE


class MenuItemSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    id = fields.Int(dump_only=True)
    category = fields.Str(description="Category ID (e.g. 'entree', 'plat', 'dessert')")
    name = fields.Str(description="Dish name")
    order = fields.Int()
    tags = fields.List(fields.Dict(), description="Dietary tags")
    certifications = fields.List(fields.Dict(), description="Certifications")


class MenuSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    id = fields.Int(dump_only=True)
    restaurant_id = fields.Int()
    date = fields.Str(description="Menu date (YYYY-MM-DD)")
    status = fields.Str(description="'draft' or 'published'")
    items = fields.List(fields.Nested(MenuItemSchema))
    images = fields.List(fields.Dict())
    item_images = fields.List(fields.Dict())
    chef_note = fields.Str(allow_none=True)
    published_at = fields.Str(allow_none=True)


class MenuListSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    menus = fields.List(fields.Nested(MenuSchema))


class MenuCreateSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    date = fields.Str(required=True, description="Menu date (YYYY-MM-DD)")
    restaurant_id = fields.Int()
    items = fields.List(fields.Dict(), description="List of menu items")
    chef_note = fields.Str(allow_none=True, description="Chef's note (max 300 chars)")


class MenuUpdateSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    items = fields.List(fields.Dict(), description="List of menu items")
    chef_note = fields.Str(allow_none=True, description="Chef's note (max 300 chars)")


# Public display schemas (no auth required)
class PublicMenuItemSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    name = fields.Str()
    category = fields.Str()
    tags = fields.List(fields.Dict())
    certifications = fields.List(fields.Dict())


class PublicDayMenuSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    date = fields.Str()
    day_name = fields.Str()
    restaurant = fields.Dict(allow_none=True)
    menu = fields.Dict(allow_none=True, description="Formatted menu for display, or null if not available")


class WeekMenuSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    week_start = fields.Str()
    week_end = fields.Str()
    restaurant = fields.Dict(allow_none=True)
    menus = fields.Dict(description="Map of date -> menu data")


class PublicMenuSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    menus = fields.Dict(description="Map of date -> {day_name, menu}")
    week_start = fields.Str()
    week_end = fields.Str()
    restaurant_id = fields.Int()
    service_days = fields.List(fields.Int())
