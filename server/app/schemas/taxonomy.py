from marshmallow import EXCLUDE, Schema, fields, validate


class DietaryTagSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    id = fields.Str(required=True)
    label = fields.Str(required=True)
    icon = fields.Str(required=True)
    color = fields.Str(required=True)
    category_id = fields.Str(required=True)
    sort_order = fields.Int(required=True)


class DietaryTagCategorySchema(Schema):
    class Meta:
        unknown = EXCLUDE
    id = fields.Str()
    name = fields.Str()
    color = fields.Str()
    sort_order = fields.Int()
    tags = fields.List(fields.Nested(DietaryTagSchema))


class CertificationSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    id = fields.Str(required=True)
    name = fields.Str(required=True)
    official_name = fields.Str(required=True)
    issuer = fields.Str(required=True)
    scheme_type = fields.Str(required=True, validate=validate.OneOf(['public', 'private']))
    jurisdiction = fields.Str(
        required=True, validate=validate.OneOf(['france', 'eu', 'international'])
    )
    guarantee = fields.Str(required=True, allow_none=True)
    logo_filename = fields.Str(required=True)
    category_id = fields.Str(required=True)
    sort_order = fields.Int(required=True)


class CertificationCategorySchema(Schema):
    class Meta:
        unknown = EXCLUDE
    id = fields.Str()
    name = fields.Str()
    sort_order = fields.Int()
    certifications = fields.List(fields.Nested(CertificationSchema))


class TaxonomySchema(Schema):
    class Meta:
        unknown = EXCLUDE
    dietary_tag_categories = fields.List(fields.Nested(DietaryTagCategorySchema))
    certification_categories = fields.List(fields.Nested(CertificationCategorySchema))
