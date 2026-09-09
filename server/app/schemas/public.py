from marshmallow import EXCLUDE, Schema, fields, validate

from ..models import RATING_MAX, RATING_MIN

# Long enough for a SHA-256 hex digest, and a bound on what an anonymous caller
# can push into the Redis key space.
FINGERPRINT_MAX = 128


class VoteInputSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    device_id = fields.Str(required=True, validate=validate.Length(min=1, max=200))
    rating = fields.Int(required=True, validate=validate.Range(min=RATING_MIN, max=RATING_MAX))
    dish_ids = fields.List(fields.Int(), load_default=list, validate=validate.Length(max=10))
    fingerprint = fields.Str(
        allow_none=True, load_default=None, validate=validate.Length(max=FINGERPRINT_MAX)
    )


class VoteSchema(Schema):
    """The caller's own vote. Aggregates are never exposed publicly."""

    rating = fields.Int()
    dish_ids = fields.List(fields.Int())
    restaurant_id = fields.Int()
    updated_at = fields.Str(allow_none=True)


class DishChoiceSchema(Schema):
    id = fields.Int()
    name = fields.Str()
    image_url = fields.Str(allow_none=True)


class DishGroupSchema(Schema):
    category_id = fields.Int()
    label = fields.Str()
    dishes = fields.List(fields.Nested(DishChoiceSchema))


class VoteStateSchema(Schema):
    vote = fields.Nested(VoteSchema, allow_none=True)
    dish_groups = fields.List(fields.Nested(DishGroupSchema))
    voting_open = fields.Bool()
    icon_preset = fields.Str()
