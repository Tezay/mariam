import secrets
from datetime import timedelta

from sqlalchemy.orm import validates

from ..extensions import db
from ..utils.email_address import canonical_email
from ..utils.time import utc_now_naive


class ActivationLink(db.Model):
    __tablename__ = 'activation_links'
    
    id = db.Column(db.Integer, primary_key=True)
    token = db.Column(db.String(128), unique=True, nullable=False, index=True)
    # An invitation's address is a suggestion; a reset link's names the account.
    email = db.Column(db.String(120), nullable=True)
    link_type = db.Column(db.String(20), nullable=False)  # first_admin, invite, password_reset
    role = db.Column(db.String(20), default='editor')
    expires_at = db.Column(db.DateTime, nullable=False)
    used_at = db.Column(db.DateTime, nullable=True)
    # Naive UTC like its neighbours, which is_valid() compares it with.
    revoked_at = db.Column(db.DateTime, nullable=True)
    emailed = db.Column(db.Boolean, nullable=False, default=False, server_default='false')
    created_at = db.Column(db.DateTime, default=utc_now_naive)
    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

    restaurant_id = db.Column(db.Integer, db.ForeignKey('restaurants.id'), nullable=True)
    organization_id = db.Column(db.Integer, db.ForeignKey('organizations.id'), nullable=True)
    
    created_by = db.relationship('User', backref='created_activation_links', foreign_keys=[created_by_id])
    
    ACCOUNT_CREATION_TYPES = ('first_admin', 'invite')

    @validates('email')
    def _canonical_email(self, _key, value):
        return canonical_email(value) if value else None

    @classmethod
    def pending_filter(cls):
        return db.and_(
            cls.used_at.is_(None),
            cls.revoked_at.is_(None),
            cls.expires_at > utc_now_naive(),
        )

    @classmethod
    def generate_token(cls):
        return secrets.token_urlsafe(64)
    
    @classmethod
    def create_first_admin_link(cls, expires_hours=72):
        return cls(
            token=cls.generate_token(),
            link_type='first_admin',
            role='admin',
            expires_at=utc_now_naive() + timedelta(hours=expires_hours)
        )
    
    @classmethod
    def create_invite_link(cls, email=None, role='editor', created_by_id=None,
                           expires_hours=72, restaurant_id=None, organization_id=None):
        return cls(
            token=cls.generate_token(),
            email=email,
            link_type='invite',
            role=role,
            expires_at=utc_now_naive() + timedelta(hours=expires_hours),
            created_by_id=created_by_id,
            restaurant_id=restaurant_id,
            organization_id=organization_id,
        )

    @classmethod
    def create_password_reset_link(cls, email, created_by_id=None, expires_hours=72):
        """Also spends the unused reset links of the same address."""
        old_links = cls.query.filter_by(
            email=email,
            link_type='password_reset',
            used_at=None
        ).all()
        for old in old_links:
            old.mark_as_used()

        return cls(
            token=cls.generate_token(),
            email=email,
            link_type='password_reset',
            role=None,
            expires_at=utc_now_naive() + timedelta(hours=expires_hours),
            created_by_id=created_by_id
        )
    
    def is_valid(self):
        return (
            self.used_at is None
            and self.revoked_at is None
            and utc_now_naive() < self.expires_at
        )

    def mark_as_used(self):
        self.used_at = utc_now_naive()

    def revoke(self):
        self.revoked_at = utc_now_naive()

    def __repr__(self):
        status = 'used' if self.used_at else ('expired' if not self.is_valid() else 'active')
        return f'<ActivationLink {self.link_type} - {status}>'
