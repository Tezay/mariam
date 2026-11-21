from datetime import UTC, datetime

from ..extensions import db


class SiteMembership(db.Model):
    __tablename__ = 'site_memberships'
    __table_args__ = (
        db.UniqueConstraint('restaurant_id', 'user_id', name='uq_site_membership'),
        db.CheckConstraint("role IN ('admin', 'editor')", name='ck_site_membership_role'),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True
    )
    restaurant_id = db.Column(
        db.Integer, db.ForeignKey('restaurants.id', ondelete='CASCADE'), nullable=False
    )
    role = db.Column(db.String(20), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(UTC))

    restaurant = db.relationship('Restaurant')


class OrgSupervision(db.Model):
    """An account that reads every site of an organization and manages its supervisors."""

    __tablename__ = 'org_supervisions'
    __table_args__ = (
        db.UniqueConstraint('organization_id', 'user_id', name='uq_org_supervision'),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True
    )
    organization_id = db.Column(
        db.Integer, db.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False
    )
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(UTC))

    organization = db.relationship('Organization')
