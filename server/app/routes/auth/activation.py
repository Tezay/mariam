from datetime import timedelta

from flask import request
from flask_jwt_extended import create_access_token, decode_token
from psycopg2.errors import UniqueViolation
from sqlalchemy.exc import IntegrityError

from ...extensions import db
from ...models import ActivationLink, AuditLog, Organization, Restaurant, User
from ...problems import Problem
from ...schemas.auth import (
    ActivateAccountSchema,
    ActivationCodeSchema,
    ActivationLinkSchema,
    ActivationSchema,
    PasskeyRegistrationSchema,
    SessionSchema,
    SetupTokenSchema,
    WebAuthnOptionsSchema,
)
from ...security import get_client_ip, limiter
from ...services import passkeys, totp
from ...services.crypto import decrypt_secret, encrypt_secret
from ...services.passkeys import Ceremony
from ..helpers import account_view
from ._common import (
    CONFIRMATION_WINDOW,
    account_disabled,
    account_not_found,
    challenge_refused,
    code_refusal,
    complete_login,
    open_session,
    passkey_refused,
)
from .blueprint import auth_bp

SETUP_TTL = timedelta(minutes=15)
_SETUP_SECRET = 'setup_totp'


def _setup_token(user_id: int, secret: str) -> str:
    """Its setup_phase claim keeps it off every regular endpoint: the token loader refuses it.

    It carries the TOTP secret, encrypted like the column, so that none is stored
    before its first code is checked.
    """
    return create_access_token(
        identity=str(user_id),
        additional_claims={'setup_phase': True, _SETUP_SECRET: encrypt_secret(secret)},
        expires_delta=SETUP_TTL,
    )


def _setup_refused() -> Problem:
    return Problem(401, 'setup_token_invalid', "Étape d'activation expirée. Recommencez.")


def _setup_account(token: str) -> tuple[User, dict]:
    try:
        claims = decode_token(token)
    except Exception:
        raise _setup_refused() from None
    if not claims.get('setup_phase'):
        raise _setup_refused()
    user = _account_to_set_up(int(claims['sub']))
    # Decoded by hand, so the token loader never saw it: ending the account's
    # sessions ends its setup too.
    if user.has_revoked(claims['iat'], None):
        raise _setup_refused()
    return user, claims


def _account_to_set_up(user_id: int):
    user = db.session.get(User, user_id)
    if not user:
        raise account_not_found()
    if not user.is_active:
        raise account_disabled()
    # The setup token stands in for a session: past the first factor, adding
    # one takes a confirmed session like anywhere else.
    if user.has_second_factor():
        raise Problem(409, 'second_factor_present', 'Ce compte a déjà un second facteur.')
    return user


def _account_link(token: str):
    """A password-reset link shares the table and must never create an account."""
    return ActivationLink.query.filter(
        ActivationLink.token == token,
        ActivationLink.link_type.in_(ActivationLink.ACCOUNT_CREATION_TYPES),
    )


def _usable(link):
    if not link:
        raise Problem(404, 'link_unknown', "Ce lien d'activation n'existe pas.")
    if not link.is_valid():
        raise Problem(
            410, 'link_expired', "Ce lien d'activation a expiré, a été révoqué ou a déjà servi."
        )
    return link


def _email_taken() -> Problem:
    return Problem(
        409, 'email_taken',
        'Cette adresse est déjà utilisée. Choisissez-en une autre ou contactez la personne '
        'qui vous a invité.',
    )


@auth_bp.route('/check-activation/<token>', methods=['GET'])
@auth_bp.doc(security=[])
@limiter.limit('10 per minute')
@auth_bp.response(200, ActivationLinkSchema)
@auth_bp.problem(404, 'link_unknown')
@auth_bp.problem(410, 'link_expired')
def check_activation_link(token):
    """Check an invitation link before the activation form.

    `email` is the address the inviter suggested, if any: the form pre-fills it and the
    invitee may change it.
    """
    link = _usable(_account_link(token).first())
    restaurant = db.session.get(Restaurant, link.restaurant_id) if link.restaurant_id else None
    organization = (
        db.session.get(Organization, link.organization_id) if link.organization_id else None
    )
    return {
        'link_type': link.link_type,
        'email': link.email,
        'role': link.role,
        'site': {'slug': restaurant.slug, 'name': restaurant.name} if restaurant else None,
        'organization': (
            {'slug': organization.slug, 'name': organization.name} if organization else None
        ),
    }


