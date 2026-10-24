import datetime
from datetime import UTC

from flask_smorest import Blueprint

from ..extensions import db
from ..models import AuditLog, DishCatalog, Menu, MenuImage, MenuItem, Restaurant
from ..models.catalog import CategorySubstitution
from ..models.category import MenuCategory
from ..problems import Problem
from ..schemas.common import FileUploadSchema
from ..schemas.images import ImageListSchema, ImageOrderSchema, ImageSchema
from ..schemas.menus import (
    MENU_IMAGES_MAX,
    MenuItemPatchSchema,
    MenuListSchema,
    MenuPatchSchema,
    MenuSchema,
    MenuWriteSchema,
    SubstituteListSchema,
    SubstitutesInputSchema,
)
from ..schemas.public import (
    DeviceHeaderSchema,
    MenuRangeQuerySchema,
    PublicMenuItemSchema,
    VoteInputSchema,
    VoteSchema,
    VoteStateSchema,
)
from ..security import get_client_ip, limiter, public_limit
from ..services.menu_window import MAX_RANGE_DAYS, visible_range
from ..services.storage import storage
from ..services.votes import (
    VoteError,
    get_own_vote,
    published_menu_today,
    validate_and_record_vote,
    vote_dish_groups,
    voting_open,
)
from ..utils.time import as_utc, paris_today
from .helpers import audit, editor_required, get_current_user, get_or_create_dish, store_image
from .scope import SESSION_OPTIONAL, finish_public_read, member_site, public_site, readable_site

menus_bp = Blueprint(
    'menus', __name__,
    description="A site's menus: the published ones for anyone, drafts too for its editors",
)
menus_bp.after_request(finish_public_read)


def _menu_not_found() -> Problem:
    return Problem(404, 'menu_not_found', 'Menu introuvable.')


def _category_tree(restaurant: Restaurant, items: list[MenuItem]) -> list[dict]:
    by_category: dict[int, list[dict]] = {}
    for item in items:
        by_category.setdefault(item.category_id, []).append(item.to_dict())

    def node(category: MenuCategory) -> dict:
        return {
            'id': category.id,
            'label': category.label,
            'is_highlighted': category.is_highlighted,
            'order': category.order,
            'color_key': category.color_key,
        }

    tree = []
    for category in MenuCategory.query.filter_by(
        restaurant_id=restaurant.id, parent_id=None
    ).order_by(MenuCategory.order):
        entry = node(category)
        if category.subcategories:
            entry['subcategories'] = [
                {**node(sub), 'items': by_category.get(sub.id, [])}
                for sub in sorted(category.subcategories, key=lambda sub: sub.order)
            ]
        else:
            entry['items'] = by_category.get(category.id, [])
        tree.append(entry)
    return tree


def menu_view(menu, member: bool) -> dict:
    """The one representation of a menu, with the editors' fields when `member`."""
    items = list(menu.items)
    served = {item.category_id for item in items}
    substitutes: dict[str, list] = {}
    for substitution in menu.substitutions:
        if substitution.category_id not in served:
            continue
        substitutes.setdefault(str(substitution.category_id), []).append(
            {'dish': substitution.dish.to_dict(), 'order': substitution.order}
        )
    view = {
        'date': menu.date,
        'chef_note': menu.chef_note,
        'by_category': _category_tree(menu.restaurant, items),
        'images': [
            {'url': image.url, 'order': image.order, **({'id': image.id} if member else {})}
            for image in menu.images
        ],
        'substitutions': substitutes,
    }
    if member:
        view |= {
            'status': menu.status,
            'published_at': as_utc(menu.published_at),
            'updated_at': as_utc(menu.updated_at),
        }
    return view


def _site_menu(restaurant: Restaurant, date: datetime.date):
    menu = Menu.query.filter_by(restaurant_id=restaurant.id, date=date).first()
    if menu is None:
        raise _menu_not_found()
    return menu


def _check_categories(restaurant: Restaurant, items: list[dict]) -> None:
    leaves = {
        category.id
        for category in MenuCategory.query.filter_by(restaurant_id=restaurant.id)
        if category.is_leaf
    }
    wrong = [index for index, item in enumerate(items) if item['category_id'] not in leaves]
    if wrong:
        raise Problem(
            422, 'category_invalid', 'Catégorie inconnue, ou qui porte des sous-catégories.',
            errors=[
                {'pointer': f'/items/{index}/category_id', 'detail': 'Catégorie invalide.'}
                for index in wrong
            ],
        )


