from datetime import UTC, datetime

from ..data.taxonomy import DEFAULT_ENABLED_CERT_IDS, DEFAULT_ENABLED_TAG_IDS
from ..extensions import db
from ..services.menu_window import DAYS_AHEAD, DAYS_BACK
from ..utils.time import utc_now_naive
from .taxonomy import (
    Certification,
    DietaryTag,
    restaurant_certifications,
    restaurant_dietary_tags,
)

DEFAULT_SERVICE_DAYS = [0, 1, 2, 3, 4]


class Restaurant(db.Model):
    __tablename__ = 'restaurants'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    code = db.Column(db.String(20), unique=True, nullable=False)
    logo_url = db.Column(db.String(500), nullable=True)
    logo_storage_key = db.Column(db.String(500), nullable=True)
    cover_url = db.Column(db.String(500), nullable=True)
    cover_storage_key = db.Column(db.String(500), nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=utc_now_naive)

    organization_id = db.Column(
        db.Integer, db.ForeignKey('organizations.id'), nullable=False, index=True
    )
    # URL-safe slug, unique within an organization; carries the public path
    slug = db.Column(db.String(63), nullable=False, index=True)

    __table_args__ = (
        db.UniqueConstraint('organization_id', 'slug', name='uq_restaurant_org_slug'),
    )

    # As the Base Adresse Nationale returns it.
    address_label = db.Column(db.String(300), nullable=True)
    address_lat = db.Column(db.Float, nullable=True)
    address_lon = db.Column(db.Float, nullable=True)
    address_city = db.Column(db.String(100), nullable=True)
    address_postcode = db.Column(db.String(10), nullable=True)

    tagline = db.Column(db.String(160), nullable=True)
    description = db.Column(db.String(800), nullable=True)
    access_info = db.Column(db.String(300), nullable=True)
    quality_commitments = db.Column(db.String(600), nullable=True)
    # Among data/site_profile.SERVICES, in its order.
    services = db.Column(db.JSON, nullable=True)
    # [{kind, url, label}], label set for a website only.
    links = db.Column(db.JSON, nullable=True)

    menu_days_ahead = db.Column(
        db.Integer, nullable=False, default=DAYS_AHEAD, server_default=str(DAYS_AHEAD)
    )
    menu_days_back = db.Column(
        db.Integer, nullable=False, default=DAYS_BACK, server_default=str(DAYS_BACK)
    )

    email = db.Column(db.String(150), nullable=True)
    phone = db.Column(db.String(30), nullable=True)

    # Seats, no longer read: kept so the previous release still runs on this schema.
    capacity = db.Column(db.Integer, nullable=True)
    # Meals per service.
    service_capacity = db.Column(db.Integer, nullable=True)

    # Among izly, cb, cash and ticket_restaurant.
    payment_methods = db.Column(db.JSON, nullable=True)

    # None when unknown.
    pmr_access = db.Column(db.Boolean, nullable=True)

    service_days = db.Column(db.JSON, nullable=True)  # Weekday numbers, 0 being Monday

    vote_enabled = db.Column(db.Boolean, nullable=False, default=True, server_default='true')
    # Categories whose dishes a vote may be attached to. NULL keeps the default
    # resolution in services/votes.py rather than freezing today's category ids.
    vote_category_ids = db.Column(db.JSON, nullable=True)
    vote_icon_preset = db.Column(
        db.String(20), nullable=False, default='thumbs', server_default='thumbs'
    )
    tags_customized = db.Column(db.Boolean, default=False, server_default='false')
    
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
        return self.service_days if self.service_days is not None else DEFAULT_SERVICE_DAYS
    
    def get_menu_categories_list(self):
        return self.menu_categories.filter_by(parent_id=None).order_by('order').all()

    def get_config(self):
        """Until the site customises them, its tags and certifications are the defaults of
        data/taxonomy.py.
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
            'vote_enabled': self.vote_enabled,
            'vote_icon_preset': self.vote_icon_preset,
            'menu_categories': [c.to_dict() for c in categories],
            'dietary_tags': [t.to_dict() for t in tags],
            'certifications': [c.to_dict() for c in certs],
        }
    
    def get_votable_category_ids(self):
        """Categories a vote may name a dish from, preset included.

        Costs a query, so it stays out of get_config(): the public pages
        serialise that on every menu view and never use it.
        """
        from ..services.votes import votable_categories  # deferred: services import models
        return [category.id for category in votable_categories(self)]

    def get_service_hours_dict(self):
        return {
            str(h.day_of_week): {'open': h.open_time, 'close': h.close_time}
            for h in self.service_hours
        }

    def to_dict(self, include_config=False):
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
            'payment_methods': self.payment_methods,
            'pmr_access': self.pmr_access,
            'service_hours': self.get_service_hours_dict(),
        }
        if include_config:
            data['config'] = self.get_config()
        return data
    
    def __repr__(self):
        return f'<Restaurant {self.code}: {self.name}>'


class RestaurantPhoto(db.Model):
    __tablename__ = 'restaurant_photos'

    id = db.Column(db.Integer, primary_key=True)
    restaurant_id = db.Column(
        db.Integer, db.ForeignKey('restaurants.id', ondelete='CASCADE'), nullable=False, index=True
    )
    storage_key = db.Column(db.String(500), nullable=False)
    url = db.Column(db.String(500), nullable=False)
    alt = db.Column(db.String(150), nullable=False)
    order = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(UTC))


class RestaurantServiceHours(db.Model):
    __tablename__ = 'restaurant_service_hours'
    __table_args__ = (
        db.UniqueConstraint('restaurant_id', 'day_of_week', name='uq_restaurant_service_hour_day'),
    )

    id = db.Column(db.Integer, primary_key=True)
    restaurant_id = db.Column(db.Integer, db.ForeignKey('restaurants.id', ondelete='CASCADE'), nullable=False)
    day_of_week = db.Column(db.Integer, nullable=False)  # 0 is Monday
    open_time = db.Column(db.String(5), nullable=False)  # "HH:MM"
    close_time = db.Column(db.String(5), nullable=False)  # "HH:MM"

    def __repr__(self):
        return f'<ServiceHours restaurant={self.restaurant_id} day={self.day_of_week} {self.open_time}-{self.close_time}>'
