"""Reference tables, seeded from data/taxonomy.py by migrations."""
from ..extensions import db

restaurant_dietary_tags = db.Table(
    'restaurant_dietary_tags',
    db.Column('restaurant_id', db.Integer, db.ForeignKey('restaurants.id', ondelete='CASCADE'), primary_key=True),
    db.Column('tag_id', db.String(50), db.ForeignKey('dietary_tags.id', ondelete='CASCADE'), primary_key=True),
)

restaurant_certifications = db.Table(
    'restaurant_certifications',
    db.Column('restaurant_id', db.Integer, db.ForeignKey('restaurants.id', ondelete='CASCADE'), primary_key=True),
    db.Column('certification_id', db.String(50), db.ForeignKey('certifications.id', ondelete='CASCADE'), primary_key=True),
)


class DietaryTagCategory(db.Model):
    __tablename__ = 'dietary_tag_categories'

    id = db.Column(db.String(50), primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    color = db.Column(db.String(30), nullable=True)
    sort_order = db.Column(db.Integer, default=0)

    tags = db.relationship('DietaryTag', backref='category', lazy='select',
                           order_by='DietaryTag.sort_order')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'color': self.color,
            'sort_order': self.sort_order,
            'tags': [t.to_dict() for t in self.tags],
        }


class CertificationCategory(db.Model):
    __tablename__ = 'certification_categories'

    id = db.Column(db.String(50), primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    sort_order = db.Column(db.Integer, default=0)

    certifications = db.relationship('Certification', backref='category', lazy='select',
                                     order_by='Certification.sort_order')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'sort_order': self.sort_order,
            'certifications': [c.to_dict() for c in self.certifications],
        }


class DietaryTag(db.Model):
    """Declared by the kitchen, unlike a certification."""

    __tablename__ = 'dietary_tags'

    id = db.Column(db.String(50), primary_key=True)           # ex: "vegetarian"
    label = db.Column(db.String(100), nullable=False)         # "Végétarien"
    icon = db.Column(db.String(50), nullable=False)           # lucide icon name
    color = db.Column(db.String(30), nullable=False)
    category_id = db.Column(db.String(50), db.ForeignKey('dietary_tag_categories.id'), nullable=False)
    sort_order = db.Column(db.Integer, default=0)

    keywords = db.relationship('DietaryTagKeyword', backref='tag', lazy='select',
                               cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'label': self.label,
            'icon': self.icon,
            'color': self.color,
            'category_id': self.category_id,
            'sort_order': self.sort_order,
        }


class DietaryTagKeyword(db.Model):
    """Suggests the tag for a dish whose name contains it."""

    __tablename__ = 'dietary_tag_keywords'

    id = db.Column(db.Integer, primary_key=True)
    tag_id = db.Column(db.String(50), db.ForeignKey('dietary_tags.id', ondelete='CASCADE'), nullable=False)
    keyword = db.Column(db.String(100), nullable=False)

    __table_args__ = (
        db.UniqueConstraint('tag_id', 'keyword', name='uq_tag_keyword'),
    )


class Certification(db.Model):
    """A label that takes proof, unlike a tag."""

    __tablename__ = 'certifications'

    id = db.Column(db.String(50), primary_key=True)           # ex: "ab"
    name = db.Column(db.String(100), nullable=False)          # short: "AB"
    official_name = db.Column(db.String(200), nullable=False) # "Agriculture Biologique"
    issuer = db.Column(db.String(200), nullable=False)
    scheme_type = db.Column(db.String(20), nullable=False)    # "public" | "private"
    jurisdiction = db.Column(db.String(30), nullable=False)   # "france" | "eu" | "international"
    guarantee = db.Column(db.String(300), nullable=True)
    logo_filename = db.Column(db.String(100), nullable=False) # "ab.svg"
    category_id = db.Column(db.String(50), db.ForeignKey('certification_categories.id'), nullable=False)
    sort_order = db.Column(db.Integer, default=0)

    keywords = db.relationship('CertificationKeyword', backref='certification', lazy='select',
                               cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'official_name': self.official_name,
            'issuer': self.issuer,
            'scheme_type': self.scheme_type,
            'jurisdiction': self.jurisdiction,
            'guarantee': self.guarantee,
            'logo_filename': self.logo_filename,
            'category_id': self.category_id,
            'sort_order': self.sort_order,
        }


class CertificationKeyword(db.Model):
    """Suggests the certification for a dish whose name contains it."""

    __tablename__ = 'certification_keywords'

    id = db.Column(db.Integer, primary_key=True)
    certification_id = db.Column(db.String(50), db.ForeignKey('certifications.id', ondelete='CASCADE'), nullable=False)
    keyword = db.Column(db.String(100), nullable=False)

    __table_args__ = (
        db.UniqueConstraint('certification_id', 'keyword', name='uq_cert_keyword'),
    )
