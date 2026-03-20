from marshmallow import Schema, fields, EXCLUDE


class GalleryTagSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    id = fields.Int(dump_only=True)
    name = fields.Str()
    tag_type = fields.Str(description="'dish', 'category', or 'manual'")
    category_id = fields.Str(allow_none=True)


class GalleryImageSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    id = fields.Int(dump_only=True)
    restaurant_id = fields.Int()
    url = fields.Str()
    filename = fields.Str(allow_none=True)
    file_size = fields.Int(allow_none=True)
    mime_type = fields.Str(allow_none=True)
    created_at = fields.Str(dump_only=True, allow_none=True)
    tags = fields.List(fields.Nested(GalleryTagSchema))
    usage_count = fields.Int(dump_only=True)


class GalleryListSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    images = fields.List(fields.Nested(GalleryImageSchema))
    total = fields.Int()
    page = fields.Int()
    per_page = fields.Int()
    pages = fields.Int()
