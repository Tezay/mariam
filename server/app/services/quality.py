"""What a site's menus of the last days say of the dishes it served."""
from datetime import date, timedelta

from sqlalchemy.orm import aliased

from ..extensions import db
from ..models import (
    Certification,
    EgalimDeclaration,
    Menu,
    MenuCategory,
    MenuItem,
    Restaurant,
    dish_certifications,
    dish_dietary_tags,
)

WINDOW_DAYS = 30
SHARE_TAGS = {'homemade': 'homemade', 'local': 'local_product', 'seasonal': 'seasonal'}
VEGETARIAN_TAGS = {'vegetarian', 'vegan'}


def _served(restaurant: Restaurant, today: date) -> list[tuple[int, bool]]:
    parent = aliased(MenuCategory)
    main = db.or_(MenuCategory.is_highlighted, db.func.coalesce(parent.is_highlighted, False))
    return (
        db.session.query(MenuItem.dish_id, main)
        .join(Menu, Menu.id == MenuItem.menu_id)
        .join(MenuCategory, MenuCategory.id == MenuItem.category_id)
        .outerjoin(parent, parent.id == MenuCategory.parent_id)
        .filter(
            Menu.restaurant_id == restaurant.id,
            Menu.status == 'published',
            Menu.date.between(today - timedelta(days=WINDOW_DAYS - 1), today),
        )
        .all()
    )


def _percent(count: int, total: int) -> int:
    return round(100 * count / total)


def quality_view(restaurant: Restaurant, today: date) -> dict:
    declaration = (
        EgalimDeclaration.query.filter_by(restaurant_id=restaurant.id)
        .order_by(EgalimDeclaration.year.desc())
        .first()
    )
    served = _served(restaurant, today)
    dish_ids = {dish_id for dish_id, _ in served}
    tags: dict[int, set[str]] = {}
    for dish_id, tag_id in db.session.execute(
        db.select(dish_dietary_tags.c.dish_id, dish_dietary_tags.c.tag_id)
        .where(dish_dietary_tags.c.dish_id.in_(dish_ids))
    ):
        tags.setdefault(dish_id, set()).add(tag_id)
    certified = db.session.execute(
        db.select(dish_certifications.c.dish_id, dish_certifications.c.certification_id)
        .where(dish_certifications.c.dish_id.in_(dish_ids))
    ).all()
    labelled = {dish_id for dish_id, _ in certified}

    menus = None
    if served:
        mains = [dish_id for dish_id, main in served if main]
        menus = {
            'days': WINDOW_DAYS,
            'labelled': _percent(sum(dish_id in labelled for dish_id, _ in served), len(served)),
            **{
                share: _percent(
                    sum(tag in tags.get(dish_id, ()) for dish_id, _ in served), len(served)
                )
                for share, tag in SHARE_TAGS.items()
            },
            'vegetarian': _percent(
                sum(bool(VEGETARIAN_TAGS & tags.get(dish_id, set())) for dish_id in mains),
                len(mains),
            ) if mains else None,
        }
    labels = Certification.query.filter(
        Certification.id.in_({certification_id for _, certification_id in certified})
    ).order_by(Certification.sort_order).all()
    return {'declaration': declaration, 'menus': menus, 'labels': labels}
