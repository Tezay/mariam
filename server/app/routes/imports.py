"""
CSV/Excel import routes for MARIAM menus.

3-step workflow:
1. Upload  - parse the file, returns columns and preview
2. Preview - apply column mapping, returns menus to be created
3. Confirm - execute the import into the database

Endpoints (editor role required):
- POST /v1/imports/menus/upload
- POST /v1/imports/menus/preview
- POST /v1/imports/menus/confirm
"""
import re
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

from flask import current_app, jsonify, request
from flask_jwt_extended import get_jwt_identity
from flask_smorest import Blueprint

from ..extensions import db
from ..models import (
    AuditLog,
    DishCatalog,
    ImportSession,
    Menu,
    MenuItem,
)
from ..models.category import MenuCategory
from ..schemas.common import ErrorSchema
from ..schemas.imports import (
    CatalogImportConfirmSchema,
    CatalogImportPreviewResultSchema,
    CatalogImportPreviewSchema,
    CatalogImportResultSchema,
    CatalogImportUploadSchema,
    ImportConfirmSchema,
    ImportPreviewSchema,
    ImportUploadSchema,
)
from ..security import get_client_ip
from ..services import catalog_csv
from ..services.csv_import import (
    clean_item_name,
    detect_tags_from_text,
    normalize_label,
    parse_upload,
)
from ..utils.time import paris_today
from .helpers import (
    editor_required,
    get_or_create_dish,
    get_user_and_restaurant,
    normalize_dish_name,
)

imports_bp = Blueprint(
    'imports', __name__,
    description='CSV/Excel import — Bulk menu loading from file'
)


# ============================================================
# HELPERS
# ============================================================

def detect_date_format(date_str: str) -> str | None:
    formats = [
        ('%Y-%m-%d', 'YYYY-MM-DD'), ('%d/%m/%Y', 'DD/MM/YYYY'),
        ('%d-%m-%Y', 'DD-MM-YYYY'), ('%d.%m.%Y', 'DD.MM.YYYY'),
        ('%m/%d/%Y', 'MM/DD/YYYY'), ('%Y/%m/%d', 'YYYY/MM/DD'),
    ]
    for fmt, _ in formats:
        try:
            datetime.strptime(date_str.strip(), fmt)
            return fmt
        except ValueError:
            continue
    return None


def parse_date(date_str: str, date_format: str | None = None) -> date | None:
    if not date_str or not date_str.strip():
        return None
    date_str = date_str.strip()
    if date_format:
        try:
            return datetime.strptime(date_str, date_format).date()
        except ValueError:
            pass
    fmt = detect_date_format(date_str)
    if fmt:
        try:
            return datetime.strptime(date_str, fmt).date()
        except ValueError:
            pass
    return None


def suggest_column_mapping(columns: list[str], restaurant_id: int | None = None) -> dict:
    """Auto-mappe les colonnes CSV aux catégories DB par label (insensible à la casse/accents)."""
    mapping: dict[str, Any] = {}
    date_patterns = ['date', 'jour', 'day', 'fecha']

    # Charger toutes les catégories du restaurant (principales + sous-catégories)
    categories: list[MenuCategory] = []
    if restaurant_id:
        categories = MenuCategory.query.filter_by(restaurant_id=restaurant_id).all()

    # Index label normalisé → category id (int)
    cat_label_index: dict[str, int] = {
        normalize_label(c.label): c.id for c in categories
    }

    for col in columns:
        col_norm = normalize_label(col)
        for pattern in date_patterns:
            if pattern in col_norm:
                mapping['date'] = col
                break
        for label_norm, cat_id in cat_label_index.items():
            if label_norm in col_norm or col_norm in label_norm:
                mapping.setdefault('categories', {})[col] = cat_id
                break
    return mapping


