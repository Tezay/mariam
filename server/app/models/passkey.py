"""
Modèle Passkey - Clés WebAuthn (FIDO2) enregistrées par les utilisateurs.

Chaque utilisateur peut enregistrer plusieurs passkeys (un par appareil).
La clé privée reste dans le secure enclave de l'appareil ; on stocke uniquement
la clé publique, l'identifiant de credential et le compteur de signatures.
"""
from datetime import datetime
from ..extensions import db


class Passkey(db.Model):
    """Credential WebAuthn (passkey) associé à un utilisateur."""

    __tablename__ = 'passkeys'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer,
        db.ForeignKey('users.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )

    # Identifiant opaque du credential (généré par l'authenticator)
    credential_id = db.Column(db.LargeBinary, nullable=False, unique=True)

    # Clé publique COSE encodée
    public_key = db.Column(db.LargeBinary, nullable=False)

    # Compteur de signatures — détecte les credentials clonés
    sign_count = db.Column(db.Integer, nullable=False, default=0)

    # Transports supportés par l'authenticator ("internal", "hybrid", etc.)
    transports = db.Column(db.ARRAY(db.String), nullable=True)

    # Nom de l'appareil affiché à l'utilisateur
    device_name = db.Column(db.String(100), nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_used_at = db.Column(db.DateTime, nullable=True)

    user = db.relationship('User', back_populates='passkeys')

    def to_dict(self):
        return {
            'id': self.id,
            'device_name': self.device_name or 'Appareil inconnu',
            'transports': self.transports or [],
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'last_used_at': self.last_used_at.isoformat() if self.last_used_at else None,
        }

    def __repr__(self):
        return f'<Passkey {self.id} user={self.user_id}>'
