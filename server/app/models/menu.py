"""
Modèles Menu, MenuItem et MenuImage - Gestion des menus quotidiens.

Structure :
- Un Menu correspond à une date + un restaurant
- Chaque Menu contient plusieurs MenuItem (entrées, plats, desserts)
- MenuItem référence DishCatalog (entité plat réutilisable)
- Chaque Menu peut avoir une "note du chef"
- Statuts : brouillon (draft) ou publié (published)
"""
from datetime import datetime

from ..extensions import db


class Menu(db.Model):
    """Menu du jour pour un restaurant."""
    
    __tablename__ = 'menus'
    
    id = db.Column(db.Integer, primary_key=True)
    restaurant_id = db.Column(db.Integer, db.ForeignKey('restaurants.id'), nullable=False)
    date = db.Column(db.Date, nullable=False, index=True)
    status = db.Column(db.String(20), default='draft')  # draft, published
    published_at = db.Column(db.DateTime, nullable=True)
    published_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Note du chef — courte phrase / citation affichée en TV
    chef_note = db.Column(db.String(300), nullable=True)
    
    # Relations
    items = db.relationship('MenuItem', backref='menu', lazy='dynamic',
                           cascade='all, delete-orphan', order_by='MenuItem.order')
    images = db.relationship('MenuImage', backref='menu', lazy='dynamic',
                            cascade='all, delete-orphan', order_by='MenuImage.order')
    substitutions = db.relationship(
        'CategorySubstitution',
        lazy='selectin',
        cascade='all, delete-orphan',
        order_by='CategorySubstitution.order',
    )
    published_by = db.relationship('User', backref='published_menus', foreign_keys=[published_by_id])
    
    # Contrainte d'unicité : un seul menu par date et par restaurant
    __table_args__ = (db.UniqueConstraint('restaurant_id', 'date', name='uq_menu_restaurant_date'),)
    
    def to_dict(self, include_items=True, include_images=True):
        """Sérialise le menu en dictionnaire JSON."""
        data = {
            'id': self.id,
            'restaurant_id': self.restaurant_id,
            'date': self.date.isoformat() if self.date else None,
            'status': self.status,
            'chef_note': self.chef_note,
            'published_at': self.published_at.isoformat() if self.published_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
        
        if include_items:
            data['items'] = [item.to_dict() for item in self.items.order_by(MenuItem.category_id, MenuItem.order)]
            # Substitutions groupées par category_id
            subs: dict[str, list] = {}
            for s in self.substitutions:
                key = str(s.category_id)
                if key not in subs:
                    subs[key] = []
                subs[key].append({'dish': s.dish.to_dict() if s.dish else None, 'order': s.order})
            data['substitutions'] = subs

        if include_images:
            data['images'] = [img.to_dict() for img in self.images.order_by(MenuImage.order)]

        return data
    
    def get_items_by_category(self):
        """Retourne les items groupés par category_id (entier)."""
        categories = {}
        for item in self.items:
            cat = item.category_id
            if cat not in categories:
                categories[cat] = []
            categories[cat].append(item.to_dict())
        return categories
    
    def __repr__(self):
        return f'<Menu {self.date} - {self.status}>'


class MenuItem(db.Model):
    """Item d'un menu — référence une entité DishCatalog réutilisable."""

    __tablename__ = 'menu_items'

    id = db.Column(db.Integer, primary_key=True)
    menu_id = db.Column(db.Integer, db.ForeignKey('menus.id'), nullable=False)
    category_id = db.Column(db.Integer, db.ForeignKey('menu_categories.id'), nullable=False)
    dish_id = db.Column(
        db.Integer,
        db.ForeignKey('dish_catalog.id', ondelete='RESTRICT'),
        nullable=False,
    )
    order = db.Column(db.Integer, default=0)
    is_out_of_stock = db.Column(db.Boolean, nullable=False, default=False)

    __table_args__ = (
        db.Index('ix_menu_items_menu_id_dish_id', 'menu_id', 'dish_id'),
    )

    dish = db.relationship('DishCatalog', lazy='joined')

    def to_dict(self):
        """Sérialise l'item en dictionnaire JSON."""
        return {
            'id': self.id,
            'menu_id': self.menu_id,
            'category_id': self.category_id,
            'dish_id': self.dish_id,
            'dish': self.dish.to_dict() if self.dish else None,
            'order': self.order,
            'is_out_of_stock': self.is_out_of_stock,
        }

    def __repr__(self):
        return f'<MenuItem cat={self.category_id} dish={self.dish_id}>'


class MenuImage(db.Model):
    """Image associée à un menu du jour, stockée sur S3."""

    __tablename__ = 'menu_images'

    id = db.Column(db.Integer, primary_key=True)
    menu_id = db.Column(db.Integer, db.ForeignKey('menus.id'), nullable=False)
    storage_key = db.Column(db.String(500), nullable=False)
    url = db.Column(db.String(500), nullable=False)
    filename = db.Column(db.String(255), nullable=True)
    order = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'menu_id': self.menu_id,
            'url': self.url,
            'filename': self.filename,
            'order': self.order,
        }

    def __repr__(self):
        return f'<MenuImage {self.id} for Menu {self.menu_id}>'
