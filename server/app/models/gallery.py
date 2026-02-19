"""
Modèles GalleryImage, GalleryImageTag, MenuItemImage — Galerie photo de plats.

Architecture :
- GalleryImage : image maître stockée sur S3, partagée entre menus.
- GalleryImageTag : tag associé à une image (automatique ou manuel).
  - type 'dish' : nom du plat au moment de l'upload (modifiable).
  - type 'category' : référence la catégorie du restaurant (évolue si la catégorie est renommée).
  - type 'manual' : tag libre ajouté par le gestionnaire.
- MenuItemImage : table de jonction liant une image de la galerie à un
  item de menu spécifique (menu_id + category + item_index).
"""
from datetime import datetime
from ..extensions import db


class GalleryImage(db.Model):
    """Image de plat stockée en galerie (S3)."""

    __tablename__ = 'gallery_images'

    id = db.Column(db.Integer, primary_key=True)
    restaurant_id = db.Column(db.Integer, db.ForeignKey('restaurants.id'), nullable=False)
    storage_key = db.Column(db.String(500), nullable=False)
    url = db.Column(db.String(500), nullable=False)
    filename = db.Column(db.String(255), nullable=True)
    file_size = db.Column(db.Integer, nullable=True)          # octets
    mime_type = db.Column(db.String(100), nullable=True)
    uploaded_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relations
    tags = db.relationship(
        'GalleryImageTag', backref='image', lazy='dynamic',
        cascade='all, delete-orphan',
    )
    menu_usages = db.relationship(
        'MenuItemImage', backref='gallery_image', lazy='dynamic',
        cascade='all, delete-orphan',
    )
    uploaded_by = db.relationship('User', backref='uploaded_gallery_images', foreign_keys=[uploaded_by_id])

    # Index pour la recherche par restaurant
    __table_args__ = (
        db.Index('ix_gallery_images_restaurant', 'restaurant_id'),
    )

    def to_dict(self, include_tags=True, include_usage_count=False):
        """Sérialise l'image en dictionnaire JSON."""
        data = {
            'id': self.id,
            'restaurant_id': self.restaurant_id,
            'url': self.url,
            'filename': self.filename,
            'file_size': self.file_size,
            'mime_type': self.mime_type,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
        if include_tags:
            data['tags'] = [tag.to_dict() for tag in self.tags]
        if include_usage_count:
            data['usage_count'] = self.menu_usages.count()
        return data

    def __repr__(self):
        return f'<GalleryImage {self.id} ({self.filename})>'


class GalleryImageTag(db.Model):
    """Tag associé à une image de la galerie."""

    __tablename__ = 'gallery_image_tags'

    id = db.Column(db.Integer, primary_key=True)
    gallery_image_id = db.Column(db.Integer, db.ForeignKey('gallery_images.id'), nullable=False)
    name = db.Column(db.String(200), nullable=False)
    tag_type = db.Column(db.String(20), nullable=False)       # dish, category, manual
    category_id = db.Column(db.String(50), nullable=True)     # pour type='category', réf. config
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    VALID_TYPES = ('dish', 'category', 'manual')

    # Index pour la recherche full-text sur les tags
    __table_args__ = (
        db.Index('ix_gallery_image_tags_name', 'name'),
        db.Index('ix_gallery_image_tags_type', 'tag_type'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'gallery_image_id': self.gallery_image_id,
            'name': self.name,
            'tag_type': self.tag_type,
            'category_id': self.category_id,
        }

    def __repr__(self):
        return f'<GalleryImageTag {self.tag_type}:{self.name}>'


class MenuItemImage(db.Model):
    """Jonction entre un item de menu et une image de la galerie.

    Identifie l'item par (menu_id, category, item_index) plutôt que par
    MenuItem.id car les items sont recréés à chaque sauvegarde du menu.
    """

    __tablename__ = 'menu_item_images'

    id = db.Column(db.Integer, primary_key=True)
    menu_id = db.Column(db.Integer, db.ForeignKey('menus.id'), nullable=False)
    gallery_image_id = db.Column(db.Integer, db.ForeignKey('gallery_images.id'), nullable=False)
    category = db.Column(db.String(50), nullable=False)       # 'entree', 'plat', etc.
    item_index = db.Column(db.Integer, default=0)             # index dans la catégorie
    display_order = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relation vers le menu
    menu = db.relationship('Menu', backref=db.backref(
        'item_images', lazy='dynamic', cascade='all, delete-orphan',
    ))

    __table_args__ = (
        db.Index('ix_menu_item_images_menu', 'menu_id'),
        db.Index('ix_menu_item_images_gallery', 'gallery_image_id'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'menu_id': self.menu_id,
            'gallery_image_id': self.gallery_image_id,
            'category': self.category,
            'item_index': self.item_index,
            'display_order': self.display_order,
            'url': self.gallery_image.url if self.gallery_image else None,
            'filename': self.gallery_image.filename if self.gallery_image else None,
        }

    def __repr__(self):
        return f'<MenuItemImage menu={self.menu_id} cat={self.category}[{self.item_index}]>'
