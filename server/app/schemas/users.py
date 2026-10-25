from marshmallow import EXCLUDE, Schema, fields


class UiPreferencesSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    tour_done = fields.Bool()
    tour_catalog_done = fields.Bool()
    tour_stats_done = fields.Bool()
