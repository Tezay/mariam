import base64
import io
from datetime import timedelta

import pyotp
import qrcode
from flask import current_app
from flask_jwt_extended import create_access_token, decode_token

from .crypto import decrypt_secret, encrypt_secret

_ENROLMENT_TTL = timedelta(minutes=10)
_ENROLMENT_CLAIM = 'totp_enrolment'


def new_secret() -> str:
    return pyotp.random_base32()


def code_matches(secret: str | None, code: str) -> bool:
    # TOTP turned off between the two steps of a sign-in leaves the second without a secret.
    if not secret:
        return False
    # One 30-second step either side absorbs a drifting phone clock.
    return pyotp.TOTP(secret).verify(code, valid_window=1)


def issue_enrolment(user_id: int, secret: str) -> str:
    """Carries a secret until its first code is checked, so that none is stored before."""
    return create_access_token(
        identity=str(user_id),
        expires_delta=_ENROLMENT_TTL,
        # A token is signed, not sealed: encrypted like the column it ends up in.
        additional_claims={_ENROLMENT_CLAIM: encrypt_secret(secret)},
    )


def read_enrolment(token: str, user_id: int) -> str | None:
    """The secret of an enrolment started by this account, if the token still holds."""
    try:
        claims = decode_token(token)
    except Exception:
        return None
    sealed = claims.get(_ENROLMENT_CLAIM)
    if not sealed or claims.get('sub') != str(user_id):
        return None
    return decrypt_secret(sealed)


def provisioning_qr(secret: str, email: str) -> str:
    """The enrolment QR code, as a PNG data URI."""
    issuer = current_app.config.get('MFA_ISSUER_NAME', 'MARIAM')
    uri = pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name=issuer)

    qr = qrcode.QRCode(version=1, box_size=5, border=2)
    qr.add_data(uri)
    qr.make(fit=True)
    buffer = io.BytesIO()
    qr.make_image(fill_color='black', back_color='white').save(buffer, format='PNG')
    return f'data:image/png;base64,{base64.b64encode(buffer.getvalue()).decode()}'