@auth_bp.route('/activate', methods=['POST'])
@auth_bp.doc(security=[])
@limiter.limit('3 per minute')
@auth_bp.arguments(ActivateAccountSchema)
@auth_bp.response(201, ActivationSchema)
@auth_bp.problem(404, 'link_unknown')
@auth_bp.problem(409, 'email_taken')
@auth_bp.problem(410, 'link_expired')
def activate_account(body):
    """Create an account from an invitation link.

    The invitee chooses the address and the display name; the role and the tenant come
    from the link. The account starts without a second factor. `mfa_setup` carries what
    the next step needs, valid fifteen minutes: a TOTP secret and its QR code for
    `/mfa/verify-setup`, and a setup token that `/passkey/setup/begin` accepts as well.
    """
    # Row-locked until commit: a second request with the same token waits here,
    # then finds the link spent.
    link = _usable(_account_link(body['token']).with_for_update().first())

    email = body['email']
    if User.query.filter_by(email=email).first():
        raise _email_taken()

    user = User(
        email=email,
        username=body['username'],
        role=link.role,
        restaurant_id=link.restaurant_id,
        organization_id=link.organization_id,
    )
    user.set_password(body['password'])
    link.mark_as_used()
    db.session.add(user)
    try:
        db.session.flush()
    except IntegrityError as exc:
        db.session.rollback()
        # Two invitees can pass the lookup above with the same address; the
        # unique index decides between them.
        if isinstance(exc.orig, UniqueViolation):
            raise _email_taken() from None
        raise

    AuditLog.log(
        action=AuditLog.ACTION_ACCOUNT_ACTIVATE,
        user_id=None,
        restaurant_id=link.restaurant_id,
        target_type='user',
        target_id=user.id,
        details={
            'email': email,
            'invited_email': link.email,
            'role': link.role,
            'link_type': link.link_type,
            'invitation_id': link.id,
            'invited_by': link.created_by_id,
        },
        ip_address=get_client_ip(),
    )
    db.session.commit()

    secret = totp.new_secret()
    return {
        'user': account_view(user),
        'mfa_setup': {
            'qr_code': totp.provisioning_qr(secret, email),
            'secret': secret,
            'setup_token': _setup_token(user.id, secret),
        },
    }, 201


@auth_bp.route('/mfa/verify-setup', methods=['POST'])
@auth_bp.doc(security=[])
@limiter.limit('5 per minute')
@auth_bp.arguments(ActivationCodeSchema)
@auth_bp.response(200, SessionSchema)
@auth_bp.problem(401, 'setup_token_invalid', 'code_invalid', 'code_used')
@auth_bp.problem(403, 'account_disabled')
@auth_bp.problem(404, 'account_not_found')
@auth_bp.problem(409, 'second_factor_present')
@auth_bp.problem(429, 'too_many_attempts')
def verify_mfa_setup(body):
    """Enable TOTP at activation with a first code of the secret, and sign in."""
    user, claims = _setup_account(body['setup_token'])
    if not claims.get(_SETUP_SECRET):
        raise _setup_refused()
    secret = decrypt_secret(claims[_SETUP_SECRET])
    if refusal := code_refusal(user.id, secret, body['code'], 401):
        raise refusal

    user.set_mfa_secret(secret)
    AuditLog.log(action=AuditLog.ACTION_MFA_SETUP, user_id=user.id, ip_address=get_client_ip())
    db.session.commit()

    return {
        'user': account_view(user),
        **open_session(user, confirmed=CONFIRMATION_WINDOW),
    }


@auth_bp.route('/passkey/setup/begin', methods=['POST'])
@auth_bp.doc(security=[])
@limiter.limit('10 per minute')
@auth_bp.arguments(SetupTokenSchema)
@auth_bp.response(200, WebAuthnOptionsSchema)
@auth_bp.problem(401, 'setup_token_invalid')
@auth_bp.problem(403, 'account_disabled')
@auth_bp.problem(404, 'account_not_found')
@auth_bp.problem(409, 'second_factor_present')
def passkey_setup_begin(body):
    """Start registering a passkey at activation, in place of TOTP."""
    user, _ = _setup_account(body['setup_token'])
    options = passkeys.begin_registration(user, Ceremony.SETUP)
    db.session.commit()
    return options


@auth_bp.route('/passkey/setup/complete', methods=['POST'])
@auth_bp.doc(security=[])
@limiter.limit('10 per minute')
@auth_bp.arguments(PasskeyRegistrationSchema)
@auth_bp.response(200, SessionSchema)
@auth_bp.problem(401, 'challenge_invalid', 'passkey_refused')
@auth_bp.problem(403, 'account_disabled')
@auth_bp.problem(404, 'account_not_found')
@auth_bp.problem(409, 'second_factor_present')
def passkey_setup_complete(body):
    """Register the activation passkey, and sign in; the challenge names the account."""
    try:
        owner_id, challenge = passkeys.read_challenge(body['challenge_token'], Ceremony.SETUP)
    except passkeys.InvalidChallenge:
        raise challenge_refused(401) from None
    user = _account_to_set_up(owner_id)

    try:
        passkey = passkeys.verify_registration(
            user, body['credential'], challenge, body.get('device_name'), request.user_agent.string
        )
    except passkeys.VerificationFailed:
        raise passkey_refused(401) from None

    db.session.add(passkey)
    AuditLog.log(
        action=AuditLog.ACTION_PASSKEY_SETUP,
        user_id=user.id,
        details={'device_name': passkey.device_name},
        ip_address=get_client_ip(),
    )
    db.session.commit()

    return complete_login(user)
