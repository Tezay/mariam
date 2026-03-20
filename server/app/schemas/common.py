from marshmallow import Schema, fields, EXCLUDE


class ErrorSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    error = fields.Str(description="Error message")
    message = fields.Str(description="Detailed error description")


class MessageSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    message = fields.Str(description="Success message")
