"""
Modèle User - Utilisateur de MARIAM avec authentification sécurisée.

Différences par rapport à un modèle User classique :
- Support des rôles (admin, editor, reader)
- Authentification MFA/TOTP obligatoire
- Association possible à un restaurant (multi-RU ready)
- Validation de mot de passe fort
"""
from datetime import datetime
import re
from werkzeug.security import generate_password_hash, check_password_hash
from ..extensions import db


class User(db.Model):
    """Utilisateur de MARIAM avec authentification sécurisée."""
    
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(256), nullable=False)
    username = db.Column(db.String(80), nullable=True)
    
    # Rôles : admin, editor, reader
    role = db.Column(db.String(20), nullable=False, default='reader')
    
    # MFA/TOTP
    mfa_secret = db.Column(db.String(32), nullable=True)
    mfa_enabled = db.Column(db.Boolean, default=False)
    
    # Statut du compte
    is_active = db.Column(db.Boolean, default=True)
    is_rescue_account = db.Column(db.Boolean, default=False)
    
    # Multi-RU : association optionnelle à un restaurant
    restaurant_id = db.Column(db.Integer, db.ForeignKey('restaurants.id'), nullable=True)
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login = db.Column(db.DateTime, nullable=True)
    
    # Rôles valides
    ROLE_ADMIN = 'admin'
    ROLE_EDITOR = 'editor'
    ROLE_READER = 'reader'
    VALID_ROLES = [ROLE_ADMIN, ROLE_EDITOR, ROLE_READER]
    
    def set_password(self, password):
        """
        Hash et stocke le mot de passe.
        Lève une exception si le mot de passe n'est pas assez fort.
        """
        if not self.validate_password_strength(password):
            raise ValueError(
                "Le mot de passe doit contenir au moins 12 caractères, "
                "une majuscule, une minuscule, un chiffre et un caractère spécial."
            )
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        """Vérifie si le mot de passe correspond au hash stocké."""
        return check_password_hash(self.password_hash, password)
    
    @staticmethod
    def validate_password_strength(password):
        """
        Valide la force du mot de passe.
        Critères :
        - Au moins 12 caractères
        - Au moins une majuscule
        - Au moins une minuscule
        - Au moins un chiffre
        - Au moins un caractère spécial
        """
        if len(password) < 12:
            return False
        if not re.search(r'[A-Z]', password):
            return False
        if not re.search(r'[a-z]', password):
            return False
        if not re.search(r'\d', password):
            return False
        if not re.search(r'[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\;\'`~]', password):
            return False
        return True
    
    def set_mfa_secret(self, secret):
        """Stocke le secret TOTP pour MFA."""
        self.mfa_secret = secret
        self.mfa_enabled = True
    
    def disable_mfa(self):
        """Désactive le MFA (admin only, pour reset)."""
        self.mfa_secret = None
        self.mfa_enabled = False
    
    def is_admin(self):
        """Vérifie si l'utilisateur est administrateur."""
        return self.role == self.ROLE_ADMIN
    
    def is_editor(self):
        """Vérifie si l'utilisateur peut éditer (admin ou editor)."""
        return self.role in [self.ROLE_ADMIN, self.ROLE_EDITOR]
    
    def can_manage_users(self):
        """Vérifie si l'utilisateur peut gérer les autres utilisateurs."""
        return self.role == self.ROLE_ADMIN
    
    def update_last_login(self):
        """Met à jour la date de dernière connexion."""
        self.last_login = datetime.utcnow()
    
    def to_dict(self, include_sensitive=False):
        """
        Sérialise l'utilisateur en dictionnaire JSON.
        N'inclut jamais le password_hash ni le mfa_secret.
        """
        data = {
            'id': self.id,
            'email': self.email,
            'username': self.username,
            'role': self.role,
            'mfa_enabled': self.mfa_enabled,
            'is_active': self.is_active,
            'restaurant_id': self.restaurant_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'last_login': self.last_login.isoformat() if self.last_login else None
        }
        
        if include_sensitive:
            data['is_rescue_account'] = self.is_rescue_account
        
        return data
    
    def __repr__(self):
        return f'<User {self.email} ({self.role})>'
