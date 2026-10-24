from marshmallow import EXCLUDE, Schema, ValidationError, fields, validate, validates_schema

from ..data.site_profile import PAYMENT_METHODS
from ..models.menu_vote import VOTE_ICON_PRESETS
from .common import SiteName
from .public import PublicSiteSchema

DAYS = [str(day) for day in range(7)]
HOUR = validate.Regexp(r'^([01]\d|2[0-3]):[0-5]\d$', error='Une heure au format HH:MM.')
ZONES = ['A', 'B', 'C']


class SiteSchema(PublicSiteSchema):
    """A site; the fields described as for the site's editors are absent for anyone else."""
    vote_category_ids = fields.List(
        fields.Int(), metadata={'description': "For the site's editors: the categories a vote names"}
    )


class ServiceHoursInputSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    open = fields.Str(required=True, validate=HOUR)
    close = fields.Str(required=True, validate=HOUR)

    @validates_schema
    def check_order(self, data, **kwargs):
        if data['close'] <= data['open']:
            raise ValidationError("La fermeture suit l'ouverture.", 'close')


class SitePatchSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    name = SiteName()
    address_label = fields.Str(allow_none=True, validate=validate.Length(max=300))
    address_lat = fields.Float(allow_none=True, validate=validate.Range(min=-90, max=90))
    address_lon = fields.Float(allow_none=True, validate=validate.Range(min=-180, max=180))
    email = fields.Email(allow_none=True, validate=validate.Length(max=150))
    phone = fields.Str(allow_none=True, validate=validate.Length(max=30))
    capacity = fields.Int(allow_none=True, validate=validate.Range(min=0))
    payment_methods = fields.List(
        fields.Str(validate=validate.OneOf(PAYMENT_METHODS)), allow_none=True
    )
    pmr_access = fields.Bool(allow_none=True, metadata={'description': "None when unknown"})
    service_days = fields.List(
        fields.Int(validate=validate.Range(min=0, max=6)), metadata={'description': "0 is Monday"}
    )
    service_hours = fields.Dict(
        keys=fields.Str(validate=validate.OneOf(DAYS)),
        values=fields.Nested(ServiceHoursInputSchema),
        metadata={'description': "Replaces every day's hours; a day left out has none"},
    )
    vote_enabled = fields.Bool()
    vote_icon_preset = fields.Str(validate=validate.OneOf(VOTE_ICON_PRESETS))
    vote_category_ids = fields.List(
        fields.Int(), metadata={'description': "Categories of the site a vote names"}
    )
    tag_ids = fields.List(fields.Str(), metadata={'description': "The dietary tags the site uses"})
    certification_ids = fields.List(
        fields.Str(), metadata={'description': "The certifications the site uses"}
    )


class CalendarSettingsSchema(Schema):
    show_public_holidays = fields.Bool(required=True)
    show_school_vacations = fields.Bool(required=True)
    school_vacation_zone = fields.Str(
        allow_none=True, required=True, validate=validate.OneOf(ZONES)
    )


class CalendarSettingsPatchSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    show_public_holidays = fields.Bool()
    show_school_vacations = fields.Bool()
    school_vacation_zone = fields.Str(allow_none=True, validate=validate.OneOf(ZONES))