def build_menus_from_rows(rows, column_mapping, date_config, restaurant_id):
    menus = []
    date_column = None
    category_columns = {}

    for mapping in column_mapping:
        csv_col = mapping.get('csv_column')
        target = mapping.get('target_field')
        if target == 'date':
            date_column = csv_col
        elif target == 'category' and mapping.get('category_id'):
            category_columns[csv_col] = mapping['category_id']

    date_mode = date_config.get('mode', 'from_file')
    start_date_str = date_config.get('start_date')
    skip_weekends = date_config.get('skip_weekends', True)
    date_format = date_config.get('date_format')
    auto_detect_tags = date_config.get('auto_detect_tags', True)

    if date_mode in ['align_week', 'start_date'] and start_date_str:
        try:
            start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()
        except ValueError:
            raise ValueError(f"Format de date invalide: {start_date_str}") from None
    else:
        start_date = paris_today()

    current_date = start_date

    for row in rows:
        if date_mode == 'from_file' and date_column:
            menu_date = parse_date(row.get(date_column, ''), date_format)
            if not menu_date:
                continue
        else:
            menu_date = current_date
            current_date = current_date + timedelta(days=1)
            while skip_weekends and current_date.weekday() >= 5:
                current_date = current_date + timedelta(days=1)

        items = []
        for csv_col, category_id in category_columns.items():
            cell_value = row.get(csv_col, '').strip()
            if not cell_value:
                continue
            for order, item_name in enumerate(re.split(r'[,\n]+', cell_value)):
                item_name = item_name.strip()
                if not item_name:
                    continue
                item = {
                    'category_id': category_id,  # integer FK
                    'name': clean_item_name(item_name),
                    'order': order,
                    'tags': [],
                    'certifications': [],
                }
                if auto_detect_tags:
                    detected = detect_tags_from_text(item_name)
                    item['tags'] = detected['tags']
                    item['certifications'] = detected['certifications']
                items.append(item)

        if items:
            menus.append({
                'date': menu_date.isoformat(),
                'date_display': menu_date.strftime('%A %d/%m/%Y'),
                'items': items,
                'has_duplicate': False,
                'existing_menu': None,
            })

    return menus


# ============================================================
# ENDPOINTS
# ============================================================

@imports_bp.route('/menus/upload', methods=['POST'])
@imports_bp.response(200, ImportUploadSchema)
@imports_bp.alt_response(400, schema=ErrorSchema, description="Invalid or missing file")
@imports_bp.alt_response(500, schema=ErrorSchema, description="Processing error")
@editor_required
def upload_file():
    """Upload and parse a CSV or Excel file.

    Multipart/form-data request with `file` field.
    Accepted formats: `.csv`, `.xlsx`, `.xls`.

    Returns detected columns, a preview of the first 10 rows,
    an auto-suggested column mapping, and the detected date format.
    """
    if 'file' not in request.files:
        return jsonify({'error': 'Aucun fichier fourni'}), 400

    file = request.files['file']
    if not file.filename:
        return jsonify({'error': 'Nom de fichier manquant'}), 400

    try:
        columns, rows, delimiter = parse_upload(file)

        file_id = str(uuid.uuid4())
        ImportSession.cleanup_expired()

        current_user_id = int(get_jwt_identity())
        session = ImportSession(
            id=file_id,
            user_id=current_user_id,
            filename=file.filename,
            columns=columns,
            rows=rows,
            expires_minutes=30,
        )
        db.session.add(session)
        db.session.commit()

        # Restaurant derived from the account, never from the form (multi-tenant).
        _, _caller_restaurant = get_user_and_restaurant()
        upload_restaurant_id = _caller_restaurant.id if _caller_restaurant else None
        auto_mapping = suggest_column_mapping(columns, upload_restaurant_id)

        detected_date_format = None
        if auto_mapping.get('date'):
            date_col = auto_mapping['date']
            for row in rows[:5]:
                date_val = row.get(date_col, '')
                if date_val:
                    detected_date_format = detect_date_format(date_val)
                    if detected_date_format:
                        break

        return jsonify({
            'file_id': file_id,
            'filename': file.filename,
            'columns': columns,
            'preview_rows': rows[:10],
            'row_count': len(rows),
            'detected_delimiter': delimiter,
            'auto_mapping': auto_mapping,
            'detected_date_format': detected_date_format,
        }), 200

    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        current_app.logger.error(f"Erreur upload CSV: {e}")
        return jsonify({'error': f'Erreur lors du traitement du fichier: {e}'}), 500