def _sync_menu_items(menu, items_data: list[dict]) -> None:
    """Items keep their ids: those given are updated in place, new ones inserted,
    the ones left out deleted.
    """
    existing = {item.id: item for item in menu.items}
    incoming_ids = set()

    for idx, item_data in enumerate(items_data):
        item_id = item_data.get('id')
        if item_id in existing:
            item = existing[item_id]
            item.category_id = item_data['category_id']
            item.order = item_data.get('order', idx)
            item.is_out_of_stock = item_data.get('is_out_of_stock', item.is_out_of_stock)
            new_dish_id = item_data.get('dish_id')
            if new_dish_id and new_dish_id != item.dish_id:
                dish = DishCatalog.query.filter_by(
                    id=new_dish_id, restaurant_id=menu.restaurant_id
                ).first()
                if dish:
                    item.dish_id = dish.id
            incoming_ids.add(item_id)
            continue
        dish = get_or_create_dish(menu.restaurant_id, item_data)
        if not dish:
            continue
        item = MenuItem(
            menu_id=menu.id,
            category_id=item_data['category_id'],
            dish_id=dish.id,
            order=item_data.get('order', idx),
            is_out_of_stock=item_data.get('is_out_of_stock', False),
        )
        db.session.add(item)
        db.session.flush()
        incoming_ids.add(item.id)

    for item_id, item in existing.items():
        if item_id not in incoming_ids:
            db.session.delete(item)


def mark_published(menu) -> None:
    menu.status = 'published'
    menu.published_at = datetime.datetime.now(UTC)
    menu.published_by_id = get_current_user().id


@menus_bp.route('', methods=['GET'])
@menus_bp.doc(security=SESSION_OPTIONAL)
@limiter.limit(public_limit)
@menus_bp.arguments(MenuRangeQuerySchema, location='query')
@menus_bp.response(200, MenuListSchema)
def list_menus(query, org: str, site: str):
    """Menus between two dates, both included.

    Anyone reads the published menus of the site's `menu_window`, and a range
    reaching past it lists what falls inside. The site's editors read every
    menu of the range, drafts included.
    """
    restaurant, member = readable_site(org, site)
    today = paris_today()
    window_start, window_end = visible_range(today)
    start = query.get('start', today)
    end = query.get('end', max(window_end, start))
    menus = Menu.query.filter(Menu.restaurant_id == restaurant.id)
    if member:
        end = min(end, start + datetime.timedelta(days=MAX_RANGE_DAYS - 1))
    else:
        start, end = max(start, window_start), min(end, window_end)
        menus = menus.filter(Menu.status == 'published')
    menus = menus.filter(Menu.date >= start, Menu.date <= end).order_by(Menu.date)
    return {'items': [menu_view(menu, member) for menu in menus]}


@menus_bp.route('/<date:date>', methods=['GET'])
@menus_bp.doc(security=SESSION_OPTIONAL)
@limiter.limit(public_limit)
@menus_bp.response(200, MenuSchema)
def get_menu(org: str, site: str, date: datetime.date):
    """The menu of one day: published and within the `menu_window`, or any for
    the site's editors.
    """
    restaurant, member = readable_site(org, site)
    menu = Menu.query.filter_by(restaurant_id=restaurant.id, date=date).first()
    if menu is not None and not member:
        window_start, window_end = visible_range(paris_today())
        if menu.status != 'published' or not window_start <= date <= window_end:
            menu = None
    if menu is None:
        raise _menu_not_found()
    return menu_view(menu, member)


@menus_bp.route('/<date:date>', methods=['PUT'])
@editor_required
@menus_bp.arguments(MenuWriteSchema)
@menus_bp.response(200, MenuSchema, description='The menu replaced the day’s previous one')
@menus_bp.alt_response(201, schema=MenuSchema, description='The day’s first menu')
def put_menu(body, org: str, site: str, date: datetime.date):
    """Create or replace the menu of a day.

    An item sent with its `id` keeps it; the items left out are removed. A menu
    without items goes back to draft.
    """
    restaurant = member_site(org, site)
    _check_categories(restaurant, body['items'])
    menu = Menu.query.filter_by(restaurant_id=restaurant.id, date=date).first()
    is_new = menu is None
    if is_new:
        menu = Menu(restaurant_id=restaurant.id, date=date)
        db.session.add(menu)
        db.session.flush()

    menu.chef_note = body['chef_note'] or None
    _sync_menu_items(menu, body['items'])
    if not body['items']:
        menu.status = 'draft'
        menu.published_at = None
        menu.published_by_id = None

    if is_new or menu.status == 'published':
        audit(
            AuditLog.ACTION_MENU_CREATE if is_new else AuditLog.ACTION_MENU_UPDATE,
            restaurant,
            target_type='menu',
            target_id=menu.id,
            details={'date': date.isoformat(), 'items_count': len(body['items'])},
        )
    db.session.commit()
    return menu_view(menu, True), 201 if is_new else 200


