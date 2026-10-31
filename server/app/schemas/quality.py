from decimal import Decimal

from marshmallow import Schema, ValidationError, fields, validate, validates_schema

from .common import RequestSchema
from .public import EgalimDeclarationSchema


def _tenths(value: Decimal) -> None:
    if value * 10 != (value * 10).to_integral_value():
        raise ValidationError('Au dixième près, au plus.')


def _share(**kwargs) -> fields.Decimal:
    return fields.Decimal(validate=[validate.Range(min=0, max=100), _tenths], **kwargs)


class EgalimDeclarationInputSchema(RequestSchema):
    sustainable_share = _share(required=True)
    organic_share = _share(required=True)
    territorial_share = _share(load_default=None, allow_none=True)

    @validates_schema
    def organic_is_part_of_sustainable(self, data, **kwargs):
        if data['organic_share'] > data['sustainable_share']:
            raise ValidationError(
                'La part bio fait partie de la part durable et de qualité.', 'organic_share'
            )


class EgalimDeclarationListSchema(Schema):
    items = fields.List(fields.Nested(EgalimDeclarationSchema), required=True)
