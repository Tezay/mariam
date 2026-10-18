import json
from datetime import timedelta

from ..extensions import db
from ..utils.time import utc_now_naive


class ImportSession(db.Model):
    __tablename__ = 'import_session'
    
    id = db.Column(db.String(36), primary_key=True)  # UUID
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    restaurant_id = db.Column(
        db.Integer, db.ForeignKey('restaurants.id', ondelete='CASCADE'), nullable=True
    )
    kind = db.Column(db.String(10), nullable=True)
    filename = db.Column(db.String(255), nullable=False)
    columns = db.Column(db.Text, nullable=False)  # JSON array
    rows = db.Column(db.Text, nullable=False)     # JSON array
    created_at = db.Column(db.DateTime, default=utc_now_naive)
    expires_at = db.Column(db.DateTime, nullable=False)
    
    def __init__(self, id, user_id, restaurant_id, kind, filename, columns, rows,
                 expires_minutes=30):
        self.id = id
        self.user_id = user_id
        self.restaurant_id = restaurant_id
        self.kind = kind
        self.filename = filename
        self.columns = json.dumps(columns)
        self.rows = json.dumps(rows)
        self.expires_at = utc_now_naive() + timedelta(minutes=expires_minutes)
    
    def get_rows(self) -> list:
        return json.loads(self.rows)
    
    def is_expired(self) -> bool:
        return utc_now_naive() > self.expires_at
    
    @classmethod
    def cleanup_expired(cls):
        cls.query.filter(cls.expires_at < utc_now_naive()).delete()
        db.session.commit()
    
    @classmethod
    def get_valid(cls, session_id: str, user_id: int, restaurant_id: int, kind: str):
        session = cls.query.filter_by(
            id=session_id, user_id=user_id, restaurant_id=restaurant_id, kind=kind
        ).first()
        if session and not session.is_expired():
            return session
        return None
