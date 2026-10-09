"""Output schemas of the in-app alerts and of their preferences."""
from marshmallow import EXCLUDE, Schema, fields, validate


class LiveAlertSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    key = fields.Str()
    title = fields.Str()
    body = fields.Str()
    severity = fields.Str(description="info | warning | error")
    site_ids = fields.List(fields.Int())
    site_names = fields.List(fields.Str())


class LiveAlertListSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    alerts = fields.List(fields.Nested(LiveAlertSchema))


class InboxPreferencesSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    notify_menu_unpublished = fields.Bool()
    notify_menu_during_service = fields.Bool()
    notify_menu_tomorrow = fields.Bool()
    notify_traffic_drop = fields.Bool()
    notify_low_satisfaction = fields.Bool()
    notify_vote_anomaly = fields.Bool()
    notify_site_inactive = fields.Bool()
    notify_holiday_approaching = fields.Bool()
    holiday_alert_days_before = fields.Int(strict=True, validate=validate.Range(min=1, max=30))
    weekly_digest = fields.Bool()
    digest_day = fields.Int(strict=True, validate=validate.Range(min=0, max=6))
    digest_hour = fields.Int(strict=True, validate=validate.Range(min=6, max=21))
