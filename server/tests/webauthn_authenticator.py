"""A software WebAuthn authenticator.

It answers the options the routes emit with genuine "none" attestations and ES256
assertions, so the tests go through the real webauthn verification instead of a stub.
"""
import base64
import hashlib
import json
import os

import cbor2
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec

_USER_PRESENT = 0x01
_USER_VERIFIED = 0x04
_ATTESTED_CREDENTIAL = 0x40
_ANONYMOUS_AAGUID = bytes(16)


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()


class SoftAuthenticator:
    def __init__(self, rp_id: str, origin: str):
        self.rp_id = rp_id
        self.origin = origin
        self.credential_id = os.urandom(16)
        self.sign_count = 0
        self._key = ec.generate_private_key(ec.SECP256R1())

    @property
    def public_key(self) -> bytes:
        """COSE-encoded, as a registration stores it."""
        numbers = self._key.public_key().public_numbers()
        # COSE_Key labels: kty EC2, alg ES256, crv P-256, then the x and y coordinates.
        return cbor2.dumps({
            1: 2,
            3: -7,
            -1: 1,
            -2: numbers.x.to_bytes(32, 'big'),
            -3: numbers.y.to_bytes(32, 'big'),
        })

    def register(self, options: dict) -> dict:
        attested = (
            _ANONYMOUS_AAGUID
            + len(self.credential_id).to_bytes(2, 'big')
            + self.credential_id
            + self.public_key
        )
        auth_data = self._auth_data(_USER_PRESENT | _USER_VERIFIED | _ATTESTED_CREDENTIAL) + attested
        attestation = cbor2.dumps({'fmt': 'none', 'attStmt': {}, 'authData': auth_data})
        return self._credential({
            'clientDataJSON': b64url(self._client_data('webauthn.create', options['challenge'])),
            'attestationObject': b64url(attestation),
            'transports': ['internal'],
        })

    def sign(self, options: dict) -> dict:
        self.sign_count += 1
        auth_data = self._auth_data(_USER_PRESENT | _USER_VERIFIED)
        client_data = self._client_data('webauthn.get', options['challenge'])
        signature = self._key.sign(
            auth_data + hashlib.sha256(client_data).digest(), ec.ECDSA(hashes.SHA256())
        )
        return self._credential({
            'clientDataJSON': b64url(client_data),
            'authenticatorData': b64url(auth_data),
            'signature': b64url(signature),
        })

    def _auth_data(self, flags: int) -> bytes:
        return (
            hashlib.sha256(self.rp_id.encode()).digest()
            + bytes([flags])
            + self.sign_count.to_bytes(4, 'big')
        )

    def _client_data(self, kind: str, challenge: str) -> bytes:
        return json.dumps({'type': kind, 'challenge': challenge, 'origin': self.origin}).encode()

    def _credential(self, response: dict) -> dict:
        return {
            'id': b64url(self.credential_id),
            'rawId': b64url(self.credential_id),
            'type': 'public-key',
            'response': response,
        }
