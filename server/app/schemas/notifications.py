from marshmallow import Schema, fields, EXCLUDE


class NotificationPreferencesSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    notify_today_menu = fields.Bool()
    notify_today_menu_time = fields.Str(description="Time HH:MM")
    notify_tomorrow_menu = fields.Bool()
    notify_tomorrow_menu_time = fields.Str(description="Time HH:MM")
    notify_events = fields.Bool()


class SubscribeSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    endpoint = fields.Str(required=True, description="Push subscription endpoint URL")
    keys = fields.Dict(required=True, description="Push subscription keys (p256dh, auth)")
    preferences = fields.Nested(NotificationPreferencesSchema)
    platform = fields.Str(allow_none=True, description="'ios', 'android', or 'desktop'")
    restaurant_id = fields.Int(allow_none=True)


class PreferencesUpdateSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    endpoint = fields.Str(required=True, description="Push subscription endpoint URL")
    preferences = fields.Nested(NotificationPreferencesSchema, required=True)
