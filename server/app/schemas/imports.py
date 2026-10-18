from marshmallow import EXCLUDE, Schema, fields, validate


class ColumnMappingSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    csv_column = fields.Str(required=True)
    target_field = fields.Str(required=True, validate=validate.OneOf(['date', 'category', 'ignore']))
    category_id = fields.Int(allow_none=True)


class DateConfigSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    mode = fields.Str(
        load_default='from_file', validate=validate.OneOf(['from_file', 'align_week', 'start_date'])
    )
    start_date = fields.Str(allow_none=True, metadata={'description': "YYYY-MM-DD"})
    skip_weekends = fields.Bool(load_default=True)
    date_format = fields.Str(allow_none=True, metadata={'description': "A strptime format"})
    auto_detect_tags = fields.Bool(load_default=True)


class ImportFileSchema(Schema):
    id = fields.Str(required=True)
    filename = fields.Str(required=True)
    columns = fields.List(fields.Str(), required=True)
    preview_rows = fields.List(
        fields.Dict(keys=fields.Str(), values=fields.Str()),
        required=True,
        metadata={'description': "The first ten rows"},
    )
    row_count = fields.Int(required=True)
    delimiter = fields.Str(allow_none=True, required=True)


class AutoMappingSchema(Schema):
    date = fields.Str(metadata={'description': "The column that looks like a date"})
    categories = fields.Dict(
        keys=fields.Str(), values=fields.Int(), metadata={'description': "Column to category id"}
    )


class MenuImportSchema(ImportFileSchema):
    auto_mapping = fields.Nested(AutoMappingSchema, required=True)
    detected_date_format = fields.Str(allow_none=True, required=True)


class MenuImportInputSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    column_mapping = fields.List(fields.Nested(ColumnMappingSchema), required=True)
    date_config = fields.Nested(DateConfigSchema, load_default=dict)


class MenuImportConfirmSchema(MenuImportInputSchema):
    duplicate_action = fields.Str(
        load_default='skip', validate=validate.OneOf(['skip', 'replace', 'merge'])
    )
    auto_publish = fields.Bool(load_default=False)


class ImportedItemSchema(Schema):
    category_id = fields.Int(required=True)
    name = fields.Str(required=True)
    order = fields.Int(required=True)
    tags = fields.List(fields.Str(), required=True)
    certifications = fields.List(fields.Str(), required=True)


class ImportedMenuSchema(Schema):
    date = fields.Date(required=True)
    items = fields.List(fields.Nested(ImportedItemSchema), required=True)
    has_duplicate = fields.Bool(required=True, metadata={'description': "The day has a menu"})


class MenuImportPreviewSchema(Schema):
    menus = fields.List(fields.Nested(ImportedMenuSchema), required=True)
    total_count = fields.Int(required=True)
    duplicates_count = fields.Int(required=True)
    new_count = fields.Int(required=True)


class MenuImportResultSchema(Schema):
    imported_count = fields.Int(required=True)
    replaced_count = fields.Int(required=True)
    skipped_count = fields.Int(required=True)


class DishImportSchema(ImportFileSchema):
    suggested_name_column = fields.Str(allow_none=True, required=True)
    is_catalog_export = fields.Bool(required=True)
    category_paths = fields.List(fields.Str(), required=True)
    known_categories = fields.Dict(keys=fields.Str(), values=fields.Int(), required=True)


class DishImportInputSchema(Schema):
    """Either any file, with name_column and category_id, or a Mariam export, which
    carries its categories and labels and only needs its categories mapped.
    """
    class Meta:
        unknown = EXCLUDE
    name_column = fields.Str(load_default=None, allow_none=True)
    tag_columns = fields.List(
        fields.Str(), load_default=list, metadata={'description': "Columns searched for labels"}
    )
    category_id = fields.Int(load_default=None, allow_none=True, validate=validate.Range(min=1))
    auto_detect_tags = fields.Bool(load_default=True)
    category_map = fields.Dict(
        keys=fields.Str(), values=fields.Str(), load_default=None, allow_none=True,
        metadata={'description': "File path to a category id, or 'create'"},
    )


class ImportedDishSchema(Schema):
    name = fields.Str(required=True)
    tags = fields.List(fields.Str(), required=True)
    certifications = fields.List(fields.Str(), required=True)
    is_duplicate = fields.Bool(required=True)
    category_path = fields.Str(metadata={'description': "From a Mariam export"})


class DishImportPreviewSchema(Schema):
    dishes = fields.List(fields.Nested(ImportedDishSchema), required=True)
    total = fields.Int(required=True)
    new_count = fields.Int(required=True)
    duplicate_count = fields.Int(required=True)
    categories_to_create = fields.List(fields.Str(), required=True)


class DishImportResultSchema(Schema):
    created_count = fields.Int(required=True)
    skipped_count = fields.Int(required=True)
