"""Catalogue CSV, written by the export and read back by the import.

Both sides share this module so a file exported from a site can be imported
into an empty one and yield the same dishes: same names, same category tree,
same labels and certifications. Images live in object storage and have no
place in a CSV, so they are the one thing a round trip loses.
"""
from ..models import MenuCategory
from ..models.taxonomy import Certification, DietaryTag
from .csv_import import normalize_label

COLUMNS = ['nom', 'categorie', 'sous_categorie', 'labels', 'certifications']

PATH_SEPARATOR = ' › '
VALUE_SEPARATOR = ', '


def is_export_file(columns: list[str]) -> bool:
    """Whether an uploaded file carries the columns this module writes."""
    normalized = {normalize_label(column) for column in columns}
    return all(column in normalized for column in COLUMNS)


def path_key(parent: str, child: str) -> str:
    """Display and map key of a category path, e.g. 'Plat principal › Viandes'."""
    return PATH_SEPARATOR.join(part for part in (parent.strip(), child.strip()) if part.strip())


def category_paths(restaurant_id: int) -> dict[int, tuple[str, str]]:
    """(parent, child) labels of every category of a restaurant, by id."""
    categories = MenuCategory.query.filter_by(restaurant_id=restaurant_id).all()
    by_id = {category.id: category for category in categories}
    paths = {}
    for category in categories:
        parent = by_id.get(category.parent_id) if category.parent_id else None
        paths[category.id] = (parent.label, category.label) if parent else (category.label, '')
    return paths


def leaf_ids_by_path(restaurant_id: int) -> dict[str, int]:
    """Leaf categories of a restaurant, keyed by their display path."""
    children = {
        category.parent_id
        for category in MenuCategory.query.filter_by(restaurant_id=restaurant_id).all()
        if category.parent_id
    }
    return {
        path_key(*labels): category_id
        for category_id, labels in category_paths(restaurant_id).items()
        if category_id not in children
    }


def serialize(dishes: list, paths: dict[int, tuple[str, str]]) -> list[list[str]]:
    """Rows for the given dishes, header excluded."""
    rows = []
    for dish in dishes:
        parent, child = paths.get(dish.category_id, ('', ''))
        rows.append([
            dish.name,
            parent,
            child,
            VALUE_SEPARATOR.join(tag.label for tag in dish.tags),
            VALUE_SEPARATOR.join(cert.name for cert in dish.certifications),
        ])
    return rows


def _taxonomy_index() -> tuple[dict[str, str], dict[str, str]]:
    tags = {}
    for tag in DietaryTag.query.all():
        tags[normalize_label(tag.label)] = tag.id
        tags[normalize_label(tag.id)] = tag.id
    certs = {}
    for cert in Certification.query.all():
        certs[normalize_label(cert.name)] = cert.id
        certs[normalize_label(cert.id)] = cert.id
    return tags, certs


def _cell(row: dict, column: str) -> str:
    for key, value in row.items():
        if normalize_label(key) == column:
            return str(value or '').strip()
    return ''


def _values(raw: str) -> list[str]:
    return [part.strip() for part in raw.split(',') if part.strip()]


def parse(rows: list[dict]) -> list[dict]:
    """Read exported rows back into dishes, keyed by taxonomy id.

    A label the taxonomy does not know is dropped rather than guessed: the
    reference tables are closed, so an unknown value means a hand-edited file.
    """
    tags, certs = _taxonomy_index()
    dishes = []
    for row in rows:
        name = _cell(row, 'nom')
        if not name:
            continue
        dishes.append({
            'name': name,
            'path': path_key(_cell(row, 'categorie'), _cell(row, 'sous_categorie')),
            'tag_ids': sorted({
                tags[key] for value in _values(_cell(row, 'labels'))
                if (key := normalize_label(value)) in tags
            }),
            'certification_ids': sorted({
                certs[key] for value in _values(_cell(row, 'certifications'))
                if (key := normalize_label(value)) in certs
            }),
        })
    return dishes


def distinct_paths(dishes: list[dict]) -> list[str]:
    """Category paths of the file, in order of first appearance."""
    seen: dict[str, None] = {}
    for dish in dishes:
        if dish['path']:
            seen.setdefault(dish['path'], None)
    return list(seen)
