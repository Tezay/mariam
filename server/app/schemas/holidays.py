from marshmallow import EXCLUDE, Schema, fields, validate

from ..services.holidays import SCHOOL_ZONES

# The days come from the official calendars as ISO strings, and are cached as such.
DAY = {'format': 'date'}


class HolidaySchema(Schema):
    date = fields.Str(required=True, metadata=DAY)
    description = fields.Str(required=True)


class HolidayListSchema(Schema):
    items = fields.List(fields.Nested(HolidaySchema), required=True)


class SchoolHolidaySchema(Schema):
    start_date = fields.Str(required=True, metadata=DAY)
    end_date = fields.Str(required=True, metadata=DAY)
    description = fields.Str(required=True)


class SchoolHolidayListSchema(Schema):
    items = fields.List(fields.Nested(SchoolHolidaySchema), required=True)


class ZoneQuerySchema(Schema):
    class Meta:
        unknown = EXCLUDE

    zone = fields.Str(load_default='A', validate=validate.OneOf(SCHOOL_ZONES))
