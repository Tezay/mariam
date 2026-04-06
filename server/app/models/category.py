"""
Modèle MenuCategory — Catégories et sous-catégories de menu par restaurant.

Structure :
- Les catégories principales ont parent_id = NULL
- Les sous-catégories ont parent_id → MenuCategory.id (max 1 niveau d'imbrication)
- is_protected : ne peut pas être supprimé (ex: Plat principal, Protéines, Accompagnements)
- is_highlighted : items affichés en grand format avec image visible par défaut
"""
from datetime import datetime
from ..extensions import db


class MenuCategory(db.Model):
    """Catégorie ou sous-catégorie de menu d'un restaurant."""

    __tablename__ = 'menu_categories'

    id = db.Column(db.Integer, primary_key=True)
    restaurant_id = db.Column(
        db.Integer, db.ForeignKey('restaurants.id', ondelete='CASCADE'), nullable=False
    )
    parent_id = db.Column(
        db.Integer, db.ForeignKey('menu_categories.id', ondelete='CASCADE'), nullable=True
    )
    label = db.Column(db.String(100), nullable=False)
    icon = db.Column(db.String(50), nullable=False, default='utensils')
    order = db.Column(db.Integer, nullable=False, default=0)
    is_protected = db.Column(db.Boolean, nullable=False, default=False)
    is_highlighted = db.Column(db.Boolean, nullable=False, default=False)
    color_key = db.Column(db.String(30), nullable=True, default=None)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Sous-catégories (relation enfants)
    subcategories = db.relationship(
        'MenuCategory',
        backref=db.backref('parent', remote_side='MenuCategory.id'),
        lazy='select',
        foreign_keys='MenuCategory.parent_id',
        order_by='MenuCategory.order',
        cascade='all, delete-orphan',
    )

    # Items de menu liés à cette catégorie
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

    def to_dict(self, include_subcategories=True):
        data = {
            'id': self.id,
            'restaurant_id': self.restaurant_id,
            'parent_id': self.parent_id,
            'label': self.label,
            'icon': self.icon,
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
