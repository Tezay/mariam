import base64
import io

import pyotp
import qrcode
from flask import current_app


def new_secret() -> str:
    return pyotp.random_base32()


def code_matches(secret: str, code: str) -> bool:
    # One 30-second step either side absorbs a drifting phone clock.
    return pyotp.TOTP(secret).verify(code, valid_window=1)


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
