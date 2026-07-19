"""
Organization model.

An organization groups one or more restaurants (sites). It owns the public
subdomain (`slug`) and acts as the top-level isolation boundary: an `org_admin`
(director) administers every restaurant of its organization, while an
admin/editor is confined to a single restaurant.

Hierarchy: Organization -> Restaurant -> (Menu, Event, User, ...).
"""
from datetime import datetime

from ..extensions import db

# Slugs that cannot be assigned to an organization (technical / marketing
# subdomains of mariam.app).
RESERVED_ORG_SLUGS = frozenset({
    'www', 'app', 'api', 'admin', 'demo', 'staging', 'mail', 'blog',
    'status', 'docs', 'cdn', 'assets', 'static', 'help', 'support',
})


class Organization(db.Model):
    """Client organization grouping one or more restaurants (sites)."""

    __tablename__ = 'organizations'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    slug = db.Column(db.String(63), unique=True, nullable=False, index=True)
    is_active = db.Column(db.Boolean, default=True, nullable=False, server_default='true')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    restaurants = db.relationship(
        'Restaurant',
        backref='organization',
        lazy='dynamic',
        foreign_keys='Restaurant.organization_id',
    )

    def to_dict(self, include_restaurants=False):
        """Serialize the organization to a JSON-ready dict."""
        data = {
            'id': self.id,
            'name': self.name,
            'slug': self.slug,
            'is_active': self.is_active,
        }
        if include_restaurants:
            data['restaurants'] = [r.to_dict() for r in self.restaurants]
        return data

    def __repr__(self):
        return f'<Organization {self.slug}: {self.name}>'