@imports_bp.route('/menus/preview', methods=['POST'])
@imports_bp.arguments(ImportPreviewSchema)
@imports_bp.response(200, ImportUploadSchema)
@imports_bp.alt_response(400, schema=ErrorSchema, description="Invalid data")
@imports_bp.alt_response(404, schema=ErrorSchema, description="Session expired")
@editor_required
def preview_import(data):
    """Generate an import preview based on the provided column mapping.

    Returns the menus that will be created, flagging duplicates
    (existing menus for the same dates).
    """
    file_id = data.get('file_id')
    column_mapping = data.get('column_mapping', [])
    date_config = data.get('date_config', {})

    current_user_id = int(get_jwt_identity())
    session = ImportSession.get_valid(file_id, current_user_id)
    if not session:
        return jsonify({'error': 'Session expirée ou fichier non trouvé. Veuillez re-uploader le fichier.'}), 404

    rows = session.get_rows()

    _, _caller_restaurant = get_user_and_restaurant()
    restaurant_id = _caller_restaurant.id if _caller_restaurant else None
    if not restaurant_id:
        return jsonify({'error': 'Aucun restaurant associé à votre compte'}), 400

    try:
        menus = build_menus_from_rows(rows, column_mapping, date_config, restaurant_id)

        for menu_data in menus:
            existing = Menu.query.filter_by(
                restaurant_id=restaurant_id,
                date=datetime.strptime(menu_data['date'], '%Y-%m-%d').date()
            ).first()
            menu_data['has_duplicate'] = existing is not None
            if existing:
                menu_data['existing_menu'] = existing.to_dict()

        duplicates_count = sum(1 for m in menus if m['has_duplicate'])

        return jsonify({
            'menus': menus,
            'total_count': len(menus),
            'duplicates_count': duplicates_count,
            'new_count': len(menus) - duplicates_count,
        }), 200

    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        current_app.logger.error(f"Erreur preview import: {e}")
        return jsonify({'error': f'Erreur lors de la prévisualisation: {e}'}), 500


@imports_bp.route('/menus/confirm', methods=['POST'])
@imports_bp.arguments(ImportConfirmSchema)
@imports_bp.response(200, ImportUploadSchema)
@imports_bp.alt_response(400, schema=ErrorSchema, description="Invalid data or missing restaurant")
@imports_bp.alt_response(404, schema=ErrorSchema, description="Session expired")
@editor_required
def confirm_import(data):
    """Confirm and execute the menu import into the database.

    - `duplicate_action`: `skip` (default), `replace` or `merge`
    - `auto_publish`: immediately publish the imported menus
    """
    current_user_id = int(get_jwt_identity())

    file_id = data.get('file_id')
    column_mapping = data.get('column_mapping', [])
    date_config = data.get('date_config', {})
    duplicate_action = data.get('duplicate_action', 'skip')
    auto_publish = data.get('auto_publish', False)
    # restaurant_id: ignored here, derived from the account below (multi-tenant)

    session = ImportSession.get_valid(file_id, current_user_id)
    if not session:
        return jsonify({'error': 'Session expirée ou fichier non trouvé. Veuillez re-uploader le fichier.'}), 404

    rows = session.get_rows()

    # Restaurant derived from the account, never from the body (multi-tenant).
    _, _caller_restaurant = get_user_and_restaurant()
    restaurant_id = _caller_restaurant.id if _caller_restaurant else None
    if not restaurant_id:
        return jsonify({'error': 'Aucun restaurant associé à votre compte'}), 400
    if not restaurant_id:
        return jsonify({'error': 'Aucun restaurant configuré'}), 400

    try:
        menus_data = build_menus_from_rows(rows, column_mapping, date_config, restaurant_id)

        imported_count = replaced_count = skipped_count = 0

        for menu_data in menus_data:
            menu_date = datetime.strptime(menu_data['date'], '%Y-%m-%d').date()
            existing_menu = Menu.query.filter_by(restaurant_id=restaurant_id, date=menu_date).first()

            if existing_menu:
                if duplicate_action == 'skip':
                    skipped_count += 1
                    continue
                elif duplicate_action == 'replace':
                    MenuItem.query.filter_by(menu_id=existing_menu.id).delete()
                    menu = existing_menu
                    replaced_count += 1
                elif duplicate_action == 'merge':
                    menu = existing_menu
                    replaced_count += 1
                else:
                    continue
            else:
                menu = Menu(restaurant_id=restaurant_id, date=menu_date, status='draft')
                db.session.add(menu)
                db.session.flush()
                imported_count += 1

            for idx, item_data in enumerate(menu_data['items']):
                dish = get_or_create_dish(restaurant_id, {
                    'name': item_data['name'],
                    'category_id': item_data['category_id'],
                    'tag_ids': item_data.get('tags', []),
                    'certification_ids': item_data.get('certifications', []),
                })
                if not dish:
                    continue
                item = MenuItem(
                    menu_id=menu.id,
                    category_id=item_data['category_id'],
                    dish_id=dish.id,
                    order=item_data.get('order', idx),
                )
                db.session.add(item)

            if auto_publish:
                menu.status = 'published'
                menu.published_at = datetime.now(UTC)
                menu.published_by_id = current_user_id

        AuditLog.log(
            action='csv_import',
            user_id=current_user_id,
            details={
                'filename': session.filename,
                'imported_count': imported_count,
                'replaced_count': replaced_count,
                'skipped_count': skipped_count,
                'auto_publish': auto_publish,
            },
            ip_address=get_client_ip()
        )

        db.session.commit()

        db.session.delete(session)
        db.session.commit()

        return jsonify({
            'success': True,
            'imported_count': imported_count,
            'replaced_count': replaced_count,
            'skipped_count': skipped_count,
            'message': f'{imported_count + replaced_count} menu(s) importé(s)',
        }), 200

    except ValueError as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Erreur import CSV: {e}")
        return jsonify({'error': f"Erreur lors de l'import: {e}"}), 500


