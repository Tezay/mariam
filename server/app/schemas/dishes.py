from marshmallow import EXCLUDE, Schema, ValidationError, fields, validate, validates_schema

from ..services.dish_stats import CATALOG_PERIODS, MAX_BATCH
from .common import PageQuerySchema
from .taxonomy import CertificationSchema, DietaryTagSchema

PERIODS = ['all', *CATALOG_PERIODS]
BATCH_MAX = 500


class DishSchema(Schema):
    id = fields.Int(required=True)
    category_id = fields.Int(allow_none=True, required=True)
    name = fields.Str(required=True)
    image_url = fields.Str(allow_none=True, required=True)
    usage_count = fields.Int(
        required=True, metadata={'description': "Menus that served it, over the list's period"}
    )
    votes = fields.Int(required=True)
    score = fields.Float(
        allow_none=True, required=True, metadata={'description': "None below the votes needed"}
    )
    tags = fields.List(fields.Nested(DietaryTagSchema), required=True)
    certifications = fields.List(fields.Nested(CertificationSchema), required=True)
    created_at = fields.DateTime(allow_none=True, required=True)


class DishListSchema(Schema):
    items = fields.List(fields.Nested(DishSchema), required=True)
    total_count = fields.Int(required=True)


class DishFilterSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    category_ids = fields.Str(metadata={'description': "Comma-separated: any of these categories"})
    tag_ids = fields.Str(metadata={'description': "Comma-separated: every one of these tags"})
    certification_ids = fields.Str(
        metadata={'description': "Comma-separated: every one of these certifications"}
    )
    q = fields.Str(metadata={'description': "Words of the name"})
    period = fields.Str(load_default='all', validate=validate.OneOf(PERIODS))
    new_only = fields.Bool(
        load_default=False, metadata={'description': "Only the dishes first served in the period"}
    )


class DishQuerySchema(DishFilterSchema, PageQuerySchema):
    class Meta:
        unknown = EXCLUDE

    sort = fields.Str(load_default='usage', validate=validate.OneOf(['usage', 'name', 'recent', 'score']))
    order = fields.Str(
        validate=validate.OneOf(['asc', 'desc']),
        metadata={'description': "A to Z for a name, best first for a measure, by default"},
    )


class DishExportQuerySchema(DishFilterSchema):
    ids = fields.Str(metadata={'description': "Comma-separated: these dishes, in place of the filters"})


class DishInputSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    name = fields.Str(required=True, validate=validate.Length(min=1, max=200))
    category_id = fields.Int(required=True)
    tag_ids = fields.List(fields.Str(), load_default=list)
    certification_ids = fields.List(fields.Str(), load_default=list)


class DishPatchSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    name = fields.Str(validate=validate.Length(min=1, max=200))
    category_id = fields.Int()
    tag_ids = fields.List(fields.Str())
    certification_ids = fields.List(fields.Str())


class DishStatsQuerySchema(Schema):
    class Meta:
        unknown = EXCLUDE

    period = fields.Str(load_default='all', validate=validate.OneOf(PERIODS))


class DishCompareQuerySchema(DishStatsQuerySchema):
    ids = fields.Str(required=True, metadata={'description': f"Comma-separated, {MAX_BATCH} at most"})


class WeekCountSchema(Schema):
    week = fields.Str(required=True, metadata={'format': 'date', 'description': "Its Monday"})
    count = fields.Int(required=True)


class RatingDaySchema(Schema):
    date = fields.Str(required=True, metadata={'format': 'date'})
    votes = fields.Int(required=True)
    score = fields.Float(required=True)


class StandingSchema(Schema):
    rank = fields.Int(required=True)
    rated_in_category = fields.Int(required=True)
    gap_to_average = fields.Float(required=True)


class DistributionSchema(Schema):
    one = fields.Int(attribute='1', data_key='1', required=True)
    two = fields.Int(attribute='2', data_key='2', required=True)
    three = fields.Int(attribute='3', data_key='3', required=True)


class SatisfactionSchema(Schema):
    enabled = fields.Bool(required=True, metadata={'description': "The site collects votes"})
    votable = fields.Bool(required=True, metadata={'description': "A vote may name this dish"})
    icon_preset = fields.Str(required=True)
    votes = fields.Int(required=True)
    score = fields.Float(allow_none=True, required=True)
    distribution = fields.Nested(
        DistributionSchema, required=True, metadata={'description': "Votes by rating"}
    )
    series = fields.List(fields.Nested(RatingDaySchema), required=True)
    standing = fields.Nested(
        StandingSchema,
        allow_none=True,
        required=True,
        metadata={'description': "None while too few votes rank it in its category"},
    )


class DishStatsSchema(Schema):
    dish_id = fields.Int(required=True)
    week = fields.Int(required=True)
    month = fields.Int(required=True)
    semester = fields.Int(required=True)
    year = fields.Int(required=True)
    history = fields.List(fields.Nested(WeekCountSchema), required=True)
    satisfaction = fields.Nested(SatisfactionSchema, required=True)


class DishStatsListSchema(Schema):
    items = fields.List(fields.Nested(DishStatsSchema), required=True)


class DishIdsSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    ids = fields.List(fields.Int(), required=True, validate=validate.Length(min=1, max=BATCH_MAX))


class DishBatchUpdateSchema(DishIdsSchema):
    category_id = fields.Int(metadata={'description': "A category without subcategories"})
    add_tag_ids = fields.List(fields.Str(), load_default=list)
    remove_tag_ids = fields.List(fields.Str(), load_default=list)
    add_certification_ids = fields.List(fields.Str(), load_default=list)
    remove_certification_ids = fields.List(fields.Str(), load_default=list)

    @validates_schema
    def check_change(self, data, **kwargs):
        if 'category_id' not in data and not any(
            data[key] for key in (
                'add_tag_ids', 'remove_tag_ids', 'add_certification_ids', 'remove_certification_ids'
            )
        ):
            raise ValidationError('Aucune modification demandée.')


class KeptDishSchema(Schema):
    id = fields.Int(required=True)
    name = fields.Str(required=True)
    usage_count = fields.Int(metadata={'description': "Menus that served it, when that kept it"})


class DishBatchDeleteResultSchema(Schema):
    deleted = fields.List(fields.Int(), required=True)
    kept = fields.List(
        fields.Nested(KeptDishSchema), required=True, metadata={'description': "Served by a menu"}
    )


class DishBatchUpdateResultSchema(Schema):
    updated = fields.List(fields.Int(), required=True)
    kept = fields.List(
        fields.Nested(KeptDishSchema),
        required=True,
        metadata={'description': "Unchanged: the category already has a dish of that name"},
    )
