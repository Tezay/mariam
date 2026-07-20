"""Symmetric encryption for secrets stored at rest (TOTP MFA secrets).

Uses Fernet (AES-128-CBC + HMAC) with the key from ``MFA_ENCRYPTION_KEY``. When
the key is unset the helpers pass values through in cleartext — acceptable in
development only; production requires the key (enforced by the startup guard in
``create_app``).

``EncryptedSecret`` is a SQLAlchemy column type that encrypts on write and
decrypts on read, so model code keeps assigning/reading plaintext. Never use an
encrypted column in a ``WHERE`` clause — ciphertext is non-deterministic.
"""
import os

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import Text
from sqlalchemy.types import TypeDecorator


def _fernet() -> Fernet | None:
    key = os.environ.get('MFA_ENCRYPTION_KEY')
    if not key:
        return None
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_secret(plaintext: str | None) -> str | None:
    """Encrypt a secret for storage; returns cleartext unchanged when no key is set."""
    if plaintext is None:
        return None
    fernet = _fernet()
    if fernet is None:
        return plaintext
    return fernet.encrypt(plaintext.encode()).decode()


def decrypt_secret(stored: str | None) -> str | None:
    """Decrypt a stored secret.

    Falls back to returning the value unchanged when no key is configured or when
    the value is not a valid token (legacy plaintext rows written before
    encryption, or created in a keyless dev environment).
    """
    if stored is None:
        return None
    fernet = _fernet()
    if fernet is None:
        return stored
    try:
        return fernet.decrypt(stored.encode()).decode()
    except InvalidToken:
        return stored


class EncryptedSecret(TypeDecorator):
    """Text column whose value is transparently Fernet-encrypted at rest."""

    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        return encrypt_secret(value)

    def process_result_value(self, value, dialect):
        return decrypt_secret(value)