# ============================================================
# IMPORT CATALOGUE — liste de plats (1 ligne = 1 plat)
# ============================================================

_NAME_COLUMN_HINTS = ['nom', 'plat', 'name', 'intitule', 'dish', 'libelle', 'produit']


def suggest_name_column(columns: list[str]) -> str | None:
    """Devine la colonne contenant le nom du plat (sinon la première colonne)."""
    for col in columns:
        col_norm = normalize_label(col)
        if any(hint in col_norm for hint in _NAME_COLUMN_HINTS):
            return col
    return columns[0] if columns else None


def existing_dish_norms(restaurant_id: int, category_id: int) -> set[str]:
    """Noms normalisés des plats déjà présents dans une catégorie (pour la dédup)."""
    dishes = DishCatalog.query.filter_by(
        restaurant_id=restaurant_id, category_id=category_id
    ).all()
    return {normalize_label(d.name) for d in dishes}


def build_catalog_dishes(session, name_column, tag_columns, auto_detect_tags, existing_norms):
    """Construit la liste des plats à importer depuis les lignes de la session.

    Chaque plat : {name, tags, certifications, is_duplicate}. Un plat est doublon
    si son nom normalisé existe déjà dans la catégorie (existing_norms) ou est
    répété plus haut dans le fichier.
    """
    dishes = []
    seen: set[str] = set()
    for row in session.get_rows():
        raw = (row.get(name_column) or '').strip()
        if not raw:
            continue
        name = normalize_dish_name(clean_item_name(raw))
        if not name:
            continue
        norm = normalize_label(name)

        # Texte scanné pour la taxonomie : colonnes tags + (optionnel) le nom
        parts = [(row.get(c) or '') for c in tag_columns]
        if auto_detect_tags:
            parts.append(raw)
        text = ' '.join(p for p in parts if p)
        detected = detect_tags_from_text(text) if text.strip() else {'tags': [], 'certifications': []}

        dishes.append({
            'name': name,
            'tags': detected['tags'],
            'certifications': detected['certifications'],
            'is_duplicate': norm in existing_norms or norm in seen,
        })
        seen.add(norm)
    return dishes


class CategoryMappingError(Exception):
    """A path of the file cannot become a category here."""


def resolve_category_map(restaurant_id: int, mapping: dict, create: bool) -> dict[str, int]:
    """Turn each file path into a leaf category id, creating those asked for.

    Creation follows the rule enforced by /v1/settings/categories: a category
    with subcategories carries no dish, so a parent that already holds dishes
    cannot receive one.
    """
    known = catalog_csv.leaf_ids_by_path(restaurant_id)
    resolved: dict[str, int] = {}
    for path, target in mapping.items():
        if target != 'create':
            if not str(target).isdigit():
                raise CategoryMappingError(f'Catégorie invalide pour « {path} »')
            category = MenuCategory.query.filter_by(
                id=int(target), restaurant_id=restaurant_id
            ).first()
            if not category or not category.is_leaf:
                raise CategoryMappingError(f'Catégorie invalide pour « {path} »')
            resolved[path] = category.id
            continue
        if path in known:
            resolved[path] = known[path]
            continue
        if not create:
            continue
        resolved[path] = _create_category_path(restaurant_id, path)
        known = catalog_csv.leaf_ids_by_path(restaurant_id)
    return resolved


