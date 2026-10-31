"""The four analytics reports, for one site or for the sites of an organization.

Dates and times are strings: a report may come back from the cache as JSON.
"""
from marshmallow import EXCLUDE, Schema, ValidationError, fields, validate, validates_schema

from ..services.analytics_stats import (
    DEFAULT_MIN_DISH_VOTES,
    DEFAULT_PERIOD,
    MAX_RANGE_DAYS,
    PERIODS,
)
from ..utils.time import paris_today
from .dishes import DistributionSchema

DATE = {'format': 'date'}
DATE_TIME = {'format': 'date-time'}


class AnalyticsQuerySchema(Schema):
    class Meta:
        unknown = EXCLUDE

    start = fields.Date(data_key='from', metadata={'description': "In place of `period`"})
    end = fields.Date(data_key='to', metadata={'description': "Included; today at the latest"})
    period = fields.Str(
        load_default=DEFAULT_PERIOD, validate=validate.OneOf(list(PERIODS)),
        metadata={'description': "The days up to `to`, without `from`"},
    )

    @validates_schema
    def check_range(self, data, **kwargs):
        if 'start' not in data:
            return
        if 'end' in data and data['end'] < data['start']:
            raise ValidationError('La fin précède le début.', 'to')
        end = min(data.get('end') or paris_today(), paris_today())
        if (end - data['start']).days + 1 > MAX_RANGE_DAYS:
            raise ValidationError(f'{MAX_RANGE_DAYS} jours au plus.', 'from')


class SatisfactionQuerySchema(AnalyticsQuerySchema):
    min_votes = fields.Int(
        load_default=DEFAULT_MIN_DISH_VOTES, validate=validate.Range(min=1),
        metadata={'description': "Votes a dish needs to be ranked"},
    )


class OrgAnalyticsQuerySchema(AnalyticsQuerySchema):
    sites = fields.Str(
        metadata={'description': "Comma-separated slugs; those outside the organization are left out"}
    )


class OrgSatisfactionQuerySchema(OrgAnalyticsQuerySchema, SatisfactionQuerySchema):
    pass


class MetricSchema(Schema):
    value = fields.Float(required=True, allow_none=True)
    previous = fields.Float(required=True, allow_none=True)
    delta = fields.Float(required=True, allow_none=True)
    delta_pct = fields.Float(required=True, allow_none=True)


class CompletenessSchema(Schema):
    categories_filled_rate = fields.Float(required=True, allow_none=True)
    photo_rate = fields.Float(required=True, allow_none=True)
    chef_note_rate = fields.Float(required=True, allow_none=True)


class DishRowSchema(Schema):
    dish_id = fields.Int(required=True)
    name = fields.Str(required=True)
    site = fields.Str(required=True)
    site_name = fields.Str(required=True)
    votes = fields.Int(required=True)
    score = fields.Float(required=True)


class PeriodSchema(Schema):
    start = fields.Str(required=True, metadata=DATE)
    end = fields.Str(required=True, metadata=DATE)
    days = fields.Int(required=True)


class SiteCountSchema(Schema):
    total = fields.Int(required=True)
    active = fields.Int(required=True)


class KpisSchema(Schema):
    sites = fields.Nested(SiteCountSchema, required=True)
    publication_rate = fields.Nested(MetricSchema, required=True)
    punctuality_rate = fields.Nested(MetricSchema, required=True)
    avg_lead_time_hours = fields.Nested(MetricSchema, required=True)
    completeness = fields.Nested(CompletenessSchema, required=True)
    views = fields.Nested(MetricSchema, required=True)
    unique_visitors = fields.Nested(MetricSchema, required=True)
    satisfaction = fields.Nested(MetricSchema, required=True)
    participation_rate = fields.Nested(MetricSchema, required=True)


class TrendPointSchema(Schema):
    date = fields.Str(required=True, metadata=DATE)
    published_sites = fields.Int(required=True)
    views = fields.Int(required=True, allow_none=True)
    unique_visitors = fields.Int(required=True, allow_none=True)
    score = fields.Float(required=True, allow_none=True)


class OverviewSiteSchema(Schema):
    site = fields.Str(required=True)
    name = fields.Str(required=True)
    is_active = fields.Bool(required=True)
    publication_rate = fields.Float(required=True, allow_none=True)
    punctuality_rate = fields.Float(required=True, allow_none=True)
    last_published_at = fields.Str(required=True, allow_none=True, metadata=DATE_TIME)
    views = fields.Int(required=True, allow_none=True)
    views_sparkline = fields.List(fields.Int(), required=True, allow_none=True)
    score = fields.Float(required=True, allow_none=True)
    votes = fields.Int(required=True, allow_none=True)


class OverviewScopeSchema(Schema):
    site_count = fields.Int(required=True)


class OverviewReportSchema(Schema):
    period = fields.Nested(PeriodSchema, required=True)
    scope = fields.Nested(OverviewScopeSchema, required=True)
    kpis = fields.Nested(KpisSchema, required=True)
    trend = fields.List(fields.Nested(TrendPointSchema), required=True)
    sites = fields.List(fields.Nested(OverviewSiteSchema), required=True)
    top_dishes = fields.List(fields.Nested(DishRowSchema), required=True)
    flop_dishes = fields.List(fields.Nested(DishRowSchema), required=True)


