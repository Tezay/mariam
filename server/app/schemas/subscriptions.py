from marshmallow import Schema, fields, validate

from ..models.subscription import KINDS, RENEWALS
from ..services.subscriptions import (
    ACTIVE,
    COVERED,
    DISABLED,
    ENDING,
    EXPIRED,
    NONE,
    UNDECIDED,
    UPCOMING,
)


def _reference(description: str) -> fields.Str:
    return fields.Str(required=True, allow_none=True, metadata={'description': description})


class SubscriptionPeriodSchema(Schema):
    kind = fields.Str(required=True, validate=validate.OneOf(KINDS))
    starts_on = fields.Date(required=True)
    ends_on = fields.Date(required=True, metadata={'description': 'Its last day'})
    renewal = fields.Str(
        required=True, validate=validate.OneOf(RENEWALS),
        metadata={'description': '`tacit` renews it each year until `tacit_until`'},
    )
    tacit_until = fields.Date(
        required=True, allow_none=True,
        metadata={'description': 'The last day its tacit renewals may reach'},
    )
    notice_by = fields.Date(
        required=True, allow_none=True,
        metadata={'description': 'The last day the buyer may decline the next renewal'},
    )
    quote_ref = _reference('The quote it was ordered from')
    order_ref = _reference("The purchase order, or a public buyer's legal commitment number")
    payer_name = _reference('Who pays for it')
    payer_siret = _reference("The payer's SIRET, 14 digits")
    payer_service_code = _reference("The payer's e-invoicing service or routing code")
    renewed_tacitly = fields.Bool(
        required=True,
        metadata={'description': 'A year of a tacit renewal that no record holds: no reference'},
    )


class SubscriptionSummarySchema(Schema):
    state = fields.Str(
        required=True,
        validate=validate.OneOf([NONE, UPCOMING, ACTIVE, EXPIRED, DISABLED]),
        metadata={'description': '`none`: no period recorded, nothing to show'},
    )
    end = fields.Str(
        required=True, allow_none=True,
        validate=validate.OneOf([COVERED, UNDECIDED, ENDING]),
        metadata={'description': 'What follows the current period'},
    )
    days_left = fields.Int(
        required=True, allow_none=True, metadata={'description': 'Until its last day included'}
    )
    current = fields.Nested(SubscriptionPeriodSchema, required=True, allow_none=True)
    next = fields.Nested(SubscriptionPeriodSchema, required=True, allow_none=True)


class SubscriptionSchema(SubscriptionSummarySchema):
    past = fields.List(
        fields.Nested(SubscriptionPeriodSchema), required=True,
        metadata={'description': 'The latest first'},
    )


class OrgSiteSubscriptionSchema(SubscriptionSummarySchema):
    site = fields.Str(required=True, metadata={'description': "The site's slug"})
    name = fields.Str(required=True)


class OrgSubscriptionListSchema(Schema):
    items = fields.List(fields.Nested(OrgSiteSubscriptionSchema), required=True)
