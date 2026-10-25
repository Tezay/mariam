from marshmallow import EXCLUDE, Schema, fields, validate

from ..services.org_catalog import SORTS
from ..services.service_calendar import MENU_STATUSES
from .common import PageQuerySchema
from .dishes import PERIODS, DistributionSchema
from .public import PublicSiteSummarySchema

SUPERVISORS = {'description': "For the organization's supervisors"}


class OrgSiteSchema(PublicSiteSummarySchema):
    """A site; the fields described as for the supervisors are absent for anyone else."""
    is_active = fields.Bool(metadata=SUPERVISORS)
    member_count = fields.Int(metadata=SUPERVISORS)
    today_menu_status = fields.Str(validate=validate.OneOf(MENU_STATUSES), metadata=SUPERVISORS)
    upcoming_events = fields.Int(metadata=SUPERVISORS)
    last_published_at = fields.DateTime(allow_none=True, metadata=SUPERVISORS)


class OrgSiteListSchema(Schema):
    items = fields.List(fields.Nested(OrgSiteSchema), required=True)


class OrgDishGroupQuerySchema(PageQuerySchema):
    class Meta:
        unknown = EXCLUDE

    q = fields.Str(load_default='', metadata={'description': "Part of the name"})
    sort = fields.Str(load_default='usage', validate=validate.OneOf(SORTS))
    order = fields.Str(
        validate=validate.OneOf(['asc', 'desc']),
        metadata={'description': "A to Z for a name, best first for a measure, by default"},
    )
    period = fields.Str(load_default='all', validate=validate.OneOf(PERIODS))
    per_page = fields.Int(load_default=24, validate=validate.Range(min=1, max=200))


class OrgDishGroupSiteSchema(Schema):
    site = fields.Str(required=True)
    site_name = fields.Str(required=True)
    dish_id = fields.Int(required=True, metadata={'description': "The dish, in the site's catalog"})
    has_image = fields.Bool(required=True)


class OrgDishGroupSummarySchema(Schema):
    normalized_name = fields.Str(required=True, metadata={'description': "The group's address"})
    display_name = fields.Str(required=True)
    image_url = fields.Str(required=True, allow_none=True)
    site_count = fields.Int(required=True)
    photo_count = fields.Int(required=True)
    usage_count = fields.Int(required=True)
    votes = fields.Int(required=True)
    score = fields.Float(required=True, allow_none=True)
    sites = fields.List(fields.Nested(OrgDishGroupSiteSchema), required=True)


class OrgDishGroupListSchema(Schema):
    items = fields.List(fields.Nested(OrgDishGroupSummarySchema), required=True)
    total_count = fields.Int(required=True)


class OrgDishGroupSiteFiguresSchema(OrgDishGroupSiteSchema):
    usage_count = fields.Int(required=True)
    votes = fields.Int(required=True)
    score = fields.Float(required=True, allow_none=True)


class RatingPointSchema(Schema):
    date = fields.Str(required=True, metadata={'format': 'date'})
    votes = fields.Int(required=True)
    score = fields.Float(required=True)


class OrgDishGroupSchema(OrgDishGroupSummarySchema):
    distribution = fields.Nested(DistributionSchema, required=True)
    series = fields.List(fields.Nested(RatingPointSchema), required=True)
    sites = fields.List(fields.Nested(OrgDishGroupSiteFiguresSchema), required=True)
