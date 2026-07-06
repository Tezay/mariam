from marshmallow import EXCLUDE, Schema, fields, validate


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


# ============================================================
# IMPORT CATALOGUE — liste de plats
# ============================================================

class CatalogImportUploadSchema(Schema):
    """Réponse d'upload : colonnes détectées + suggestion de colonne nom."""
    class Meta:
        unknown = EXCLUDE
    file_id = fields.Str(dump_only=True)
    filename = fields.Str(dump_only=True)
    columns = fields.List(fields.Str())
    preview_rows = fields.List(fields.Dict())
    row_count = fields.Int()
    delimiter = fields.Str(allow_none=True)
    suggested_name_column = fields.Str(allow_none=True)


class CatalogImportPreviewSchema(Schema):
    """Paramètres de prévisualisation/confirmation d'un import catalogue."""
    class Meta:
        unknown = EXCLUDE
    file_id = fields.Str(required=True)
    name_column = fields.Str(required=True, description="Colonne contenant le nom du plat")
    tag_columns = fields.List(fields.Str(), load_default=[], description="Colonnes scannées pour les tags/labels")
    category_id = fields.Int(required=True, validate=validate.Range(min=1))
    auto_detect_tags = fields.Bool(load_default=True)


class CatalogImportPreviewDishSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    name = fields.Str()
    tags = fields.List(fields.Str())
    certifications = fields.List(fields.Str())
    is_duplicate = fields.Bool()


class CatalogImportPreviewResultSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    dishes = fields.List(fields.Nested(CatalogImportPreviewDishSchema))
    total = fields.Int()
    new_count = fields.Int()
    duplicate_count = fields.Int()


# Confirmation : mêmes paramètres que la prévisualisation
CatalogImportConfirmSchema = CatalogImportPreviewSchema


class CatalogImportResultSchema(Schema):
    class Meta:
        unknown = EXCLUDE
    created_count = fields.Int()
    skipped_count = fields.Int()
