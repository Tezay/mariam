"""
MARIAM - Modèle ImportSession

Stocke temporairement les fichiers CSV parsés en base de données.
"""
import json
from datetime import datetime, timedelta
from ..extensions import db


class ImportSession(db.Model):
    """Session d'import CSV temporaire stockée en base de données."""
    
    __tablename__ = 'import_session'
    
    id = db.Column(db.String(36), primary_key=True)  # UUID
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    filename = db.Column(db.String(255), nullable=False)
    columns = db.Column(db.Text, nullable=False)  # JSON array
    rows = db.Column(db.Text, nullable=False)     # JSON array
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    expires_at = db.Column(db.DateTime, nullable=False)
    
    def __init__(self, id, user_id, filename, columns, rows, expires_minutes=30):
        self.id = id
        self.user_id = user_id
        self.filename = filename
        self.columns = json.dumps(columns)
        self.rows = json.dumps(rows)
        self.expires_at = datetime.utcnow() + timedelta(minutes=expires_minutes)
    
    def get_columns(self) -> list:
        """Retourne les colonnes comme liste Python."""
        return json.loads(self.columns)
    
    def get_rows(self) -> list:
        """Retourne les lignes comme liste de dictionnaires."""
        return json.loads(self.rows)
    
    def is_expired(self) -> bool:
        """Vérifie si la session a expiré."""
        return datetime.utcnow() > self.expires_at
    
    @classmethod
    def cleanup_expired(cls):
        """Supprime les sessions expirées."""
        cls.query.filter(cls.expires_at < datetime.utcnow()).delete()
        db.session.commit()
    
    @classmethod
    def get_valid(cls, session_id: str, user_id: int):
        """Récupère une session valide pour un utilisateur."""
        session = cls.query.filter_by(id=session_id, user_id=user_id).first()
        if session and not session.is_expired():
            return session
        return None
