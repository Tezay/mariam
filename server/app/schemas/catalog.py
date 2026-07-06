from marshmallow import EXCLUDE, Schema, fields, validate


class DishCatalogSchema(Schema):
    """Sérialisation d'une entité plat du catalogue."""
    class Meta:
        unknown = EXCLUDE

    id = fields.Int(dump_only=True)
    restaurant_id = fields.Int(dump_only=True)
    category_id = fields.Int(allow_none=True)
    name = fields.Str()
    image_url = fields.Str(allow_none=True)
    usage_count = fields.Int(dump_only=True)
    tags = fields.List(fields.Dict(), dump_only=True)
    certifications = fields.List(fields.Dict(), dump_only=True)
    created_at = fields.Str(dump_only=True)


class DishCatalogCreateSchema(Schema):
    """Création d'un plat dans le catalogue."""
    class Meta:
        unknown = EXCLUDE

    name = fields.Str(required=True, validate=validate.Length(min=1, max=200))
    category_id = fields.Int(allow_none=True, load_default=None)
    tag_ids = fields.List(fields.Str(), load_default=[])
    certification_ids = fields.List(fields.Str(), load_default=[])


class DishCatalogUpdateSchema(Schema):
    """Mise à jour d'un plat dans le catalogue (champs partiels)."""
    class Meta:
        unknown = EXCLUDE

    name = fields.Str(validate=validate.Length(min=1, max=200))
    category_id = fields.Int(allow_none=True)
    tag_ids = fields.List(fields.Str())
    certification_ids = fields.List(fields.Str())


class CategorySubstitutionSchema(Schema):
    """Plat de substitution par menu et par catégorie."""
    class Meta:
        unknown = EXCLUDE

    id = fields.Int(dump_only=True)
    menu_id = fields.Int(dump_only=True)
    category_id = fields.Int(dump_only=True)
    dish = fields.Nested(DishCatalogSchema, dump_only=True)
    order = fields.Int()
