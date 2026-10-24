import re
import uuid
from datetime import date, datetime, timedelta
from typing import Any

from flask_jwt_extended import get_jwt_identity
from flask_smorest import Blueprint

from ..extensions import db
from ..models import AuditLog, DishCatalog, ImportSession, Menu, MenuItem, Restaurant
from ..models.category import MenuCategory
from ..problems import Problem
from ..schemas.common import FileUploadSchema
from ..schemas.imports import (
    DishImportInputSchema,
    DishImportPreviewSchema,
    DishImportResultSchema,
    DishImportSchema,
    MenuImportConfirmSchema,
    MenuImportInputSchema,
    MenuImportPreviewSchema,
    MenuImportResultSchema,
    MenuImportSchema,
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
from .helpers import editor_required, get_or_create_dish, normalize_dish_name
from .menus import mark_published
from .scope import member_site

imports_bp = Blueprint(
    'imports', __name__,
    description='Menus and dishes loaded from a CSV or Excel file: send it, preview, confirm',
)

MENUS, DISHES = 'menus', 'dishes'


def _open_import(restaurant: Restaurant, kind: str, upload) -> tuple[ImportSession, list, list, str | None]:
    try:
        columns, rows, delimiter = parse_upload(upload)
    except ValueError as err:
        raise Problem(422, 'file_invalid', str(err)) from None
    ImportSession.cleanup_expired()
    session = ImportSession(
        id=str(uuid.uuid4()),
        user_id=int(get_jwt_identity()),
        restaurant_id=restaurant.id,
        kind=kind,
        filename=upload.filename,
        columns=columns,
        rows=rows,
        expires_minutes=30,
    )
    db.session.add(session)
    db.session.commit()
    return session, columns, rows, delimiter


def _import_file(session: ImportSession, columns: list, rows: list, delimiter: str | None) -> dict:
    return {
        'id': session.id,
        'filename': session.filename,
        'columns': columns,
        'preview_rows': rows[:10],
        'row_count': len(rows),
        'delimiter': delimiter,
    }


def _session(restaurant: Restaurant, kind: str, import_id: str) -> ImportSession:
    session = ImportSession.get_valid(import_id, int(get_jwt_identity()), restaurant.id, kind)
    if session is None:
        raise Problem(
            404, 'import_not_found', 'Import expiré ou introuvable : envoyez de nouveau le fichier.'
        )
    return session


def _menus_from(session: ImportSession, restaurant: Restaurant, body: dict) -> list[dict]:
    try:
        return build_menus_from_rows(
            session.get_rows(), body['column_mapping'], body['date_config'], restaurant.id
        )
    except ValueError as err:
        raise Problem(422, 'import_invalid', str(err)) from None


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
    """Match the file's columns to the site's categories by label, ignoring case and accents."""
    mapping: dict[str, Any] = {}
    date_patterns = ['date', 'jour', 'day', 'fecha']

    categories: list[MenuCategory] = []
    if restaurant_id:
        categories = MenuCategory.query.filter_by(restaurant_id=restaurant_id).all()

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
                    'category_id': category_id,
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
            menus.append({'date': menu_date, 'items': items, 'has_duplicate': False})

    return menus


_NAME_COLUMN_HINTS = ['nom', 'plat', 'name', 'intitule', 'dish', 'libelle', 'produit']


def suggest_name_column(columns: list[str]) -> str | None:
    """The column most likely to hold the dish name, else the first one."""
    for col in columns:
        col_norm = normalize_label(col)
        if any(hint in col_norm for hint in _NAME_COLUMN_HINTS):
            return col
    return columns[0] if columns else None


def existing_dish_norms(restaurant_id: int, category_id: int) -> set[str]:
    dishes = DishCatalog.query.filter_by(
        restaurant_id=restaurant_id, category_id=category_id
    ).all()
    return {normalize_label(d.name) for d in dishes}


def build_catalog_dishes(session, name_column, tag_columns, auto_detect_tags, existing_norms):
    """A dish is a duplicate when its normalised name is already in the category, or
    earlier in the file.
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

        # Labels are looked for in the tag columns, and in the name when asked.
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
                color_key=MenuCategory.next_color_key(restaurant_id) if depth == 0 else None,
            )
            db.session.add(existing)
            db.session.flush()
        parent = existing
    if parent is None:
        raise CategoryMappingError('Chemin de catégorie vide')
    return parent.id


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


@imports_bp.route('/menu-imports', methods=['POST'])
@editor_required
@imports_bp.arguments(FileUploadSchema, location='files')
@imports_bp.response(201, MenuImportSchema)
def create_menu_import(files, org: str, site: str):
    """Send a CSV or Excel file of menus: one row a day, one column a category.

    The answer suggests which column holds the date, and which category each
    other column fills. The import stays open thirty minutes.
    """
    restaurant = member_site(org, site)
    session, columns, rows, delimiter = _open_import(restaurant, MENUS, files['file'])
    mapping = suggest_column_mapping(columns, restaurant.id)
    detected_format = None
    if mapping.get('date'):
        for row in rows[:5]:
            value = row.get(mapping['date'], '')
            if value and (detected_format := detect_date_format(value)):
                break
    return {
        **_import_file(session, columns, rows, delimiter),
        'auto_mapping': mapping,
        'detected_date_format': detected_format,
    }


@imports_bp.route('/menu-imports/<import_id>/preview', methods=['POST'])
@editor_required
@imports_bp.arguments(MenuImportInputSchema)
@imports_bp.response(200, MenuImportPreviewSchema)
def preview_menu_import(body, org: str, site: str, import_id: str):
    """The menus a mapping of the columns would give, each day that has a menu flagged."""
    restaurant = member_site(org, site)
    menus = _menus_from(_session(restaurant, MENUS, import_id), restaurant, body)
    taken = {
        menu.date for menu in Menu.query.filter(
            Menu.restaurant_id == restaurant.id,
            Menu.date.in_([menu['date'] for menu in menus]),
        )
    }
    for menu in menus:
        menu['has_duplicate'] = menu['date'] in taken
    duplicates = sum(1 for menu in menus if menu['has_duplicate'])
    return {
        'menus': menus,
        'total_count': len(menus),
        'duplicates_count': duplicates,
        'new_count': len(menus) - duplicates,
    }


@imports_bp.route('/menu-imports/<import_id>/confirm', methods=['POST'])
@editor_required
@imports_bp.arguments(MenuImportConfirmSchema)
@imports_bp.response(200, MenuImportResultSchema)
def confirm_menu_import(body, org: str, site: str, import_id: str):
    """Write the menus, as drafts unless `auto_publish`, and close the import.

    A day that has a menu is skipped, replaced or merged, as `duplicate_action` says.
    """
    restaurant = member_site(org, site)
    session = _session(restaurant, MENUS, import_id)
    imported = replaced = skipped = 0
    for menu_data in _menus_from(session, restaurant, body):
        menu = Menu.query.filter_by(restaurant_id=restaurant.id, date=menu_data['date']).first()
        if menu is not None and body['duplicate_action'] == 'skip':
            skipped += 1
            continue
        if menu is None:
            menu = Menu(restaurant_id=restaurant.id, date=menu_data['date'], status='draft')
            db.session.add(menu)
            db.session.flush()
            imported += 1
        else:
            if body['duplicate_action'] == 'replace':
                MenuItem.query.filter_by(menu_id=menu.id).delete()
            replaced += 1

        for idx, item_data in enumerate(menu_data['items']):
            dish = get_or_create_dish(restaurant.id, {
                'name': item_data['name'],
                'category_id': item_data['category_id'],
                'tag_ids': item_data['tags'],
                'certification_ids': item_data['certifications'],
            })
            if dish:
                db.session.add(MenuItem(
                    menu_id=menu.id,
                    category_id=item_data['category_id'],
                    dish_id=dish.id,
                    order=item_data.get('order', idx),
                ))
        if body['auto_publish']:
            mark_published(menu)

    AuditLog.log(
        action='csv_import',
        user_id=session.user_id,
        restaurant_id=restaurant.id,
        details={
            'filename': session.filename,
            'imported_count': imported,
            'replaced_count': replaced,
            'skipped_count': skipped,
            'auto_publish': body['auto_publish'],
        },
        ip_address=get_client_ip(),
    )
    db.session.delete(session)
    db.session.commit()
    return {'imported_count': imported, 'replaced_count': replaced, 'skipped_count': skipped}


@imports_bp.route('/dish-imports', methods=['POST'])
@editor_required
@imports_bp.arguments(FileUploadSchema, location='files')
@imports_bp.response(201, DishImportSchema)
def create_dish_import(files, org: str, site: str):
    """Send a CSV or Excel file of dishes, or a catalog exported from Mariam.

    The answer suggests the column of the dish name; for an export, it lists
    the file's categories and those the site already has. The import stays open
    thirty minutes.
    """
    restaurant = member_site(org, site)
    session, columns, rows, delimiter = _open_import(restaurant, DISHES, files['file'])
    is_export = catalog_csv.is_export_file(columns)
    return {
        **_import_file(session, columns, rows, delimiter),
        'suggested_name_column': suggest_name_column(columns),
        'is_catalog_export': is_export,
        'category_paths': catalog_csv.distinct_paths(catalog_csv.parse(rows)) if is_export else [],
        'known_categories': catalog_csv.leaf_ids_by_path(restaurant.id) if is_export else {},
    }


def _dishes_from(session: ImportSession, restaurant: Restaurant, body: dict, create: bool):
    if body['category_map'] is not None:
        try:
            return build_export_dishes(session, restaurant.id, body['category_map'], create)
        except CategoryMappingError as error:
            db.session.rollback()
            raise Problem(422, 'category_invalid', str(error)) from None
    if not body['name_column'] or not body['category_id']:
        raise Problem(
            422, 'import_invalid', 'Indiquez la colonne du nom et la catégorie des plats.'
        )
    category = MenuCategory.query.filter_by(
        id=body['category_id'], restaurant_id=restaurant.id
    ).first()
    if category is None or not category.is_leaf:
        raise Problem(
            422, 'category_invalid', 'Catégorie inconnue, ou qui porte des sous-catégories.'
        )
    dishes = build_catalog_dishes(
        session, body['name_column'], body['tag_columns'], body['auto_detect_tags'],
        existing_dish_norms(restaurant.id, category.id),
    )
    for dish in dishes:
        dish['category_id'] = category.id
    return dishes


@imports_bp.route('/dish-imports/<import_id>/preview', methods=['POST'])
@editor_required
@imports_bp.arguments(DishImportInputSchema)
@imports_bp.response(200, DishImportPreviewSchema)
def preview_dish_import(body, org: str, site: str, import_id: str):
    """The dishes the file would add, the labels found and the duplicates."""
    restaurant = member_site(org, site)
    dishes = _dishes_from(_session(restaurant, DISHES, import_id), restaurant, body, create=False)
    to_create = []
    if body['category_map'] is not None:
        known = catalog_csv.leaf_ids_by_path(restaurant.id)
        to_create = [
            path for path, target in body['category_map'].items()
            if target == 'create' and path not in known
        ]
    new_count = sum(1 for dish in dishes if not dish['is_duplicate'])
    return {
        'dishes': dishes,
        'total': len(dishes),
        'new_count': new_count,
        'duplicate_count': len(dishes) - new_count,
        'categories_to_create': to_create,
    }


@imports_bp.route('/dish-imports/<import_id>/confirm', methods=['POST'])
@editor_required
@imports_bp.arguments(DishImportInputSchema)
@imports_bp.response(200, DishImportResultSchema)
def confirm_dish_import(body, org: str, site: str, import_id: str):
    """Add the dishes to the catalog, skipping the duplicates, and close the import."""
    restaurant = member_site(org, site)
    session = _session(restaurant, DISHES, import_id)
    dishes = _dishes_from(session, restaurant, body, create=True)
    created = 0
    for dish in dishes:
        if dish['is_duplicate'] or not dish.get('category_id'):
            continue
        get_or_create_dish(restaurant.id, {
            'name': dish['name'],
            'category_id': dish['category_id'],
            'tag_ids': dish['tags'],
            'certification_ids': dish['certifications'],
        })
        created += 1
    skipped = len(dishes) - created

    AuditLog.log(
        action='catalog_import',
        user_id=session.user_id,
        restaurant_id=restaurant.id,
        details={
            'filename': session.filename,
            'category_id': body['category_id'],
            'created_count': created,
            'skipped_count': skipped,
        },
        ip_address=get_client_ip(),
    )
    db.session.delete(session)
    db.session.commit()
    return {'created_count': created, 'skipped_count': skipped}
