from marshmallow import Schema, fields, EXCLUDE


class DietaryTagSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    id = fields.Str()
    label = fields.Str()
    icon = fields.Str()
    color = fields.Str()
    category_id = fields.Str()
    sort_order = fields.Int()


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
    id = fields.Str()
    name = fields.Str()
    official_name = fields.Str()
    issuer = fields.Str()
    scheme_type = fields.Str()
    jurisdiction = fields.Str()
    guarantee = fields.Str()
    logo_filename = fields.Str()
    category_id = fields.Str()
    sort_order = fields.Int()


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
