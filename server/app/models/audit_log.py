import json

from ..extensions import db
from ..utils.time import utc_now_naive


class AuditLog(db.Model):
    __tablename__ = 'audit_logs'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    restaurant_id = db.Column(
        db.Integer, db.ForeignKey('restaurants.id'), nullable=True, index=True
    )
    action = db.Column(db.String(50), nullable=False, index=True)
    target_type = db.Column(db.String(50), nullable=True)  # user, menu, event, etc.
    target_id = db.Column(db.Integer, nullable=True)
    details = db.Column(db.Text, nullable=True)  # JSON
    ip_address = db.Column(db.String(45), nullable=True)  # IPv4 or IPv6
    user_agent = db.Column(db.String(500), nullable=True)
    created_at = db.Column(db.DateTime, default=utc_now_naive, index=True)
    
    user = db.relationship('User', backref='audit_logs', foreign_keys=[user_id])
    
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
    ACTION_ACTIVATION_LINK_REVOKE = 'activation_link_revoke'
    ACTION_ACCOUNT_ACTIVATE = 'account_activate'
    ACTION_AUDIT_LOGS_ACCESS = 'audit_logs_access'
    ACTION_AUDIT_LOGS_EXPORT = 'audit_logs_export'
    ACTION_PASSWORD_CHANGE = 'password_change'
    ACTION_EMAIL_CHANGE = 'email_change'
    ACTION_PASSWORD_RESET_REQUEST = 'password_reset_request'
    ACTION_PASSWORD_RESET = 'password_reset'
    ACTION_MFA_DISABLED = 'mfa_disabled'
    ACTION_PASSKEY_REGISTERED = 'passkey_registered'
    ACTION_PASSKEY_SETUP = 'passkey_setup'
    ACTION_PASSKEY_RENAMED = 'passkey_renamed'
    ACTION_PASSKEY_DELETED = 'passkey_deleted'
    ACTION_CLOSURE_CREATE = 'closure_create'
    ACTION_CLOSURE_UPDATE = 'closure_update'
    ACTION_CLOSURE_DELETE = 'closure_delete'
    ACTION_DISH_CREATE = 'dish_create'
    ACTION_DISH_UPDATE = 'dish_update'
    ACTION_DISH_DELETE = 'dish_delete'
    ACTION_DISH_IMAGE_UPLOAD = 'dish_image_upload'
    ACTION_DISH_IMAGE_DELETE = 'dish_image_delete'
    ACTION_MENU_IMAGE_UPLOAD = 'menu_image_upload'
    ACTION_MENU_IMAGE_DELETE = 'menu_image_delete'
    ACTION_EVENT_IMAGE_UPLOAD = 'event_image_upload'
    ACTION_EVENT_IMAGE_DELETE = 'event_image_delete'
    ACTION_CALENDAR_SETTINGS_UPDATE = 'calendar_settings_update'

    @classmethod
    def log(cls, action, user_id=None, target_type=None, target_id=None,
            details=None, ip_address=None, user_agent=None, restaurant_id=None):
        """Added to the session; the caller commits it with the change it records."""
        log_entry = cls(
            user_id=user_id,
            restaurant_id=restaurant_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            details=json.dumps(details) if details else None,
            ip_address=ip_address,
            user_agent=user_agent
        )
        db.session.add(log_entry)
        return log_entry
    
    def get_details(self):
        if self.details:
            try:
                return json.loads(self.details)
            except json.JSONDecodeError:
                return None
        return None
    
    def __repr__(self):
        return f'<AuditLog {self.action} by user {self.user_id}>'
