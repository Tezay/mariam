from marshmallow import Schema, fields, EXCLUDE


class ColumnMappingSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    csv_column = fields.Str(required=True)
    target_field = fields.Str(required=True, description="'date', 'category', or 'ignore'")
    category_id = fields.Int(allow_none=True, description="MenuCategory.id (integer)")


class DateConfigSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    mode = fields.Str(description="'from_file', 'align_week', or 'start_date'")
    start_date = fields.Str(allow_none=True, description="Start date (YYYY-MM-DD)")
    skip_weekends = fields.Bool()
    date_format = fields.Str(allow_none=True)
    auto_detect_tags = fields.Bool()


class ImportUploadSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    file_id = fields.Str(dump_only=True)
    filename = fields.Str(dump_only=True)
    columns = fields.List(fields.Str())
    preview_rows = fields.List(fields.Dict())
    row_count = fields.Int()
    detected_delimiter = fields.Str(allow_none=True)
    auto_mapping = fields.Dict()
    detected_date_format = fields.Str(allow_none=True)


class ImportPreviewSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    file_id = fields.Str(required=True)
    column_mapping = fields.List(fields.Nested(ColumnMappingSchema))
    date_config = fields.Nested(DateConfigSchema)
    restaurant_id = fields.Int(allow_none=True)


class ImportConfirmSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    file_id = fields.Str(required=True)
    column_mapping = fields.List(fields.Nested(ColumnMappingSchema))
    date_config = fields.Nested(DateConfigSchema)
    duplicate_action = fields.Str(description="'skip', 'replace', or 'merge'")
    auto_publish = fields.Bool()
    restaurant_id = fields.Int(allow_none=True)
