import json
from collections.abc import Iterable
from datetime import timedelta
from enum import StrEnum

import webauthn
from flask import current_app
from flask_jwt_extended import create_access_token, decode_token
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url
from webauthn.helpers.cose import COSEAlgorithmIdentifier
from webauthn.helpers.structs import (
    AuthenticationCredential,
    AuthenticatorAssertionResponse,
    AuthenticatorAttestationResponse,
    AuthenticatorSelectionCriteria,
    AuthenticatorTransport,
    PublicKeyCredentialCreationOptions,
    PublicKeyCredentialDescriptor,
    PublicKeyCredentialRequestOptions,
    RegistrationCredential,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from ..models import Passkey, User
from ..security import claim_token
from ..utils.time import utc_now_naive

CHALLENGE_TTL = timedelta(seconds=120)
_ALGORITHMS = [
    COSEAlgorithmIdentifier.ECDSA_SHA_256,
    COSEAlgorithmIdentifier.RSASSA_PKCS1_v1_5_SHA_256,
]
_KNOWN_TRANSPORTS = {transport.value for transport in AuthenticatorTransport}


class Ceremony(StrEnum):
    REGISTER = 'register'
    SETUP = 'setup'
    LOGIN = 'login'
    STEP_UP = 'step_up'
    CHANGE_PASSWORD = 'change_password'
    RESET_PASSWORD = 'reset_password'


class InvalidChallenge(Exception):
    pass


class InvalidCredential(Exception):
    pass


class VerificationFailed(Exception):
    pass


def issue_challenge(user_id: int, challenge: bytes, ceremony: Ceremony) -> str:
    """Carries the challenge in a signed token, so no ceremony state is kept server side."""
    return create_access_token(
        identity=str(user_id),
        additional_claims={
            'webauthn_challenge': bytes_to_base64url(challenge),
            'webauthn_pending': True,
            'webauthn_ceremony': ceremony.value,
        },
        expires_delta=CHALLENGE_TTL,
    )


def read_challenge(token: str, ceremony: Ceremony) -> tuple[int, bytes]:
    try:
        claims = decode_token(token)
    except Exception as exc:
        raise InvalidChallenge from exc
    # A challenge answers the ceremony that issued it: one begun with a mere reset
    # link must not complete a passkey setup, which opens a session.
    if claims.get('webauthn_ceremony') != ceremony:
        raise InvalidChallenge
    # Spent on its first reading: a response signed over a challenge that could
    # serve again could be replayed with it.
    if not claim_token(claims['jti'], int(CHALLENGE_TTL.total_seconds())):
        raise InvalidChallenge
    return int(claims['sub']), base64url_to_bytes(claims['webauthn_challenge'])


def begin_registration(user: User, ceremony: Ceremony) -> dict:
    options = webauthn.generate_registration_options(
        rp_id=current_app.config['WEBAUTHN_RP_ID'],
        rp_name=current_app.config['WEBAUTHN_RP_NAME'],
        user_id=str(user.id).encode(),
        user_name=user.email,
        user_display_name=user.username or user.email,
        exclude_credentials=_descriptors(user.passkeys),
        # Any passkey may end up the account's only factor, so it has to serve
        # passwordless login: discoverable, and verifying the user.
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.REQUIRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
        supported_pub_key_algs=_ALGORITHMS,
    )
    return _ceremony_start(options, user.id, ceremony)


def verify_registration(
    user: User, credential: dict, challenge: bytes, name: str | None, user_agent: str
) -> Passkey:
    """The verified passkey, not yet added to the session."""
    try:
        response = credential.get('response', {})
        transports = response.get('transports') or []
        verification = webauthn.verify_registration_response(
            credential=RegistrationCredential(
                id=credential['id'],
                raw_id=base64url_to_bytes(credential.get('rawId', credential['id'])),
                response=AuthenticatorAttestationResponse(
                    client_data_json=base64url_to_bytes(response['clientDataJSON']),
                    attestation_object=base64url_to_bytes(response['attestationObject']),
                    transports=[AuthenticatorTransport(t) for t in transports] or None,
                ),
            ),
            expected_challenge=challenge,
            expected_rp_id=current_app.config['WEBAUTHN_RP_ID'],
            expected_origin=current_app.config['WEBAUTHN_ORIGIN'],
            require_user_verification=True,
        )
    except Exception as exc:
        raise VerificationFailed(str(exc)) from exc
    return Passkey(
        user_id=user.id,
        credential_id=verification.credential_id,
        public_key=verification.credential_public_key,
        sign_count=verification.sign_count,
        transports=list(transports),
        device_name=(name or '').strip() or describe_device(user_agent),
    )


def begin_authentication(user_id: int, passkeys: Iterable[Passkey], ceremony: Ceremony) -> dict:
    options = webauthn.generate_authentication_options(
        rp_id=current_app.config['WEBAUTHN_RP_ID'],
        allow_credentials=_descriptors(passkeys),
        user_verification=UserVerificationRequirement.REQUIRED,
    )
    return _ceremony_start(options, user_id, ceremony)


def credential_id(credential: dict) -> bytes:
    try:
        return base64url_to_bytes(credential.get('rawId', credential.get('id', '')))
    except Exception as exc:
        raise InvalidCredential from exc


def verify_assertion(passkey: Passkey, credential: dict, challenge: bytes) -> None:
    """Updates the passkey's counter and last use on success; the caller commits."""
    try:
        response = credential.get('response', {})
        user_handle = response.get('userHandle')
        verification = webauthn.verify_authentication_response(
            credential=AuthenticationCredential(
                id=credential['id'],
                raw_id=passkey.credential_id,
                response=AuthenticatorAssertionResponse(
                    client_data_json=base64url_to_bytes(response['clientDataJSON']),
                    authenticator_data=base64url_to_bytes(response['authenticatorData']),
                    signature=base64url_to_bytes(response['signature']),
                    user_handle=base64url_to_bytes(user_handle) if user_handle else None,
                ),
            ),
            expected_challenge=challenge,
            expected_rp_id=current_app.config['WEBAUTHN_RP_ID'],
            expected_origin=current_app.config['WEBAUTHN_ORIGIN'],
            credential_public_key=passkey.public_key,
            credential_current_sign_count=passkey.sign_count,
            require_user_verification=True,
        )
    except Exception as exc:
        raise VerificationFailed(str(exc)) from exc
    passkey.sign_count = verification.new_sign_count
    passkey.last_used_at = utc_now_naive()


def describe_device(user_agent: str) -> str:
    """A readable label for a passkey its owner did not name."""
    if not user_agent:
        return 'Appareil inconnu'
    if 'iPhone' in user_agent:
        return 'iPhone'
    if 'iPad' in user_agent:
        return 'iPad'
    if 'Android' in user_agent:
        return 'Tablette Android' if 'Tablet' in user_agent or 'Kindle' in user_agent else 'Android'

    if 'CrOS' in user_agent:
        os_name = 'ChromeOS'
    elif 'Windows' in user_agent:
        os_name = 'Windows'
    elif 'Macintosh' in user_agent or 'Mac OS X' in user_agent:
        os_name = 'macOS'
    elif 'Linux' in user_agent:
        os_name = 'Linux'
    else:
        os_name = None

    # Edge and Opera also announce Chrome/, and Chrome announces Safari/: order matters.
    if 'Edg/' in user_agent or 'EdgA/' in user_agent:
        browser = 'Edge'
    elif 'OPR/' in user_agent or 'Opera/' in user_agent:
        browser = 'Opera'
    elif 'Chrome/' in user_agent:
        browser = 'Chrome'
    elif 'Firefox/' in user_agent:
        browser = 'Firefox'
    elif 'Safari/' in user_agent:
        browser = 'Safari'
    else:
        browser = None

    if os_name and browser:
        return f'{os_name} · {browser}'
    return os_name or browser or 'Appareil inconnu'


def _descriptors(passkeys: Iterable[Passkey]) -> list[PublicKeyCredentialDescriptor]:
    return [
        PublicKeyCredentialDescriptor(
            id=passkey.credential_id,
            # Stored as plain strings: one this webauthn release does not know is skipped.
            transports=[
                AuthenticatorTransport(t)
                for t in (passkey.transports or [])
                if t in _KNOWN_TRANSPORTS
            ],
        )
        for passkey in passkeys
    ]


def _ceremony_start(
    options: PublicKeyCredentialCreationOptions | PublicKeyCredentialRequestOptions,
    user_id: int,
    ceremony: Ceremony,
) -> dict:
    return {
        'options': json.loads(webauthn.options_to_json(options)),
        'challenge_token': issue_challenge(user_id, options.challenge, ceremony),
    }
