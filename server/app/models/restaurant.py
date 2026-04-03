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


# Jours de service par défaut (0=Lundi, 4=Vendredi)
DEFAULT_SERVICE_DAYS = [0, 1, 2, 3, 4]


class Restaurant(db.Model):
    """Entité Restaurant universitaire."""
    
    __tablename__ = 'restaurants'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    code = db.Column(db.String(20), unique=True, nullable=False)
    logo_url = db.Column(db.String(500), nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Adresse vérifiée (Base Adresse Nationale — IGN Géoplateforme)
    address_label = db.Column(db.String(300), nullable=True)
    address_lat = db.Column(db.Float, nullable=True)
    address_lon = db.Column(db.Float, nullable=True)

    # Contact
    email = db.Column(db.String(150), nullable=True)
    phone = db.Column(db.String(30), nullable=True)

    # Capacité d'accueil (nombre de couverts)
    capacity = db.Column(db.Integer, nullable=True)

    # Méthodes de paiement acceptées — liste de clés parmi : izly, cb, cash, ticket_restaurant
    payment_methods = db.Column(db.JSON, nullable=True)

    # Accessibilité PMR : None = non renseigné, True = accessible, False = non accessible
    pmr_access = db.Column(db.Boolean, nullable=True)

    # Jours de service et personnalisation des tags
    service_days = db.Column(db.JSON, nullable=True)  # [0,1,2,3,4] = Lun-Ven
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
    
    # Relations
    service_hours = db.relationship(
        'RestaurantServiceHours',
        backref='restaurant',
        lazy='select',
        cascade='all, delete-orphan',
        order_by='RestaurantServiceHours.day_of_week',
    )
    menus = db.relationship('Menu', backref='restaurant', lazy='dynamic', cascade='all, delete-orphan')
    events = db.relationship('Event', backref='restaurant', lazy='dynamic', cascade='all, delete-orphan')
    users = db.relationship('User', backref='restaurant', lazy='dynamic')
    menu_categories = db.relationship(
        'MenuCategory',
        backref='restaurant',
        lazy='dynamic',
        cascade='all, delete-orphan',
        foreign_keys='MenuCategory.restaurant_id',
        order_by='MenuCategory.order',
    )
    
    def get_service_days(self):
        """Retourne les jours de service (avec défaut)."""
        return self.service_days if self.service_days is not None else DEFAULT_SERVICE_DAYS
    
    def get_menu_categories_list(self):
        """Retourne les catégories principales (sans sous-catégories) triées."""
        return self.menu_categories.filter_by(parent_id=None).order_by('order').all()

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

        categories = self.get_menu_categories_list()
        return {
            'service_days': self.get_service_days(),
            'service_hours': self.get_service_hours_dict(),
            'menu_categories': [c.to_dict() for c in categories],
            'dietary_tags': [t.to_dict() for t in tags],
            'certifications': [c.to_dict() for c in certs],
        }
    
    def get_service_hours_dict(self):
        """Retourne les horaires de service sous forme de dict {day: {open, close}}."""
        return {
            str(h.day_of_week): {'open': h.open_time, 'close': h.close_time}
            for h in self.service_hours
        }

    def to_dict(self, include_config=False):
        """Sérialise le restaurant en dictionnaire JSON."""
        data = {
            'id': self.id,
            'name': self.name,
            'code': self.code,
            'logo_url': self.logo_url,
            'is_active': self.is_active,
            'address_label': self.address_label,
            'address_lat': self.address_lat,
            'address_lon': self.address_lon,
            'email': self.email,
            'phone': self.phone,
            'capacity': self.capacity,
            'payment_methods': self.payment_methods,
            'pmr_access': self.pmr_access,
            'service_hours': self.get_service_hours_dict(),
        }
        if include_config:
            data['config'] = self.get_config()
        return data
    
    def __repr__(self):
        return f'<Restaurant {self.code}: {self.name}>'


class RestaurantServiceHours(db.Model):
    """Horaires de service pour un jour donné de la semaine."""

    __tablename__ = 'restaurant_service_hours'
    __table_args__ = (
        db.UniqueConstraint('restaurant_id', 'day_of_week', name='uq_restaurant_service_hour_day'),
    )

    id = db.Column(db.Integer, primary_key=True)
    restaurant_id = db.Column(db.Integer, db.ForeignKey('restaurants.id', ondelete='CASCADE'), nullable=False)
    day_of_week = db.Column(db.Integer, nullable=False)  # 0=Lundi … 6=Dimanche
    open_time = db.Column(db.String(5), nullable=False)  # "HH:MM"
    close_time = db.Column(db.String(5), nullable=False)  # "HH:MM"

    def __repr__(self):
        return f'<ServiceHours restaurant={self.restaurant_id} day={self.day_of_week} {self.open_time}-{self.close_time}>'