@menus_bp.route('/<date:date>', methods=['PATCH'])
@editor_required
@menus_bp.arguments(MenuPatchSchema)
@menus_bp.response(200, MenuSchema)
def patch_menu(body, org: str, site: str, date: datetime.date):
    """Change the chef's note of a menu."""
    menu = _site_menu(member_site(org, site), date)
    menu.chef_note = body['chef_note'] or None
    db.session.commit()
    return menu_view(menu, True)


@menus_bp.route('/<date:date>', methods=['DELETE'])
@editor_required
@menus_bp.response(204)
def delete_menu(org: str, site: str, date: datetime.date):
    """Delete a menu, with its items and images."""
    restaurant = member_site(org, site)
    menu = _site_menu(restaurant, date)
    for image in list(menu.images):
        storage.delete_file(image.storage_key)
    audit(
        AuditLog.ACTION_MENU_UPDATE,
        restaurant,
        target_type='menu',
        target_id=menu.id,
        details={'action': 'delete', 'date': date.isoformat()},
    )
    db.session.delete(menu)
    db.session.commit()


@menus_bp.route('/<date:date>/publish', methods=['POST'])
@editor_required
@menus_bp.response(200, MenuSchema)
def publish_menu(org: str, site: str, date: datetime.date):
    """Publish a menu; publishing it again records the new time."""
    restaurant = member_site(org, site)
    menu = _site_menu(restaurant, date)
    if menu.items.count() == 0:
        raise Problem(409, 'menu_empty', 'Impossible de publier un menu vide.')
    mark_published(menu)
    audit(
        AuditLog.ACTION_MENU_PUBLISH,
        restaurant,
        target_type='menu',
        target_id=menu.id,
        details={'date': date.isoformat()},
    )
    db.session.commit()
    return menu_view(menu, True)


@menus_bp.route('/<date:date>/unpublish', methods=['POST'])
@editor_required
@menus_bp.response(200, MenuSchema)
def unpublish_menu(org: str, site: str, date: datetime.date):
    """Take a published menu back to draft."""
    restaurant = member_site(org, site)
    menu = _site_menu(restaurant, date)
    if menu.status != 'published':
        raise Problem(409, 'menu_not_published', "Le menu n'est pas publié.")
    menu.status = 'draft'
    audit(
        AuditLog.ACTION_MENU_UPDATE,
        restaurant,
        target_type='menu',
        target_id=menu.id,
        details={'action': 'unpublish', 'date': date.isoformat()},
    )
    db.session.commit()
    return menu_view(menu, True)


@menus_bp.route('/<date:date>/items/<int:item_id>', methods=['PATCH'])
@editor_required
@menus_bp.arguments(MenuItemPatchSchema)
@menus_bp.response(200, PublicMenuItemSchema)
def patch_menu_item(body, org: str, site: str, date: datetime.date, item_id: int):
    """Mark an item out of stock during service, or back in."""
    menu = _site_menu(member_site(org, site), date)
    item = MenuItem.query.filter_by(id=item_id, menu_id=menu.id).first()
    if item is None:
        raise Problem(404, 'menu_item_not_found', 'Plat introuvable dans ce menu.')
    item.is_out_of_stock = body['is_out_of_stock']
    db.session.commit()
    return item.to_dict()


@menus_bp.route('/<date:date>/images', methods=['POST'])
@editor_required
@menus_bp.arguments(FileUploadSchema, location='files')
@menus_bp.response(201, ImageSchema)
def add_menu_image(files, org: str, site: str, date: datetime.date):
    """Add a photo to a menu: JPEG, PNG, WebP or HEIC, stored as JPEG."""
    restaurant = member_site(org, site)
    menu = _site_menu(restaurant, date)
    count = menu.images.count()
    if count >= MENU_IMAGES_MAX:
        raise Problem(
            409, 'menu_image_limit', f'Un menu porte {MENU_IMAGES_MAX} images au plus.'
        )
    stored, filename = store_image(files['file'], f'menus/{menu.id}')

    image = MenuImage(
        menu_id=menu.id,
        storage_key=stored['key'],
        url=stored['url'],
        filename=filename,
        order=count,
    )
    db.session.add(image)
    db.session.flush()
    audit(
        AuditLog.ACTION_MENU_IMAGE_UPLOAD,
        restaurant,
        target_type='menu_image',
        target_id=image.id,
    )
    db.session.commit()
    return image


@menus_bp.route('/<date:date>/images/<int:image_id>', methods=['DELETE'])
@editor_required
@menus_bp.response(204)
def delete_menu_image(org: str, site: str, date: datetime.date, image_id: int):
    """Remove a photo from a menu."""
    restaurant = member_site(org, site)
    menu = _site_menu(restaurant, date)
    image = MenuImage.query.filter_by(id=image_id, menu_id=menu.id).first()
    if image is None:
        raise Problem(404, 'menu_image_not_found', 'Image introuvable.')
    storage.delete_file(image.storage_key)
    db.session.delete(image)
    audit(
        AuditLog.ACTION_MENU_IMAGE_DELETE,
        restaurant,
        target_type='menu_image',
        target_id=image_id,
    )
    db.session.commit()


