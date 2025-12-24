"""
Modèle AuditLog - Journal des actions sensibles.

Enregistre les actions critiques pour la sécurité et la traçabilité :
- Connexions/déconnexions
- Publications de menus
- Gestion des utilisateurs
- Modifications de configuration
"""
from datetime import datetime
import json
from ..extensions import db


class AuditLog(db.Model):
    """Journal d'audit des actions sensibles."""
    
    __tablename__ = 'audit_logs'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    action = db.Column(db.String(50), nullable=False, index=True)
    target_type = db.Column(db.String(50), nullable=True)  # user, menu, event, etc.
    target_id = db.Column(db.Integer, nullable=True)
    details = db.Column(db.Text, nullable=True)  # JSON
    ip_address = db.Column(db.String(45), nullable=True)  # IPv4 ou IPv6
    user_agent = db.Column(db.String(500), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    
    # Relation
    user = db.relationship('User', backref='audit_logs', foreign_keys=[user_id])
    
    # Actions prédéfinies
    ACTION_LOGIN = 'login'
    ACTION_LOGIN_FAILED = 'login_failed'
    ACTION_LOGOUT = 'logout'
    ACTION_MFA_SETUP = 'mfa_setup'
    ACTION_USER_CREATE = 'user_create'
    ACTION_USER_UPDATE = 'user_update'
    ACTION_USER_DELETE = 'user_delete'
    ACTION_MENU_CREATE = 'menu_create'
    ACTION_MENU_UPDATE = 'menu_update'
    ACTION_MENU_PUBLISH = 'menu_publish'
    ACTION_EVENT_CREATE = 'event_create'
    ACTION_EVENT_UPDATE = 'event_update'
    ACTION_EVENT_DELETE = 'event_delete'
    ACTION_ACTIVATION_LINK_CREATE = 'activation_link_create'
    ACTION_ACCOUNT_ACTIVATE = 'account_activate'
    ACTION_AUDIT_LOGS_ACCESS = 'audit_logs_access'
    ACTION_AUDIT_LOGS_EXPORT = 'audit_logs_export'
    
    @classmethod
    def log(cls, action, user_id=None, target_type=None, target_id=None, 
            details=None, ip_address=None, user_agent=None):
        """Crée une nouvelle entrée de journal."""
        log_entry = cls(
            user_id=user_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            details=json.dumps(details) if details else None,
            ip_address=ip_address,
            user_agent=user_agent
        )
        db.session.add(log_entry)
        # Note: Le commit est fait par l'appelant pour grouper les transactions
        return log_entry
    
    def get_details(self):
        """Parse les détails JSON."""
        if self.details:
            try:
                return json.loads(self.details)
            except json.JSONDecodeError:
                return None
        return None
    
    def to_dict(self):
        """Sérialise l'entrée de journal en dictionnaire JSON."""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'user_email': self.user.email if self.user else None,
            'action': self.action,
            'target_type': self.target_type,
            'target_id': self.target_id,
            'details': self.get_details(),
            'ip_address': self.ip_address,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
    
    def __repr__(self):
        return f'<AuditLog {self.action} by user {self.user_id}>'
