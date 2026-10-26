"""What an anonymous caller may read of an organization and its sites."""
from marshmallow import EXCLUDE, Schema, ValidationError, fields, validate, validates_schema

from ..data.site_profile import LINK_KINDS, PAYMENT_METHODS, SERVICES
from ..models import RATING_MAX, RATING_MIN
from ..models.menu_vote import VOTE_ICON_PRESETS
from ..services.menu_window import MAX_RANGE_DAYS
from .taxonomy import CertificationSchema, DietaryTagSchema

# Long enough for a SHA-256 hex digest, and a bound on what an anonymous caller
# can push into the Redis key space.
FINGERPRINT_MAX = 128


class ServiceHoursDaySchema(Schema):
    open = fields.Str(required=True, metadata={'description': "HH:MM"})
    close = fields.Str(required=True, metadata={'description': "HH:MM"})


class PublicOrgSchema(Schema):
    slug = fields.Str(required=True)
    name = fields.Str(required=True)


class DomainSchema(Schema):
    host = fields.Str(required=True)
    organization = fields.Nested(PublicOrgSchema, required=True)


class PublicSiteSummarySchema(Schema):
    slug = fields.Str(required=True)
    name = fields.Str(required=True)
    logo_url = fields.Str(allow_none=True)


class MenuWindowSchema(Schema):
    start = fields.Date(data_key='from', required=True)
    end = fields.Date(data_key='to', required=True)


class PublicSitePhotoSchema(Schema):
    url = fields.Str(required=True)
    alt = fields.Str(required=True, metadata={'description': "For screen readers"})
    order = fields.Int(required=True)


class SiteLinkSchema(Schema):
    kind = fields.Str(required=True, validate=validate.OneOf(LINK_KINDS))
    url = fields.Str(required=True)
    label = fields.Str(
        required=True, allow_none=True, metadata={'description': "A website's; None for the others"}
    )


class PublicSiteSchema(Schema):
    slug = fields.Str(required=True)
    name = fields.Str(required=True)
    tagline = fields.Str(required=True, allow_none=True)
    description = fields.Str(
        required=True, allow_none=True, metadata={'description': "Paragraphs, split by blank lines"}
    )
    logo_url = fields.Str(allow_none=True)
    cover_url = fields.Str(required=True, allow_none=True)
    photos = fields.List(fields.Nested(PublicSitePhotoSchema), required=True)
    address_label = fields.Str(allow_none=True)
    address_city = fields.Str(required=True, allow_none=True)
    address_postcode = fields.Str(required=True, allow_none=True)
    address_lat = fields.Float(allow_none=True)
    address_lon = fields.Float(allow_none=True)
    access_info = fields.Str(
        required=True, allow_none=True, metadata={'description': "How to get there; paragraphs"}
    )
    services = fields.List(
        fields.Str(validate=validate.OneOf(SERVICES)), required=True,
        metadata={'description': "In the order of the closed list"},
    )
    links = fields.List(fields.Nested(SiteLinkSchema), required=True)
    email = fields.Str(allow_none=True)
    phone = fields.Str(allow_none=True)
    capacity = fields.Int(allow_none=True, metadata={'description': "Seats"})
    payment_methods = fields.List(
        fields.Str(validate=validate.OneOf(PAYMENT_METHODS)), allow_none=True
    )
    pmr_access = fields.Bool(allow_none=True, metadata={'description': "None when unknown"})
    service_days = fields.List(
        fields.Int(), required=True, metadata={'description': "0 is Monday"}
    )
    service_hours = fields.Dict(
        keys=fields.Str(), values=fields.Nested(ServiceHoursDaySchema), required=True
    )
    vote_enabled = fields.Bool(required=True)
    vote_icon_preset = fields.Str(required=True, validate=validate.OneOf(VOTE_ICON_PRESETS))
    dietary_tags = fields.List(fields.Nested(DietaryTagSchema), required=True)
    certifications = fields.List(fields.Nested(CertificationSchema), required=True)
    menu_window = fields.Nested(
        MenuWindowSchema,
        required=True,
        metadata={'description': "The dates whose published menus can be read"},
    )


class PublicDishSchema(Schema):
    id = fields.Int(required=True)
    name = fields.Str(required=True)
    image_url = fields.Str(allow_none=True)
    tags = fields.List(fields.Nested(DietaryTagSchema), required=True)
    certifications = fields.List(fields.Nested(CertificationSchema), required=True)