@menus_bp.route('/<date:date>/images/order', methods=['PUT'])
@editor_required
@menus_bp.arguments(ImageOrderSchema)
@menus_bp.response(200, ImageListSchema)
def order_menu_images(body, org: str, site: str, date: datetime.date):
    """Put a menu's photos in a new order."""
    menu = _site_menu(member_site(org, site), date)
    images = {image.id: image for image in menu.images}
    if sorted(body['image_ids']) != sorted(images):
        raise Problem(
            422, 'image_order_invalid', 'La liste doit reprendre chaque image du menu, une fois.'
        )
    for order, image_id in enumerate(body['image_ids']):
        images[image_id].order = order
    db.session.commit()
    return {'items': list(menu.images.order_by(MenuImage.order))}


@menus_bp.route('/<date:date>/substitutions/<int:category_id>', methods=['PUT'])
@editor_required
@menus_bp.arguments(SubstitutesInputSchema)
@menus_bp.response(200, SubstituteListSchema)
def put_substitutes(body, org: str, site: str, date: datetime.date, category_id: int):
    """Replace the dishes offered when a dish of this category runs out."""
    restaurant = member_site(org, site)
    menu = _site_menu(restaurant, date)
    if MenuCategory.query.filter_by(id=category_id, restaurant_id=restaurant.id).first() is None:
        raise Problem(404, 'category_not_found', 'Catégorie introuvable.')
    wanted = body['dish_ids']
    owned = {
        dish.id: dish
        for dish in DishCatalog.query.filter(
            DishCatalog.id.in_(wanted), DishCatalog.restaurant_id == restaurant.id
        )
    }
    if len(set(wanted)) != len(wanted) or set(wanted) - owned.keys():
        raise Problem(
            422, 'dish_invalid', 'Chaque plat doit venir du catalogue du site, une seule fois.'
        )

    CategorySubstitution.query.filter_by(menu_id=menu.id, category_id=category_id).delete()
    substitutes = [
        CategorySubstitution(menu_id=menu.id, category_id=category_id, dish_id=dish_id, order=order)
        for order, dish_id in enumerate(wanted)
    ]
    db.session.add_all(substitutes)
    db.session.commit()
    return {'items': [{'dish': owned[sub.dish_id].to_dict(), 'order': sub.order} for sub in substitutes]}


def _only_today(day: datetime.date) -> None:
    if day != paris_today():
        raise Problem(404, 'vote_not_found', 'Le vote ne porte que sur le menu du jour.')


@menus_bp.route('/<date:date>/vote', methods=['GET'])
@menus_bp.doc(security=[])
@limiter.limit(public_limit)
@menus_bp.arguments(DeviceHeaderSchema, location='headers')
@menus_bp.response(200, VoteStateSchema)
def get_vote(headers, org: str, site: str, date: datetime.date):
    """What the caller's device may rate today, and its own vote if any.

    Never anyone else's vote.
    """
    restaurant = public_site(org, site)
    _only_today(date)
    menu = published_menu_today(restaurant.id) if restaurant.vote_enabled else None
    vote = get_own_vote(restaurant.organization_id, headers.get('device_id'))
    return {
        'vote': vote.to_dict() if vote else None,
        'dish_groups': vote_dish_groups(restaurant, menu) if menu else [],
        'voting_open': menu is not None and voting_open(restaurant),
    }


@menus_bp.route('/<date:date>/vote', methods=['PUT'])
@menus_bp.doc(security=[])
@limiter.limit(public_limit)
@menus_bp.arguments(DeviceHeaderSchema, location='headers')
@menus_bp.arguments(VoteInputSchema)
@menus_bp.response(200, VoteSchema, description='The vote replaced the device’s previous one')
@menus_bp.alt_response(201, schema=VoteSchema, description='The device’s first vote of the day')
def put_vote(headers, body, org: str, site: str, date: datetime.date):
    """Rate today's meal: one vote per device, organization and day."""
    restaurant = public_site(org, site)
    _only_today(date)
    try:
        outcome = validate_and_record_vote(
            restaurant,
            headers.get('device_id'),
            body['rating'],
            body['dish_ids'],
            body['fingerprint'],
            get_client_ip(),
        )
    except VoteError as error:
        raise Problem(error.status, error.code, error.message) from None
    vote = get_own_vote(restaurant.organization_id, headers.get('device_id'))
    assert vote is not None, 'the vote just stored'
    return vote.to_dict(), 201 if outcome == 'created' else 200
