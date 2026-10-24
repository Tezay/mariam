from marshmallow import EXCLUDE, Schema, fields, validate

from ..models.category import MenuCategory

LABEL = validate.Length(min=1, max=100)
COLOR = validate.OneOf(MenuCategory.COLOR_KEYS)


class MenuCategorySchema(Schema):
    id = fields.Int(required=True)
    parent_id = fields.Int(allow_none=True, required=True)
    label = fields.Str(required=True)
    order = fields.Int(required=True)
    is_protected = fields.Bool(required=True, metadata={'description': "It cannot be deleted"})
    is_highlighted = fields.Bool(required=True)
    color_key = fields.Str(allow_none=True, required=True, validate=COLOR)
    subcategories = fields.List(
        fields.Nested(lambda: MenuCategorySchema()),
        metadata={'description': "On a top-level category"},
    )


class MenuCategoryListSchema(Schema):
    items = fields.List(fields.Nested(MenuCategorySchema), required=True)


class MenuCategoryInputSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    label = fields.Str(required=True, validate=LABEL)
    parent_id = fields.Int(
        allow_none=True, load_default=None, metadata={'description': "A top-level category"}
    )
    order = fields.Int(metadata={'description': "After the others by default"})
    move_dishes = fields.Bool(
        load_default=False,
        metadata={'description': "Move the parent's dishes into the new subcategory"},
    )


class MenuCategoryPatchSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    label = fields.Str(validate=LABEL)
    is_highlighted = fields.Bool()
    color_key = fields.Str(allow_none=True, validate=COLOR)


class CategoryOrderSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    category_ids = fields.List(
        fields.Int(),
        required=True,
        metadata={'description': "Every category of one level, once, in the new order"},
    )
