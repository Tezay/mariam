"""Schémas de sortie du centre de notifications in-app (inbox)."""
from marshmallow import EXCLUDE, Schema, fields, validate


class NotificationSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    id = fields.Int(dump_only=True)
    type = fields.Str()
    title = fields.Str()
    body = fields.Str(allow_none=True)
    is_read = fields.Bool()
    meta = fields.Dict()
    created_at = fields.Str()


class NotificationListSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    notifications = fields.List(fields.Nested(NotificationSchema))


class UnreadCountSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    count = fields.Int()


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
    holiday_alert_days_before = fields.Int()
    weekly_digest = fields.Bool()
    digest_day = fields.Int(validate=validate.Range(min=0, max=6))
    digest_hour = fields.Int(validate=validate.Range(min=6, max=21))
