"""Schémas de sortie du centre de notifications in-app (inbox)."""
from marshmallow import EXCLUDE, Schema, fields


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


class LiveAlertListSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    alerts = fields.List(fields.Nested(LiveAlertSchema))


class InboxPreferencesSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    notify_menu_unpublished = fields.Bool()
    notify_menu_during_service = fields.Bool()
    notify_holiday_approaching = fields.Bool()
    holiday_alert_days_before = fields.Int()
