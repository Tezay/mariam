from marshmallow import EXCLUDE, Schema, fields, validate

from .public import (
    PublicImageSchema,
    PublicMenuSchema,
    PublicSubstitutionSchema,
)

CHEF_NOTE_MAX = 300
MENU_IMAGES_MAX = 6
SUBSTITUTES_MAX = 3


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


class MenuImageSchema(PublicImageSchema):
    id = fields.Int(metadata={'description': "For the site's editors"})


class MenuSchema(PublicMenuSchema):
    """A menu; the fields described as for the site's editors are absent for anyone else."""
    status = fields.Str(
        validate=validate.OneOf(['draft', 'published']),
        metadata={'description': "For the site's editors"},
    )
    published_at = fields.DateTime(
        allow_none=True, metadata={'description': "For the site's editors"}
    )
    updated_at = fields.DateTime(allow_none=True, metadata={'description': "For the site's editors"})
    images = fields.List(fields.Nested(MenuImageSchema), required=True)


class MenuListSchema(Schema):
    items = fields.List(fields.Nested(MenuSchema), required=True)


class MenuItemInputSchema(Schema):
    """An item kept by its `id`; a new one names a dish by `dish_id`, or by `name`,
    which finds the dish of that name in the category or adds it to the catalog.
    """
    class Meta:
        unknown = EXCLUDE
    id = fields.Int()
    category_id = fields.Int(required=True)
    dish_id = fields.Int()
    name = fields.Str(validate=validate.Length(max=200))
    tag_ids = fields.List(fields.Str(), load_default=list)
    certification_ids = fields.List(fields.Str(), load_default=list)
    order = fields.Int()
    is_out_of_stock = fields.Bool()


class MenuWriteSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    items = fields.List(fields.Nested(MenuItemInputSchema), required=True)
    chef_note = fields.Str(
        required=True, allow_none=True, validate=validate.Length(max=CHEF_NOTE_MAX)
    )


class MenuPatchSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    chef_note = fields.Str(
        required=True, allow_none=True, validate=validate.Length(max=CHEF_NOTE_MAX)
    )


class MenuItemPatchSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    is_out_of_stock = fields.Bool(required=True)


class ImageOrderSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    image_ids = fields.List(
        fields.Int(),
        required=True,
        metadata={'description': "Every image of the menu, in their new order"},
    )


class MenuImageListSchema(Schema):
    items = fields.List(fields.Nested(MenuImageSchema), required=True)


class SubstitutesInputSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    dish_ids = fields.List(
        fields.Int(),
        required=True,
        validate=validate.Length(max=SUBSTITUTES_MAX),
        metadata={'description': "In order of preference"},
    )


class SubstituteListSchema(Schema):
    items = fields.List(fields.Nested(PublicSubstitutionSchema), required=True)
