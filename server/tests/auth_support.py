from datetime import timedelta

import pyotp
from flask import current_app
from flask_jwt_extended import create_access_token, create_refresh_token, get_jti

from app.extensions import db
from app.models import ActivationLink, Passkey, User
from app.routes.auth._common import CONFIRMATION_WINDOW
from app.security import SESSION_CLAIM
from conftest import TEST_PASSWORD, auth_headers
from tests.webauthn_authenticator import SoftAuthenticator


def issue_session(user_id: int, *, confirmed: bool = False) -> dict[str, str]:
    """Explicit lifetimes: the test config issues tokens without `exp`, and logout
    only revokes a token that has one.
    """
    identity = str(user_id)
    refresh = create_refresh_token(identity=identity, expires_delta=timedelta(days=7))
    return {
        'access': create_access_token(
            identity=identity,
            expires_delta=timedelta(minutes=30),
            fresh=CONFIRMATION_WINDOW if confirmed else False,
            additional_claims={SESSION_CLAIM: get_jti(refresh)},
        ),
        'refresh': refresh,
    }


def session_headers(user_id: int, *, confirmed: bool = False) -> dict[str, str]:
    """`confirmed` mints the confirmation instead of earning it, for an account
    whose own second factors are under test.
    """
    return auth_headers(issue_session(user_id, confirmed=confirmed)['access'])


def is_signed_in(client, session: dict[str, str]) -> bool:
    return client.get('/v1/auth/me', headers=auth_headers(session['access'])).status_code == 200


def enable_totp(user_id: int) -> str:
    user = db.session.get(User, user_id)
    user.mfa_secret = pyotp.random_base32()
    user.mfa_enabled = True
    db.session.commit()
    return user.mfa_secret


def confirmed_headers(
    client, user_id: int, headers: dict[str, str] | None = None
) -> dict[str, str]:
    """Enables TOTP on the account, then confirms the session `headers` carry, or a
    new one.
    """
    secret = enable_totp(user_id)
    res = client.post(
        '/v1/auth/step-up/password',
        headers=headers or session_headers(user_id),
        json={'password': TEST_PASSWORD, 'mfa_code': pyotp.TOTP(secret).now()},
    )
    return auth_headers(res.get_json()['access_token'])


def new_authenticator() -> SoftAuthenticator:
    return SoftAuthenticator(
        current_app.config['WEBAUTHN_RP_ID'], current_app.config['WEBAUTHN_ORIGIN']
    )


def enroll_passkey(user_id: int) -> SoftAuthenticator:
    authenticator = new_authenticator()
    db.session.add(Passkey(
        user_id=user_id,
        credential_id=authenticator.credential_id,
        public_key=authenticator.public_key,
        sign_count=0,
        transports=['internal'],
        device_name='Test device',
    ))
    db.session.commit()
    return authenticator


def reset_link(email: str) -> str:
    link = ActivationLink.create_password_reset_link(email)
    db.session.add(link)
    db.session.commit()
    return link.token


def invite_link(email: str | None = None, role: str = 'editor') -> str:
    link = ActivationLink.create_invite_link(email, role=role)
    db.session.add(link)
    db.session.commit()
    return link.token
