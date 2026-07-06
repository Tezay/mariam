"""
Modèles DishCatalog et CategorySubstitution — Catalogue de plats par restaurant.

Architecture :
- DishCatalog : entité plat réutilisable par restaurant, avec image, tags et certifications.
- CategorySubstitution : plats de substitution définis par catégorie (affiché si un item
  de la catégorie est en rupture).
- dish_dietary_tags / dish_certifications : tables de jonction N:N.
"""
from datetime import UTC, datetime

from ..extensions import db

# ──────────────────────────────────────────────────────────────────────
#  TABLES DE JONCTION  (N:N)
# ──────────────────────────────────────────────────────────────────────

dish_dietary_tags = db.Table(
    'dish_dietary_tags',
    db.Column(
        'dish_id',
        db.Integer,
        db.ForeignKey('dish_catalog.id', ondelete='CASCADE'),
        primary_key=True,
    ),
    db.Column(
        'tag_id',
        db.String(50),
        db.ForeignKey('dietary_tags.id', ondelete='CASCADE'),
        primary_key=True,
    ),
)

dish_certifications = db.Table(
    'dish_certifications',
    db.Column(
        'dish_id',
        db.Integer,
        db.ForeignKey('dish_catalog.id', ondelete='CASCADE'),
        primary_key=True,
    ),
    db.Column(
        'certification_id',
        db.String(50),
        db.ForeignKey('certifications.id', ondelete='CASCADE'),
        primary_key=True,
    ),
)


# ──────────────────────────────────────────────────────────────────────
#  MODÈLES
# ──────────────────────────────────────────────────────────────────────

class DishCatalog(db.Model):
    """Entité plat réutilisable, liée à un restaurant et une catégorie."""

    __tablename__ = 'dish_catalog'

    id = db.Column(db.Integer, primary_key=True)
    restaurant_id = db.Column(
        db.Integer,
        db.ForeignKey('restaurants.id', ondelete='CASCADE'),
        nullable=False,
    )
    # Catégorie par défaut du plat (feuille : sous-catégorie ou catégorie sans enfant)
    # nullable : préservé si la catégorie est supprimée
    category_id = db.Column(
        db.Integer,
        db.ForeignKey('menu_categories.id', ondelete='SET NULL'),
        nullable=True,
    )
    name = db.Column(db.String(200), nullable=False)
    storage_key = db.Column(db.String(500), nullable=True)
    image_url = db.Column(db.String(500), nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    # Relations taxonomie
    tags = db.relationship(
        'DietaryTag',
        secondary=dish_dietary_tags,
        lazy='select',
        order_by='DietaryTag.sort_order',
    )
    certifications = db.relationship(
        'Certification',
        secondary=dish_certifications,
        lazy='select',
        order_by='Certification.sort_order',
    )

    __table_args__ = (
        db.Index('ix_dish_catalog_restaurant', 'restaurant_id'),
        db.Index('ix_dish_catalog_category', 'category_id'),
    )

    def to_dict(self, usage_count: int = 0) -> dict:
        return {
            'id': self.id,
            'restaurant_id': self.restaurant_id,
            'category_id': self.category_id,
            'name': self.name,
            'image_url': self.image_url,
            'usage_count': usage_count,
            'tags': [t.to_dict() for t in self.tags],
            'certifications': [c.to_dict() for c in self.certifications],
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self) -> str:
        return f'<DishCatalog {self.id} "{self.name}" (restaurant={self.restaurant_id})>'


class CategorySubstitution(db.Model):
    """Plat de substitution par menu et par catégorie — affiché quand un item est en rupture."""

    __tablename__ = 'category_substitutions'

    id = db.Column(db.Integer, primary_key=True)
    menu_id = db.Column(
        db.Integer,
        db.ForeignKey('menus.id', ondelete='CASCADE'),
        nullable=False,
    )
    category_id = db.Column(
        db.Integer,
        db.ForeignKey('menu_categories.id', ondelete='CASCADE'),
        nullable=False,
    )
    dish_id = db.Column(
        db.Integer,
        db.ForeignKey('dish_catalog.id', ondelete='CASCADE'),
        nullable=False,
    )
    order = db.Column(db.Integer, default=0)

    dish = db.relationship('DishCatalog', lazy='joined')

    __table_args__ = (
        db.UniqueConstraint('menu_id', 'category_id', 'dish_id', name='uq_menu_cat_sub_dish'),
        db.Index('ix_cat_sub_menu', 'menu_id'),
        db.Index('ix_cat_sub_cat', 'category_id'),
    )

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'menu_id': self.menu_id,
            'category_id': self.category_id,
            'dish': self.dish.to_dict() if self.dish else None,
            'order': self.order,
        }

    def __repr__(self) -> str:
        return f'<CategorySubstitution menu={self.menu_id} cat={self.category_id} dish={self.dish_id}>'