class PublicationSummarySchema(Schema):
    publication_rate = fields.Float(required=True, allow_none=True)
    punctuality_rate = fields.Float(required=True, allow_none=True)
    avg_lead_time_hours = fields.Float(required=True, allow_none=True)
    completeness = fields.Nested(CompletenessSchema, required=True)


class PublicationSiteSchema(CompletenessSchema):
    site = fields.Str(required=True)
    name = fields.Str(required=True)
    publication_rate = fields.Float(required=True, allow_none=True)
    punctuality_rate = fields.Float(required=True, allow_none=True)
    avg_lead_time_hours = fields.Float(required=True, allow_none=True)


class PublicationDaySchema(Schema):
    date = fields.Str(required=True, metadata=DATE)
    status = fields.Str(required=True, validate=validate.OneOf(
        ['published_on_time', 'published_late', 'draft', 'missing', 'closed']
    ))


class PublicationMatrixRowSchema(Schema):
    site = fields.Str(required=True)
    name = fields.Str(required=True)
    days = fields.List(fields.Nested(PublicationDaySchema), required=True)


class PublicationsReportSchema(Schema):
    summary = fields.Nested(PublicationSummarySchema, required=True)
    sites = fields.List(fields.Nested(PublicationSiteSchema), required=True)
    matrix = fields.List(
        fields.Nested(PublicationMatrixRowSchema), required=True,
        metadata={'description': "The last 30 days, whatever the period"},
    )


class TrafficPointSchema(Schema):
    date = fields.Str(required=True, metadata=DATE)
    views = fields.Int(required=True)
    unique_visitors = fields.Int(required=True)


class TrafficSiteSchema(Schema):
    site = fields.Str(required=True)
    name = fields.Str(required=True)
    views = fields.Int(required=True)
    unique_visitors = fields.Int(required=True)
    delta_pct = fields.Float(required=True, allow_none=True)
    sparkline = fields.List(fields.Int(), required=True)


class PageKindViewsSchema(Schema):
    page_kind = fields.Str(required=True)
    views = fields.Int(required=True)


class HourViewsSchema(Schema):
    hour = fields.Int(required=True)
    views = fields.Int(required=True)


class TrafficTotalsSchema(Schema):
    views = fields.Int(required=True)
    unique_visitors = fields.Int(required=True)
    org_root_views = fields.Int(required=True)


class CapacityReachedSchema(Schema):
    services = fields.Int(required=True)
    sites = fields.Int(required=True)
    usual_time = fields.Str(
        required=True, allow_none=True, metadata={'description': "HH:MM, Paris time"}
    )


class TrafficReportSchema(Schema):
    granularity = fields.Str(required=True, validate=validate.OneOf(['day', 'hour']))
    series = fields.List(fields.Nested(TrafficPointSchema), required=True)
    by_site = fields.List(fields.Nested(TrafficSiteSchema), required=True)
    by_page_kind = fields.List(fields.Nested(PageKindViewsSchema), required=True)
    hour_profile = fields.List(fields.Nested(HourViewsSchema), required=True)
    totals = fields.Nested(TrafficTotalsSchema, required=True)
    capacity_reached = fields.Nested(
        CapacityReachedSchema,
        required=True,
        metadata={'description': "The services whose team said the capacity was reached"},
    )


class SatisfactionSummarySchema(Schema):
    score = fields.Float(required=True, allow_none=True)
    delta = fields.Float(required=True, allow_none=True)
    votes = fields.Int(required=True)
    participation_rate = fields.Float(required=True, allow_none=True)
    distribution = fields.Nested(DistributionSchema, required=True)


class PresetRowSchema(Schema):
    preset = fields.Str(required=True)
    votes = fields.Int(required=True)
    score = fields.Float(required=True, allow_none=True)


class SatisfactionPointSchema(Schema):
    date = fields.Str(metadata={**DATE, 'description': "By day"})
    hour = fields.Int(metadata={'description': "By hour, for a single day"})
    votes = fields.Int(required=True)
    score = fields.Float(required=True, allow_none=True)


class SatisfactionSiteSchema(Schema):
    site = fields.Str(required=True)
    name = fields.Str(required=True)
    votes = fields.Int(required=True)
    score = fields.Float(required=True, allow_none=True)
    participation_rate = fields.Float(required=True, allow_none=True)
    delta = fields.Float(required=True, allow_none=True)


class VoteSettingsSchema(Schema):
    site_count = fields.Int(required=True)
    sites_with_vote = fields.Int(required=True)
    icon_preset = fields.Str(
        required=True, allow_none=True,
        metadata={'description': "None when the sites do not all offer the same one"},
    )
    dish_question = fields.Bool(
        required=True, allow_none=True, metadata={'description': "For a single site only"}
    )


class SatisfactionReportSchema(Schema):
    summary = fields.Nested(SatisfactionSummarySchema, required=True)
    granularity = fields.Str(required=True, validate=validate.OneOf(['day', 'hour']))
    by_preset = fields.List(fields.Nested(PresetRowSchema), required=True)
    series = fields.List(fields.Nested(SatisfactionPointSchema), required=True)
    by_site = fields.List(fields.Nested(SatisfactionSiteSchema), required=True)
    top_dishes = fields.List(fields.Nested(DishRowSchema), required=True)
    flop_dishes = fields.List(fields.Nested(DishRowSchema), required=True)
    settings = fields.Nested(VoteSettingsSchema, required=True)