def _create_category_path(restaurant_id: int, path: str) -> int:
    labels = [part.strip() for part in path.split(catalog_csv.PATH_SEPARATOR) if part.strip()]
    parent = None
    for depth, label in enumerate(labels):
        existing = MenuCategory.query.filter_by(
            restaurant_id=restaurant_id,
            parent_id=parent.id if parent else None,
            label=label,
        ).first()
        if existing is None:
            if parent is not None and DishCatalog.query.filter_by(
                category_id=parent.id
            ).count():
                raise CategoryMappingError(
                    f'« {parent.label} » porte des plats et ne peut pas recevoir '
                    'de sous-catégorie. Déplacez-les avant d\'importer.'
                )
            existing = MenuCategory(
                restaurant_id=restaurant_id,
                parent_id=parent.id if parent else None,
                label=label,
                order=MenuCategory.query.filter_by(
                    restaurant_id=restaurant_id,
                    parent_id=parent.id if parent else None,
                ).count(),
                color_key=_next_color(restaurant_id) if depth == 0 else None,
            )
            db.session.add(existing)
            db.session.flush()
        parent = existing
    if parent is None:
        raise CategoryMappingError('Chemin de catégorie vide')
    return parent.id


def _next_color(restaurant_id: int) -> str:
    palette = ['indigo', 'sky', 'mint', 'saffron', 'clay', 'lilac']
    used = {
        category.color_key
        for category in MenuCategory.query.filter_by(restaurant_id=restaurant_id).all()
        if category.color_key
    }
    return next((key for key in palette if key not in used), palette[0])


def build_export_dishes(session, restaurant_id: int, mapping: dict, create: bool) -> list[dict]:
    """Dishes of a Mariam export, each resolved to the category it lands in."""
    parsed = catalog_csv.parse(session.get_rows())
    resolved = resolve_category_map(restaurant_id, mapping, create)

    existing: dict[int, set[str]] = {}
    seen: set[tuple[int | None, str]] = set()
    dishes = []
    for row in parsed:
        name = normalize_dish_name(clean_item_name(row['name']))
        if not name:
            continue
        category_id = resolved.get(row['path'])
        if category_id is not None and category_id not in existing:
            existing[category_id] = existing_dish_norms(restaurant_id, category_id)
        norm = normalize_label(name)
        key = (category_id, norm)
        taken = existing[category_id] if category_id is not None else set()
        dishes.append({
            'name': name,
            'tags': row['tag_ids'],
            'certifications': row['certification_ids'],
            'category_id': category_id,
            'category_path': row['path'],
            'is_duplicate': norm in taken or key in seen,
        })
        seen.add(key)
    return dishes


@imports_bp.route('/catalog/upload', methods=['POST'])
@imports_bp.response(200, CatalogImportUploadSchema)
@imports_bp.alt_response(400, schema=ErrorSchema, description="Invalid or missing file")
@imports_bp.alt_response(500, schema=ErrorSchema, description="Processing error")
@editor_required
def catalog_upload():
    """Upload et parse un fichier CSV/Excel de plats.

    Renvoie les colonnes, un aperçu des premières lignes, et une suggestion
    de la colonne contenant le nom du plat.
    """
    if 'file' not in request.files:
        return jsonify({'error': 'Aucun fichier fourni'}), 400
    file = request.files['file']
    if not file.filename:
        return jsonify({'error': 'Nom de fichier manquant'}), 400

    try:
        columns, rows, delimiter = parse_upload(file)

        file_id = str(uuid.uuid4())
        ImportSession.cleanup_expired()
        session = ImportSession(
            id=file_id,
            user_id=int(get_jwt_identity()),
            filename=file.filename,
            columns=columns,
            rows=rows,
            expires_minutes=30,
        )
        db.session.add(session)
        db.session.commit()

        _, restaurant = get_user_and_restaurant()
        is_export = catalog_csv.is_export_file(columns)
        paths = catalog_csv.distinct_paths(catalog_csv.parse(rows)) if is_export else []

        return jsonify({
            'file_id': file_id,
            'filename': file.filename,
            'columns': columns,
            'preview_rows': rows[:10],
            'row_count': len(rows),
            'delimiter': delimiter,
            'suggested_name_column': suggest_name_column(columns),
            'is_catalog_export': is_export,
            'category_paths': paths,
            'known_categories': (
                catalog_csv.leaf_ids_by_path(restaurant.id) if is_export and restaurant else {}
            ),
        }), 200

    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        current_app.logger.error(f"Erreur upload catalogue: {e}")
        return jsonify({'error': f'Erreur lors du traitement du fichier: {e}'}), 500


