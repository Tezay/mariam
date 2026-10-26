from ..extensions import db
from ..utils.time import utc_now_naive


class Passkey(db.Model):
    __tablename__ = 'passkeys'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer,
        db.ForeignKey('users.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )

    credential_id = db.Column(db.LargeBinary, nullable=False, unique=True)

    # COSE-encoded.
    public_key = db.Column(db.LargeBinary, nullable=False)

    # A count that goes backwards reveals a cloned authenticator.
    sign_count = db.Column(db.Integer, nullable=False, default=0)

    transports = db.Column(db.ARRAY(db.String), nullable=True)

    device_name = db.Column(db.String(100), nullable=True)

    created_at = db.Column(db.DateTime, default=utc_now_naive)
    last_used_at = db.Column(db.DateTime, nullable=True)

    user = db.relationship('User', back_populates='passkeys')

    def __repr__(self):
        return f'<Passkey {self.id} user={self.user_id}>'
