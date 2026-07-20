"""Encryption-at-rest tests: Fernet helpers and the EncryptedSecret column."""
from cryptography.fernet import Fernet
from sqlalchemy import text

from app.extensions import db
from app.models import User
from app.services.crypto import decrypt_secret, encrypt_secret
from conftest import make_user


class TestCryptoHelpers:
    def test_round_trip_with_key(self, monkeypatch):
        monkeypatch.setenv('MFA_ENCRYPTION_KEY', Fernet.generate_key().decode())
        enc = encrypt_secret('JBSWY3DPEHPK3PXP')
        assert enc != 'JBSWY3DPEHPK3PXP'
        assert decrypt_secret(enc) == 'JBSWY3DPEHPK3PXP'

    def test_passthrough_without_key(self, monkeypatch):
        monkeypatch.delenv('MFA_ENCRYPTION_KEY', raising=False)
        assert encrypt_secret('secret') == 'secret'
        assert decrypt_secret('secret') == 'secret'

    def test_decrypt_plaintext_fallback(self, monkeypatch):
        # A legacy plaintext value must still be readable once a key is set.
        monkeypatch.setenv('MFA_ENCRYPTION_KEY', Fernet.generate_key().decode())
        assert decrypt_secret('legacy-plaintext') == 'legacy-plaintext'

    def test_none_is_preserved(self):
        assert encrypt_secret(None) is None
        assert decrypt_secret(None) is None


class TestEncryptedColumn:
    def test_column_stores_ciphertext_reads_plaintext(self, app, monkeypatch):
        monkeypatch.setenv('MFA_ENCRYPTION_KEY', Fernet.generate_key().decode())
        uid = make_user(None, email='enc@mariam.app')
        user = User.query.get(uid)
        user.mfa_secret = 'JBSWY3DPEHPK3PXP'
        db.session.commit()

        raw = db.session.execute(
            text('SELECT mfa_secret FROM users WHERE id = :id'), {'id': uid}
        ).scalar()
        assert raw != 'JBSWY3DPEHPK3PXP'  # stored encrypted

        db.session.expire(user)
        assert User.query.get(uid).mfa_secret == 'JBSWY3DPEHPK3PXP'  # read decrypted
