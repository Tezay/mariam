import base64
from datetime import timedelta

from flask import current_app
from flask_jwt_extended import (
    create_access_token,
    decode_token,
)


def _detect_device_name(user_agent: str) -> str:
    """
    Derive a human-readable device name from a User-Agent string.
    Used as the default passkey label when the user provides none.
    """
    if not user_agent:
        return 'Appareil inconnu'
    ua = user_agent

    # Mobile / tablet devices
    if 'iPhone' in ua:
        return 'iPhone'
    if 'iPad' in ua:
        return 'iPad'
    if 'Android' in ua:
        return 'Tablette Android' if ('Tablet' in ua or 'Kindle' in ua) else 'Android'

    # Desktop OS
    if 'CrOS' in ua:
        os_name = 'ChromeOS'
    elif 'Windows' in ua:
        os_name = 'Windows'
    elif 'Macintosh' in ua or 'Mac OS X' in ua:
        os_name = 'macOS'
    elif 'Linux' in ua:
        os_name = 'Linux'
    else:
        os_name = None

    # Browser (order matters: Edge/Opera check before Chrome)
    if 'Edg/' in ua or 'EdgA/' in ua:
        browser = 'Edge'
    elif 'OPR/' in ua or 'Opera/' in ua:
        browser = 'Opera'
    elif 'Chrome/' in ua:
        browser = 'Chrome'
    elif 'Firefox/' in ua:
        browser = 'Firefox'
    elif 'Safari/' in ua:
        browser = 'Safari'
    else:
        browser = None

    if os_name and browser:
        return f'{os_name} · {browser}'
    return os_name or browser or 'Appareil inconnu'


def _get_webauthn_config():
    """Return the WebAuthn RP configuration from the current app."""
    return (
        current_app.config['WEBAUTHN_RP_ID'],
        current_app.config['WEBAUTHN_RP_NAME'],
        current_app.config['WEBAUTHN_ORIGIN'],
    )


def _make_challenge_token(user_id: int, challenge_bytes: bytes) -> str:
    """
    Encode a WebAuthn challenge into a short-lived JWT (120 s).
    Avoids storing state server-side.
    """
    challenge_b64 = base64.urlsafe_b64encode(challenge_bytes).rstrip(b'=').decode()
    return create_access_token(
        identity=str(user_id),
        additional_claims={'webauthn_challenge': challenge_b64, 'webauthn_pending': True},
        expires_delta=timedelta(seconds=120),
    )


def _decode_challenge_token(token: str):
    """
    Decode a challenge token.
    Returns (user_id, challenge_bytes) or raises an exception.
    """
    decoded = decode_token(token)
    if not decoded.get('webauthn_pending'):
        raise ValueError('Token invalide')
    user_id = int(decoded['sub'])
    challenge_b64 = decoded['webauthn_challenge']
    # Restaurer le padding Base64url
    padding = 4 - len(challenge_b64) % 4
    if padding != 4:
        challenge_b64 += '=' * padding
    challenge_bytes = base64.urlsafe_b64decode(challenge_b64)
    return user_id, challenge_bytes
