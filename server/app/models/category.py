from ..extensions import db
from ..utils.time import utc_now_naive


class MenuCategory(db.Model):
    __tablename__ = 'menu_categories'

    id = db.Column(db.Integer, primary_key=True)
    restaurant_id = db.Column(
        db.Integer, db.ForeignKey('restaurants.id', ondelete='CASCADE'), nullable=False
    )
    # One level only: a subcategory has none of its own.
    parent_id = db.Column(
        db.Integer, db.ForeignKey('menu_categories.id', ondelete='CASCADE'), nullable=True
    )
    label = db.Column(db.String(100), nullable=False)
    order = db.Column(db.Integer, nullable=False, default=0)
    is_protected = db.Column(db.Boolean, nullable=False, default=False)
    is_highlighted = db.Column(db.Boolean, nullable=False, default=False)
    color_key = db.Column(db.String(30), nullable=True, default=None)
    created_at = db.Column(db.DateTime, default=utc_now_naive)
    updated_at = db.Column(db.DateTime, default=utc_now_naive, onupdate=utc_now_naive)

    subcategories = db.relationship(
        'MenuCategory',
        backref=db.backref('parent', remote_side='MenuCategory.id'),
        lazy='select',
        foreign_keys='MenuCategory.parent_id',
        order_by='MenuCategory.order',
        cascade='all, delete-orphan',
    )

    menu_items = db.relationship(
        'MenuItem',
        backref='category_obj',
        lazy='dynamic',
        foreign_keys='MenuItem.category_id',
    )

    __table_args__ = (
        db.Index('ix_menu_categories_restaurant', 'restaurant_id'),
        db.Index('ix_menu_categories_parent', 'parent_id'),
    )

    # Kept in step with COLOR_KEY_MAP (client/src/lib/category-colors.ts).
    COLOR_KEYS = ('indigo', 'sky', 'mint', 'saffron', 'clay', 'lilac')

    @classmethod
    def next_color_key(cls, restaurant_id: int) -> str:
        """The first colour of the palette the site does not use yet."""
        used = {
            category.color_key
            for category in cls.query.filter_by(restaurant_id=restaurant_id)
            if category.color_key
        }
        return next((key for key in cls.COLOR_KEYS if key not in used), cls.COLOR_KEYS[0])

    @classmethod
    def create_defaults(cls, restaurant_id: int) -> None:
        """A new site's categories, flushed but not committed."""
        main = cls(
            restaurant_id=restaurant_id, label='Plat principal', order=2,
            is_protected=True, is_highlighted=True,
        )
        db.session.add(main)
        db.session.flush()
        db.session.add_all([
            cls(restaurant_id=restaurant_id, label='Entrées', order=1, color_key='indigo'),
            cls(restaurant_id=restaurant_id, label='Dessert', order=3, color_key='saffron'),
            cls(restaurant_id=restaurant_id, parent_id=main.id, label='Protéine', order=1,
                is_protected=True, color_key='clay'),
            cls(restaurant_id=restaurant_id, parent_id=main.id, label='Accompagnement', order=2,
                is_protected=True, color_key='mint'),
        ])

    @property
    def is_leaf(self) -> bool:
        """A category with subcategories groups them; only leaves carry dishes."""
        return not self.subcategories

    def to_dict(self, include_subcategories=True):
        data = {
            'id': self.id,
            'restaurant_id': self.restaurant_id,
            'parent_id': self.parent_id,
            'label': self.label,
            'order': self.order,
            'is_protected': self.is_protected,
            'is_highlighted': self.is_highlighted,
            'color_key': self.color_key,
        }
        if include_subcategories and self.parent_id is None:
            data['subcategories'] = [s.to_dict(include_subcategories=False) for s in self.subcategories]
        return data

    def __repr__(self):
        return f'<MenuCategory {self.id} "{self.label}" (restaurant={self.restaurant_id})>'
