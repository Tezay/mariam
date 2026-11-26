"""The archive of a site's data, handed to its client at the end of a contract.

Each file takes the shape the API or the dashboard already gives it: JSON from
their schemas, the catalogue in the CSV the import reads back, the audit log in
the dashboard's export.
"""
import csv
import io
import json
import os
import zipfile

from werkzeug.utils import secure_filename

from ..models import (
    AuditLog,
    DishCatalog,
    EgalimDeclaration,
    Event,
    ExceptionalClosure,
    Menu,
    MenuCategory,
    Restaurant,
    RestaurantPhoto,
    SiteMembership,
    User,
)
from ..models.menu_vote import MenuVote
from ..models.restaurant_calendar import RestaurantCalendarSettings
from ..routes.audit import audit_csv
from ..routes.news import news_view
from ..routes.sites import site_view
from ..schemas.categories import MenuCategorySchema
from ..schemas.news import NewsSchema
from ..schemas.sites import CalendarSettingsSchema, SiteSchema
from ..services import catalog_csv
from ..services.storage import storage
from ..utils.spreadsheet import safe_cell


def _csv(header: list[str], rows) -> str:
    """Semicolon-separated with a BOM, as the catalogue export: Excel reads it as UTF-8."""
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=';')
    writer.writerow(header)
    writer.writerows([safe_cell('' if value is None else value) for value in row] for row in rows)
    return '﻿' + buffer.getvalue()


def _json(data) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2, default=str)


def _profile(site: Restaurant) -> dict:
    settings = RestaurantCalendarSettings.query.filter_by(restaurant_id=site.id).first()
    return {
        **SiteSchema().dump(site_view(site, member=True)),
        'calendar_settings': CalendarSettingsSchema().dump(settings) if settings else None,
    }


def _menu_rows(site: Restaurant):
    paths = catalog_csv.category_paths(site.id)
    for menu in Menu.query.filter_by(restaurant_id=site.id).order_by(Menu.date):
        for item in menu.items:
            parent, child = paths.get(item.category_id, ('', ''))
            yield [menu.date.isoformat(), menu.status, parent, child, item.dish.name]


def _vote_rows(site: Restaurant):
    votes = MenuVote.query.filter_by(restaurant_id=site.id).order_by(MenuVote.date, MenuVote.id)
    for vote in votes:
        yield [
            vote.date.isoformat(), vote.rating,
            ' | '.join(dish.name for dish in vote.dishes), vote.source,
        ]


def _account_rows(site: Restaurant):
    return (
        SiteMembership.query.filter_by(restaurant_id=site.id)
        .join(User, User.id == SiteMembership.user_id).order_by(User.email)
        .with_entities(User.email, User.username, SiteMembership.role)
    )


def _image_name(*parts, key: str) -> str:
    extension = os.path.splitext(key)[1].lower()
    return 'images/' + '/'.join(secure_filename(str(part)) for part in parts) + extension


def _images(site: Restaurant) -> list[tuple[str, str]]:
    """(name in the archive, storage key) of every file the site holds."""
    images = []
    if site.logo_storage_key:
        images.append((_image_name('logo', key=site.logo_storage_key), site.logo_storage_key))
    if site.cover_storage_key:
        images.append(
            (_image_name('couverture', key=site.cover_storage_key), site.cover_storage_key)
        )
    photos = RestaurantPhoto.query.filter_by(restaurant_id=site.id).order_by(
        RestaurantPhoto.order, RestaurantPhoto.id
    )
    for number, photo in enumerate(photos, start=1):
        images.append((_image_name('photos', number, key=photo.storage_key), photo.storage_key))
    for event in Event.query.filter_by(restaurant_id=site.id):
        for number, image in enumerate(event.images, start=1):
            name = _image_name('actualites', f'{event.id}-{event.title}-{number}',
                               key=image.storage_key)
            images.append((name, image.storage_key))
    dishes = DishCatalog.query.filter(
        DishCatalog.restaurant_id == site.id, DishCatalog.storage_key.isnot(None)
    )
    for dish in dishes:
        images.append(
            (_image_name('plats', f'{dish.id}-{dish.name}', key=dish.storage_key), dish.storage_key)
        )
    return images


def write_archive(site: Restaurant, path: str) -> tuple[dict[str, int], list[str]]:
    """Writes the archive; the number of lines or items of each file, and the images not read."""
    categories = MenuCategory.query.filter_by(restaurant_id=site.id, parent_id=None).order_by(
        MenuCategory.order
    )
    news = Event.query.filter_by(restaurant_id=site.id).order_by(Event.event_date, Event.id)
    dishes = DishCatalog.query.filter_by(restaurant_id=site.id).order_by(DishCatalog.name).all()
    closures = ExceptionalClosure.query.filter_by(restaurant_id=site.id).order_by(
        ExceptionalClosure.start_date
    )
    declarations = EgalimDeclaration.query.filter_by(restaurant_id=site.id).order_by(
        EgalimDeclaration.year
    )
    logs = AuditLog.query.filter_by(restaurant_id=site.id).order_by(AuditLog.created_at.desc())

    tables = {
        'menus.csv': (['date', 'statut', 'categorie', 'sous_categorie', 'plat'], _menu_rows(site)),
        'plats.csv': (
            catalog_csv.COLUMNS,
            catalog_csv.serialize(dishes, catalog_csv.category_paths(site.id)),
        ),
        'fermetures.csv': (
            ['debut', 'fin', 'motif', 'description'],
            ([c.start_date, c.end_date, c.reason, c.description] for c in closures),
        ),
        'comptes.csv': (['adresse', 'nom', 'role'], _account_rows(site)),
        'votes.csv': (['date', 'note', 'plats', 'source'], _vote_rows(site)),
        'egalim.csv': (
            ['annee', 'part_durable', 'part_bio', 'part_territoriale'],
            ([d.year, d.sustainable_share, d.organic_share, d.territorial_share]
             for d in declarations),
        ),
    }
    counts: dict[str, int] = {}
    missing: list[str] = []
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('site.json', _json(_profile(site)))
        tree = MenuCategorySchema(many=True).dump([c.to_dict() for c in categories])
        archive.writestr('categories.json', _json(tree))
        counts['categories.json'] = len(tree)
        items = NewsSchema(many=True).dump([news_view(item, member=True) for item in news])
        archive.writestr('actualites.json', _json(items))
        counts['actualites.json'] = len(items)
        for name, (header, rows) in tables.items():
            rows = list(rows)
            archive.writestr(name, _csv(header, rows))
            counts[name] = len(rows)
        entries = logs.all()
        archive.writestr('journal.csv', audit_csv(entries))
        counts['journal.csv'] = len(entries)
        images = _images(site)
        for name, key in images:
            content = storage.read_file(key)
            if content is None:
                missing.append(name)
            else:
                archive.writestr(name, content)
        counts['images'] = len(images) - len(missing)
    return counts, missing