@imports_bp.route('/catalog/preview', methods=['POST'])
@imports_bp.arguments(CatalogImportPreviewSchema)
@imports_bp.response(200, CatalogImportPreviewResultSchema)
@imports_bp.alt_response(400, schema=ErrorSchema, description="Invalid data")
@imports_bp.alt_response(404, schema=ErrorSchema, description="Session expired")
@editor_required
def catalog_preview(data):
    """Prévisualise l'import : liste des plats, tags détectés et doublons."""
    user, restaurant = get_user_and_restaurant()
    if not restaurant:
        return jsonify({'error': 'Aucun restaurant configuré'}), 400

    session = ImportSession.get_valid(data['file_id'], user.id)
    if not session:
        return jsonify({'error': 'Session expirée ou fichier non trouvé. Veuillez re-uploader le fichier.'}), 404

    if data.get('category_map') is not None:
        try:
            dishes = build_export_dishes(session, restaurant.id, data['category_map'], create=False)
        except CategoryMappingError as error:
            return jsonify({'error': str(error)}), 400
        known = catalog_csv.leaf_ids_by_path(restaurant.id)
        to_create = [
            path for path, target in data['category_map'].items()
            if target == 'create' and path not in known
        ]
    else:
        if not data.get('name_column') or not data.get('category_id'):
            return jsonify({'error': 'Colonne du nom et catégorie requises'}), 400
        existing = existing_dish_norms(restaurant.id, data['category_id'])
        dishes = build_catalog_dishes(
            session, data['name_column'], data['tag_columns'],
            data['auto_detect_tags'], existing,
        )
        to_create = []
    new_count = sum(1 for d in dishes if not d['is_duplicate'])

    return jsonify({
        'dishes': dishes,
        'total': len(dishes),
        'new_count': new_count,
        'duplicate_count': len(dishes) - new_count,
        'categories_to_create': to_create,
    }), 200


@imports_bp.route('/catalog/confirm', methods=['POST'])
@imports_bp.arguments(CatalogImportConfirmSchema)
@imports_bp.response(200, CatalogImportResultSchema)
@imports_bp.alt_response(400, schema=ErrorSchema, description="Invalid data")
@imports_bp.alt_response(404, schema=ErrorSchema, description="Session expired")
@editor_required
def catalog_confirm(data):
    """Crée les plats du catalogue (doublons ignorés)."""
    user, restaurant = get_user_and_restaurant()
    if not restaurant:
        return jsonify({'error': 'Aucun restaurant configuré'}), 400

    session = ImportSession.get_valid(data['file_id'], user.id)
    if not session:
        return jsonify({'error': 'Session expirée ou fichier non trouvé. Veuillez re-uploader le fichier.'}), 404

    if data.get('category_map') is not None:
        try:
            dishes = build_export_dishes(session, restaurant.id, data['category_map'], create=True)
        except CategoryMappingError as error:
            db.session.rollback()
            return jsonify({'error': str(error)}), 409
        category_id = None
    else:
        if not data.get('name_column') or not data.get('category_id'):
            return jsonify({'error': 'Colonne du nom et catégorie requises'}), 400
        category = MenuCategory.query.filter_by(
            id=data['category_id'], restaurant_id=restaurant.id
        ).first()
        if not category:
            return jsonify({'error': 'Catégorie introuvable'}), 400
        category_id = category.id
        existing = existing_dish_norms(restaurant.id, category.id)
        dishes = build_catalog_dishes(
            session, data['name_column'], data['tag_columns'],
            data['auto_detect_tags'], existing,
        )
        for dish in dishes:
            dish['category_id'] = category.id

    created = 0
    for d in dishes:
        if d['is_duplicate'] or not d.get('category_id'):
            continue
        # get_or_create_dish gère la normalisation, la dédup et l'attache des tags
        get_or_create_dish(restaurant.id, {
            'name': d['name'],
            'category_id': d['category_id'],
            'tag_ids': d['tags'],
            'certification_ids': d['certifications'],
        })
        created += 1
    skipped = len(dishes) - created

    AuditLog.log(
        action='catalog_import',
        user_id=user.id,
        details={
            'filename': session.filename,
            'category_id': category_id,
            'created_count': created,
            'skipped_count': skipped,
        },
        ip_address=get_client_ip(),
    )
    db.session.commit()

    db.session.delete(session)
    db.session.commit()

    return jsonify({'created_count': created, 'skipped_count': skipped}), 200
