from urllib.parse import urlsplit

from marshmallow import EXCLUDE, Schema, ValidationError, fields, validate, validates_schema

from ..data.site_profile import (
    LINK_KINDS,
    LINKS_MAX,
    PAYMENT_METHODS,
    SERVICE_CAPACITY_MAX,
    SERVICES,
)
from ..models.menu_vote import VOTE_ICON_PRESETS
from ..services.menu_window import DAYS_AHEAD_MAX, DAYS_BACK_MAX
from .common import FileUploadSchema, HttpsUrl, PlainText, RequestSchema, SiteName
from .public import PublicSitePhotoSchema, PublicSiteSchema

DAYS = [str(day) for day in range(7)]
HOUR = validate.Regexp(r'^([01]\d|2[0-3]):[0-5]\d$', error='Une heure au format HH:MM.')
ZONES = ['A', 'B', 'C']


EDITORS = "For the site's editors"


class SitePhotoSchema(PublicSitePhotoSchema):
    id = fields.Int(metadata={'description': EDITORS})


class SitePhotoListSchema(Schema):
    items = fields.List(fields.Nested(SitePhotoSchema), required=True)


class SiteSchema(PublicSiteSchema):
    """A site; the fields described as for the site's editors are absent for anyone else."""
    photos = fields.List(fields.Nested(SitePhotoSchema), required=True)
    vote_category_ids = fields.List(
        fields.Int(), metadata={'description': f'{EDITORS}: the categories a vote names'}
    )
    menu_days_ahead = fields.Int(
        metadata={'description': f'{EDITORS}: how many days ahead `menu_window` reaches'}
    )
    menu_days_back = fields.Int(
        metadata={'description': f'{EDITORS}: how many days back `menu_window` reaches'}
    )


class SiteLinkInputSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    kind = fields.Str(required=True, validate=validate.OneOf(LINK_KINDS))
    url = HttpsUrl(required=True)
    label = PlainText(40, allow_none=True, metadata={'description': "A website's only"})

    @validates_schema
    def check_kind(self, data, **kwargs):
        hosts = LINK_KINDS[data['kind']]
        if hosts is None:
            if not data.get('label'):
                raise ValidationError('Nommez ce lien, par exemple « Site du Crous ».', 'label')
            return
        if data.get('label'):
            raise ValidationError('Ce type de lien porte déjà son nom.', 'label')
        host = (urlsplit(data['url']).hostname or '').lower()
        if not any(host == allowed or host.endswith(f'.{allowed}') for allowed in hosts):
            raise ValidationError("Cette adresse ne correspond pas au type de lien choisi.", 'url')


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
    service_capacity = fields.Int(
        allow_none=True, validate=validate.Range(min=1, max=SERVICE_CAPACITY_MAX)
    )
    payment_methods = fields.List(
        fields.Str(validate=validate.OneOf(PAYMENT_METHODS)), allow_none=True
    )
    pmr_access = fields.Bool(allow_none=True, metadata={'description': "None when unknown"})
    tagline = PlainText(160, allow_none=True)
    description = PlainText(800, multiline=True, allow_none=True)
    access_info = PlainText(300, multiline=True, allow_none=True)
    quality_commitments = PlainText(600, multiline=True, allow_none=True)
    address_city = PlainText(100, allow_none=True)
    address_postcode = fields.Str(
        allow_none=True,
        validate=validate.Regexp(r'^\d{5}$', error='Un code postal à cinq chiffres.'),
    )
    services = fields.List(fields.Str(validate=validate.OneOf(SERVICES)))
    links = fields.List(
        fields.Nested(SiteLinkInputSchema), validate=validate.Length(max=LINKS_MAX),
        metadata={'description': "Replaces the site's links, in their order"},
    )
    menu_days_ahead = fields.Int(validate=validate.Range(min=0, max=DAYS_AHEAD_MAX))
    menu_days_back = fields.Int(validate=validate.Range(min=0, max=DAYS_BACK_MAX))
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

    @validates_schema
    def one_link_per_kind(self, data, **kwargs):
        kinds = [link['kind'] for link in data.get('links', []) if LINK_KINDS[link['kind']]]
        if len(kinds) != len(set(kinds)):
            raise ValidationError('Un seul lien de chaque type, hors site web.', 'links')


class LiveStatusInputSchema(RequestSchema):
    capacity_reached = fields.Bool(required=True)


class SitePhotoAltSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    alt = PlainText(
        150, required=True, metadata={'description': "What it shows, for screen readers"}
    )


class SitePhotoUploadSchema(FileUploadSchema, SitePhotoAltSchema):
    pass


class PhotoOrderSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    photo_ids = fields.List(
        fields.Int(), required=True, metadata={'description': "Every photo, once, in the new order"}
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