class PublicMenuItemSchema(Schema):
    id = fields.Int(required=True)
    category_id = fields.Int(required=True)
    dish = fields.Nested(PublicDishSchema, required=True)
    order = fields.Int(required=True)
    is_out_of_stock = fields.Bool(required=True)


class PublicCategorySchema(Schema):
    id = fields.Int(required=True)
    label = fields.Str(required=True)
    is_highlighted = fields.Bool(required=True)
    order = fields.Int(required=True)
    color_key = fields.Str(allow_none=True)
    items = fields.List(fields.Nested(PublicMenuItemSchema))
    subcategories = fields.List(fields.Nested(lambda: PublicCategorySchema()))

    def get_attribute(self, obj, attr, default):
        # A category with subcategories has no `items` key, and marshmallow would
        # otherwise read the dict's own `items` method in its place.
        return obj.get(attr, default)


class PublicImageSchema(Schema):
    url = fields.Str(required=True)
    order = fields.Int(required=True)


class PublicSubstitutionSchema(Schema):
    dish = fields.Nested(PublicDishSchema, required=True)
    order = fields.Int(required=True)


class PublicMenuSchema(Schema):
    date = fields.Date(required=True)
    chef_note = fields.Str(allow_none=True)
    categories = fields.List(
        fields.Nested(PublicCategorySchema), attribute='by_category', required=True
    )
    substitutions = fields.Dict(
        keys=fields.Str(),
        values=fields.List(fields.Nested(PublicSubstitutionSchema)),
        required=True,
        metadata={'description': "Dishes that may replace another, by category id"},
    )


class MenuRangeQuerySchema(Schema):
    class Meta:
        unknown = EXCLUDE

    start = fields.Date(data_key='from', metadata={'description': "First day; today by default"})
    end = fields.Date(
        data_key='to', metadata={'description': "Last day, included; the window's end by default"}
    )

    @validates_schema
    def check_range(self, data, **kwargs):
        start, end = data.get('start'), data.get('end')
        if start and end:
            if end < start:
                raise ValidationError('La fin précède le début.', 'to')
            if (end - start).days + 1 > MAX_RANGE_DAYS:
                raise ValidationError(f'{MAX_RANGE_DAYS} jours au plus.', 'to')


class PublicEventSchema(Schema):
    id = fields.Int(required=True)
    title = fields.Str(required=True)
    subtitle = fields.Str(allow_none=True)
    description = fields.Str(allow_none=True)
    color = fields.Str(allow_none=True)
    date = fields.Date(attribute='event_date', required=True)
    images = fields.List(fields.Nested(PublicImageSchema), required=True)


class DeviceHeaderSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    device_id = fields.Str(
        data_key='Device-Id',
        validate=validate.Length(max=200),
        metadata={'description': "The token from POST /v1/devices"},
    )


class DeviceSchema(Schema):
    device_id = fields.Str(required=True)


class VoteInputSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    rating = fields.Int(required=True, validate=validate.Range(min=RATING_MIN, max=RATING_MAX))
    dish_ids = fields.List(fields.Int(), load_default=list, validate=validate.Length(max=10))
    fingerprint = fields.Str(
        allow_none=True, load_default=None, validate=validate.Length(max=FINGERPRINT_MAX)
    )


class VoteSchema(Schema):
    """The caller's own vote. Aggregates are never exposed publicly."""

    rating = fields.Int(
        required=True, validate=validate.OneOf(list(range(RATING_MIN, RATING_MAX + 1)))
    )
    dish_ids = fields.List(fields.Int(), required=True)
    updated_at = fields.Str(allow_none=True)


class DishChoiceSchema(Schema):
    id = fields.Int(required=True)
    name = fields.Str(required=True)
    image_url = fields.Str(allow_none=True)


class DishGroupSchema(Schema):
    category_id = fields.Int(required=True)
    label = fields.Str(required=True)
    dishes = fields.List(fields.Nested(DishChoiceSchema), required=True)


class VoteStateSchema(Schema):
    vote = fields.Nested(VoteSchema, allow_none=True, required=True)
    dish_groups = fields.List(fields.Nested(DishGroupSchema), required=True)
    voting_open = fields.Bool(required=True)
