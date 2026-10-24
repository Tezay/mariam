from marshmallow import EXCLUDE, Schema, fields

from .public import PublicImageSchema


class ImageSchema(PublicImageSchema):
    id = fields.Int(metadata={'description': "For the site's editors"})


class ImageListSchema(Schema):
    items = fields.List(fields.Nested(ImageSchema), required=True)


class ImageOrderSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    image_ids = fields.List(
        fields.Int(), required=True, metadata={'description': "Every image, once, in the new order"}
    )
