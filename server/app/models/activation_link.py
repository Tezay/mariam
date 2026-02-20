"""
Modèle ActivationLink - Liens d'activation à usage unique.

Utilisé pour :
- Créer le premier compte administrateur lors de l'installation
- Inviter de nouveaux utilisateurs
- Réinitialiser les accès en cas de problème
"""
from datetime import datetime, timedelta
import secrets
from ..extensions import db


class ActivationLink(db.Model):
    """Lien d'activation à usage unique et durée limitée."""
    
    __tablename__ = 'activation_links'
    
    id = db.Column(db.Integer, primary_key=True)
    token = db.Column(db.String(128), unique=True, nullable=False, index=True)
    email = db.Column(db.String(120), nullable=True)  # Pré-rempli pour les invitations
    link_type = db.Column(db.String(20), nullable=False)  # first_admin, invite, password_reset
    role = db.Column(db.String(20), default='editor')  # Rôle attribué à l'activation
    expires_at = db.Column(db.DateTime, nullable=False)
    used_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    
    # Relation
    created_by = db.relationship('User', backref='created_activation_links', foreign_keys=[created_by_id])
    
    # Types de lien valides
    VALID_TYPES = ['first_admin', 'invite', 'password_reset']
    
    @classmethod
    def generate_token(cls):
        """Génère un token sécurisé unique."""
        return secrets.token_urlsafe(64)
    
    @classmethod
    def create_first_admin_link(cls, expires_hours=72):
        """Crée un lien d'activation pour le premier administrateur."""
        return cls(
            token=cls.generate_token(),
            link_type='first_admin',
            role='admin',
            expires_at=datetime.utcnow() + timedelta(hours=expires_hours)
        )
    
    @classmethod
    def create_invite_link(cls, email, role='editor', created_by_id=None, expires_hours=72):
        """Crée un lien d'invitation pour un nouvel utilisateur."""
        return cls(
            token=cls.generate_token(),
            email=email,
            link_type='invite',
            role=role,
            expires_at=datetime.utcnow() + timedelta(hours=expires_hours),
            created_by_id=created_by_id
        )
    
    def is_valid(self):
        """Vérifie si le lien est encore valide (non expiré et non utilisé)."""
        return self.used_at is None and datetime.utcnow() < self.expires_at
    
    def mark_as_used(self):
        """Marque le lien comme utilisé."""
        self.used_at = datetime.utcnow()
    
    def to_dict(self, include_token=False):
        """Sérialise le lien en dictionnaire JSON."""
        data = {
            'id': self.id,
            'email': self.email,
            'link_type': self.link_type,
            'role': self.role,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'is_used': self.used_at is not None,
            'is_valid': self.is_valid(),
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
        if include_token:
            data['token'] = self.token
        return data
    
    def __repr__(self):
        status = 'used' if self.used_at else ('expired' if not self.is_valid() else 'active')
        return f'<ActivationLink {self.link_type} - {status}>'
