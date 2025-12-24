"""
Modèle Restaurant - Représente un restaurant universitaire (RU).

Pensé dès le départ pour le multi-RU :
- Chaque restaurant a son propre code identifiant
- Les menus et événements sont liés à un restaurant
- Les utilisateurs peuvent être associés à un restaurant spécifique
- Configuration personnalisable (jours, catégories, tags)
"""
from datetime import datetime
from ..extensions import db


# Configuration par défaut des catégories de menu (icon = Lucide icon name)
DEFAULT_MENU_CATEGORIES = [
    {'id': 'entree', 'label': 'Entrée', 'icon': 'salad', 'order': 1},
    {'id': 'plat', 'label': 'Plat principal', 'icon': 'utensils', 'order': 2},
    {'id': 'vg', 'label': 'Option végétarienne', 'icon': 'leaf', 'order': 3},
    {'id': 'dessert', 'label': 'Dessert', 'icon': 'cake-slice', 'order': 4},
]

# Configuration par défaut des tags alimentaires (icon = Lucide icon name)
# Ces tags sont prédéfinis et l'utilisateur peut seulement les activer/désactiver
DEFAULT_DIETARY_TAGS = [
    {'id': 'vegetarian', 'label': 'Végétarien', 'icon': 'leaf', 'color': 'green'},
    {'id': 'halal', 'label': 'Halal', 'icon': 'badge-check', 'color': 'teal'},
    {'id': 'pork_free', 'label': 'Sans porc', 'icon': 'ban', 'color': 'orange'},
    {'id': 'gluten_free', 'label': 'Sans gluten', 'icon': 'wheat-off', 'color': 'amber'},
    {'id': 'lactose_free', 'label': 'Sans lactose', 'icon': 'milk-off', 'color': 'blue'},
]

# Configuration par défaut des certifications (icon = Lucide icon name)
# Ces certifications sont prédéfinies et l'utilisateur peut seulement les activer/désactiver
DEFAULT_CERTIFICATIONS = [
    {'id': 'bio', 'label': 'Bio', 'icon': 'sprout', 'color': 'green'},
    {'id': 'local', 'label': 'Local', 'icon': 'map-pin', 'color': 'blue'},
    {'id': 'french_meat', 'label': 'Viande française', 'icon': 'flag', 'color': 'indigo'},
    {'id': 'sustainable', 'label': 'Pêche durable', 'icon': 'fish', 'color': 'cyan'},
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
    
    # Configuration personnalisable (JSON)
    service_days = db.Column(db.JSON, nullable=True)  # [0,1,2,3,4] = Lun-Ven
    menu_categories = db.Column(db.JSON, nullable=True)
    dietary_tags = db.Column(db.JSON, nullable=True)
    certifications = db.Column(db.JSON, nullable=True)
    
    # Relations
    menus = db.relationship('Menu', backref='restaurant', lazy='dynamic', cascade='all, delete-orphan')
    events = db.relationship('Event', backref='restaurant', lazy='dynamic', cascade='all, delete-orphan')
    users = db.relationship('User', backref='restaurant', lazy='dynamic')
    
    def get_service_days(self):
        """Retourne les jours de service (avec défaut)."""
        return self.service_days if self.service_days is not None else DEFAULT_SERVICE_DAYS
    
    def get_menu_categories(self):
        """Retourne les catégories de menu (avec défaut)."""
        return self.menu_categories if self.menu_categories else DEFAULT_MENU_CATEGORIES
    
    def get_dietary_tags(self):
        """Retourne les tags alimentaires (avec défaut)."""
        return self.dietary_tags if self.dietary_tags else DEFAULT_DIETARY_TAGS
    
    def get_certifications(self):
        """Retourne les certifications (avec défaut)."""
        return self.certifications if self.certifications else DEFAULT_CERTIFICATIONS
    
    def get_config(self):
        """Retourne la configuration complète du restaurant."""
        return {
            'service_days': self.get_service_days(),
            'menu_categories': self.get_menu_categories(),
            'dietary_tags': self.get_dietary_tags(),
            'certifications': self.get_certifications(),
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
