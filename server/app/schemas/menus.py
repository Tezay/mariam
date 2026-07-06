from marshmallow import EXCLUDE, Schema, fields

from .catalog import DishCatalogSchema


class MenuCategorySchema(Schema):
    class Meta:
        unknown = EXCLUDE
    id = fields.Int(dump_only=True)
    restaurant_id = fields.Int(dump_only=True)
    parent_id = fields.Int(allow_none=True)
    label = fields.Str()
    order = fields.Int()
    is_protected = fields.Bool(dump_only=True)
    is_highlighted = fields.Bool()
    color_key = fields.Str(allow_none=True)
    subcategories = fields.List(fields.Nested(lambda: MenuCategorySchema()), dump_only=True)


class MenuCategoryCreateSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    parent_id = fields.Int(allow_none=True, load_default=None)
    label = fields.Str(required=True)
    order = fields.Int(load_default=0)


class MenuCategoryUpdateSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    label = fields.Str()
    order = fields.Int()
    is_highlighted = fields.Bool()
    color_key = fields.Str(allow_none=True)


class MenuCategoryReorderSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    # Liste d'ids ordonnés : [{"id": 1, "order": 0}, ...]
    items = fields.List(fields.Dict(), required=True)


class MenuItemSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    id = fields.Int(dump_only=True)
    menu_id = fields.Int(dump_only=True)
    category_id = fields.Int(description="MenuCategory.id")
    dish_id = fields.Int(description="DishCatalog.id")
    dish = fields.Nested(DishCatalogSchema, allow_none=True, dump_only=True)
    order = fields.Int()
    is_out_of_stock = fields.Bool()


class MenuSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    id = fields.Int(dump_only=True)
    restaurant_id = fields.Int()
    date = fields.Str(description="Menu date (YYYY-MM-DD)")
    status = fields.Str(description="'draft' or 'published'")
    items = fields.List(fields.Nested(MenuItemSchema))
    substitutions = fields.Dict(
        dump_only=True,
        description="Map of category_id -> [{dish, order}] substitution dishes",
    )
    images = fields.List(fields.Dict())
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


class MenuItemStockSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    is_out_of_stock = fields.Bool(required=True)


# Public display schemas (no auth required)
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
