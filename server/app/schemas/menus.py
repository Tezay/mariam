from marshmallow import EXCLUDE, Schema, fields, validate

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
    move_dishes = fields.Bool(load_default=False)


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
    # [{"id": 1, "order": 0}, ...]
    items = fields.List(fields.Dict(), required=True)


class MenuItemSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    id = fields.Int(dump_only=True)
    menu_id = fields.Int(dump_only=True)
    category_id = fields.Int(metadata={'description': "MenuCategory.id"})
    dish_id = fields.Int(metadata={'description': "DishCatalog.id"})
    dish = fields.Nested(DishCatalogSchema, allow_none=True, dump_only=True)
    order = fields.Int()
    is_out_of_stock = fields.Bool()


class MenuSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    id = fields.Int(dump_only=True)
    restaurant_id = fields.Int()
    date = fields.Str(metadata={'description': "Menu date (YYYY-MM-DD)"})
    status = fields.Str(metadata={'description': "'draft' or 'published'"})
    items = fields.List(fields.Nested(MenuItemSchema))
    substitutions = fields.Dict(
        dump_only=True,
        metadata={'description': "Map of category_id -> [{dish, order}] substitution dishes"},
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
    date = fields.Str(required=True, metadata={'description': "Menu date (YYYY-MM-DD)"})
    restaurant_id = fields.Int()
    items = fields.List(fields.Dict(), metadata={'description': "List of menu items"})
    chef_note = fields.Str(allow_none=True, metadata={'description': "Chef's note (max 300 chars)"})


class MenuUpdateSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    items = fields.List(fields.Dict(), metadata={'description': "List of menu items"})
    chef_note = fields.Str(allow_none=True, metadata={'description': "Chef's note (max 300 chars)"})


class WeekPublishSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    week_offset = fields.Int(
        load_default=0,
        validate=validate.Range(min=-52, max=52),
        metadata={'description': 'Weeks from the current one: 1 publishes next week.'},
    )


class MenuItemStockSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    is_out_of_stock = fields.Bool(required=True)


class WeekMenuSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    week_start = fields.Str()
    week_end = fields.Str()
    restaurant = fields.Dict(allow_none=True)
    menus = fields.Dict(metadata={'description': "Map of date -> menu data"})
