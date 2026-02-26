"""
Modèle Restaurant - Représente un restaurant universitaire (RU).

Pensé dès le départ pour le multi-RU :
- Chaque restaurant a son propre code identifiant
- Les menus et événements sont liés à un restaurant
- Les utilisateurs peuvent être associés à un restaurant spécifique
- Configuration personnalisable (jours, catégories, tags/certifications)
"""
from datetime import datetime
from ..extensions import db
from ..data.taxonomy import DEFAULT_ENABLED_TAG_IDS, DEFAULT_ENABLED_CERT_IDS
from .taxonomy import (
    restaurant_dietary_tags,
    restaurant_certifications,
    DietaryTag,
    Certification,
)


# Configuration par défaut des catégories de menu (icon = Lucide icon name)
DEFAULT_MENU_CATEGORIES = [
    {'id': 'entree', 'label': 'Entrée', 'icon': 'salad', 'order': 1},
    {'id': 'plat', 'label': 'Plat principal', 'icon': 'utensils', 'order': 2},
    {'id': 'vg', 'label': 'Option végétarienne', 'icon': 'leaf', 'order': 3},
    {'id': 'dessert', 'label': 'Dessert', 'icon': 'cake-slice', 'order': 4},
]

# Jours de service par défaut (0=Lundi, 4=Vendredi)
DEFAULT_SERVICE_DAYS = [0, 1, 2, 3, 4]


class Restaurant(db.Model):
    """Entité Restaurant universitaire."""
    
    __tablename__ = 'restaurants'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    code = db.Column(db.String(20), unique=True, nullable=False)  # ex: "RU_CENTRALE"
    address = db.Column(db.String(200), nullable=True)
    logo_url = db.Column(db.String(500), nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Configuration personnalisable (JSON) — seules les colonnes non-normalisées
    service_days = db.Column(db.JSON, nullable=True)  # [0,1,2,3,4] = Lun-Ven
    menu_categories = db.Column(db.JSON, nullable=True)
    tags_customized = db.Column(db.Boolean, default=False, server_default='false')
    
    # Relations N:N normalisées (tags & certifications activés pour ce restaurant)
    enabled_tags = db.relationship(
        'DietaryTag',
        secondary=restaurant_dietary_tags,
        lazy='select',
        order_by='DietaryTag.sort_order',
        backref=db.backref('restaurants', lazy='select'),
    )
    enabled_certifications = db.relationship(
        'Certification',
        secondary=restaurant_certifications,
        lazy='select',
        order_by='Certification.sort_order',
        backref=db.backref('restaurants', lazy='select'),
    )
    
    # Relations existantes
    menus = db.relationship('Menu', backref='restaurant', lazy='dynamic', cascade='all, delete-orphan')
    events = db.relationship('Event', backref='restaurant', lazy='dynamic', cascade='all, delete-orphan')
    users = db.relationship('User', backref='restaurant', lazy='dynamic')
    
    def get_service_days(self):
        """Retourne les jours de service (avec défaut)."""
        return self.service_days if self.service_days is not None else DEFAULT_SERVICE_DAYS
    
    def get_menu_categories(self):
        """Retourne les catégories de menu (avec défaut)."""
        return self.menu_categories if self.menu_categories else DEFAULT_MENU_CATEGORIES
    
    def get_config(self):
        """Retourne la configuration complète du restaurant.
        
        Si aucun tag/certif n'a été explicitement configuré (tags_customized=False),
        on renvoie les défauts définis dans taxonomy.py
        """
        if self.tags_customized:
            tags = list(self.enabled_tags)
            certs = list(self.enabled_certifications)
        else:
            tags = DietaryTag.query.filter(
                DietaryTag.id.in_(DEFAULT_ENABLED_TAG_IDS)
            ).order_by(DietaryTag.sort_order).all()
            certs = Certification.query.filter(
                Certification.id.in_(DEFAULT_ENABLED_CERT_IDS)
            ).order_by(Certification.sort_order).all()

        return {
            'service_days': self.get_service_days(),
            'menu_categories': self.get_menu_categories(),
            'dietary_tags': [t.to_dict() for t in tags],
            'certifications': [c.to_dict() for c in certs],
        }
    
    def to_dict(self, include_config=False):
        """Sérialise le restaurant en dictionnaire JSON."""
        data = {
            'id': self.id,
            'name': self.name,
            'code': self.code,
            'address': self.address,
            'logo_url': self.logo_url,
            'is_active': self.is_active
        }
        if include_config:
            data['config'] = self.get_config()
        return data
    
    def __repr__(self):
        return f'<Restaurant {self.code}: {self.name}>'
