from datetime import timedelta

from flask import jsonify, request
from flask_jwt_extended import create_access_token, decode_token
from psycopg2.errors import UniqueViolation
from sqlalchemy.exc import IntegrityError

from ...extensions import db
from ...models import ActivationLink, AuditLog, Organization, Restaurant, User
from ...schemas.auth import (
    ActivateAccountSchema,
    ActivationLinkSchema,
    ActivationSchema,
    InvalidLinkSchema,
    MFAVerifySetupSchema,
    PasskeySetupBeginSchema,
    PasskeySetupCompleteSchema,
    SessionSchema,
    WebAuthnOptionsSchema,
)
from ...schemas.common import ErrorSchema
from ...security import get_client_ip, limiter
from ...services import passkeys, totp
from ...services.passkeys import Ceremony
from ._common import (
    CONFIRMATION_WINDOW,
    complete_login,
    token_pair,
    user_not_found,
    weak_password,
)
from .blueprint import auth_bp

SETUP_TTL = timedelta(minutes=15)
BAD_SETUP_TOKEN = 'Setup token invalid, expired, or issued to another account.'
ALREADY_ENROLLED = 'The account already has a second factor.'


def _setup_token(user_id: int) -> str:
    """Its setup_phase claim keeps it off every regular endpoint: the token loader refuses it."""
    return create_access_token(
        identity=str(user_id), additional_claims={'setup_phase': True}, expires_delta=SETUP_TTL
    )


def _setup_token_error(token: str, user_id: int):
    try:
        claims = decode_token(token)
    except Exception:
        return jsonify({'error': 'setup_token invalide ou expiré'}), 401
    if not claims.get('setup_phase') or int(claims['sub']) != user_id:
        return jsonify({'error': 'setup_token invalide'}), 401
    return None


def _account_link(token: str):
    """A password-reset link shares the table and must never create an account."""
    return ActivationLink.query.filter(
        ActivationLink.token == token,
        ActivationLink.link_type.in_(ActivationLink.ACCOUNT_CREATION_TYPES),
    )


def _email_taken():
    return jsonify({
        'error': 'Cette adresse est déjà utilisée. Choisissez-en une autre ou contactez '
                 'la personne qui vous a invité.',
    }), 409


def _already_enrolled():
    # The setup token stands in for a session: past the first factor, adding
    # one takes a confirmed session like anywhere else.
    return jsonify({'error': 'Ce compte a déjà une double authentification'}), 400


@auth_bp.route('/check-activation/<token>', methods=['GET'])
@auth_bp.response(200, ActivationLinkSchema)
@auth_bp.alt_response(
    400, schema=InvalidLinkSchema, description='Link expired, revoked or already used.'
)
@auth_bp.alt_response(404, schema=InvalidLinkSchema, description='Unknown link.')
def check_activation_link(token):
    """Check an invitation link before the activation form

    `email` is the address the inviter suggested, if any: the form pre-fills it and the
    invitee may change it.
    """
    link = _account_link(token).first()

    if not link:
        return jsonify({'valid': False, 'error': 'Lien invalide'}), 404

    if not link.is_valid():
        return jsonify({'valid': False, 'error': 'Lien expiré, révoqué ou déjà utilisé'}), 400

    restaurant = db.session.get(Restaurant, link.restaurant_id) if link.restaurant_id else None
    organization = (
        db.session.get(Organization, link.organization_id) if link.organization_id else None
    )
    return jsonify({
        'valid': True,
        'link_type': link.link_type,
        'email': link.email,
        'role': link.role,
        'restaurant_name': restaurant.name if restaurant else None,
        'organization_name': organization.name if organization else None,
    }), 200


@auth_bp.route('/activate', methods=['POST'])
@limiter.limit('3 per minute')
@auth_bp.arguments(ActivateAccountSchema)
@auth_bp.response(201, ActivationSchema)
@auth_bp.alt_response(
    400, schema=ErrorSchema, description='Link expired, revoked or used, or password too weak.'
)
@auth_bp.alt_response(404, schema=ErrorSchema, description='Unknown link.')
@auth_bp.alt_response(409, schema=ErrorSchema, description='Email already in use.')
def activate_account(data):
    """Create an account from an invitation link

    The invitee chooses the address and the display name; the role and the tenant come
    from the link. The account starts without a second factor. `mfa_setup` carries what
    the next step needs, both valid fifteen minutes: a TOTP secret and its QR code for
    `/mfa/verify-setup`, and a setup token that `/passkey/setup/*` accepts as well.
    """
    # Row-locked until commit: a second request with the same token waits here,
    # then finds the link spent.
    link = _account_link(data['token']).with_for_update().first()

    if not link:
        return jsonify({'error': "Lien d'activation invalide"}), 404

    if not link.is_valid():
        return jsonify({'error': "Lien d'activation expiré, révoqué ou déjà utilisé"}), 400

    if not User.validate_password_strength(data['password']):
        return weak_password()

    email = data['email']
    if User.query.filter_by(email=email).first():
        return _email_taken()

    user = User(
        email=email,
        username=data['username'],
        role=link.role,
        restaurant_id=link.restaurant_id,
        organization_id=link.organization_id,
    )
    user.set_password(data['password'])
    user.mfa_secret = totp.new_secret()
    user.mfa_enabled = False

    link.mark_as_used()
    db.session.add(user)
    try:
        db.session.flush()
    except IntegrityError as exc:
        db.session.rollback()
        # Two invitees can pass the lookup above with the same address; the
        # unique index decides between them.
        if isinstance(exc.orig, UniqueViolation):
            return _email_taken()
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

    return jsonify({
        'message': 'Compte créé avec succès',
        'user': user.to_dict(include_tenant=True),
        'mfa_setup': {
            'qr_code': totp.provisioning_qr(user.mfa_secret, email),
            'secret': user.mfa_secret,
            'user_id': user.id,
            'setup_token': _setup_token(user.id),
        },
    }), 201


@auth_bp.route('/mfa/verify-setup', methods=['POST'])
@limiter.limit('5 per minute')
@auth_bp.arguments(MFAVerifySetupSchema)
@auth_bp.response(200, SessionSchema)
@auth_bp.alt_response(400, schema=ErrorSchema, description=ALREADY_ENROLLED)
@auth_bp.alt_response(401, schema=ErrorSchema, description=f'Wrong code. {BAD_SETUP_TOKEN}')
@auth_bp.alt_response(404, schema=ErrorSchema, description='Unknown account.')
def verify_mfa_setup(data):
    """Enable TOTP at activation, and sign in

    A first code confirms the secret returned by `/activate`.
    """
    if error := _setup_token_error(data['setup_token'], data['user_id']):
        return error

    user = db.session.get(User, data['user_id'])
    if not user:
        return user_not_found()

    if user.has_second_factor():
        return _already_enrolled()

    if not totp.code_matches(user.mfa_secret, data['code']):
        return jsonify({'error': 'Code invalide'}), 401

    user.mfa_enabled = True
    AuditLog.log(action=AuditLog.ACTION_MFA_SETUP, user_id=user.id, ip_address=get_client_ip())
    db.session.commit()

    return jsonify({
        'message': 'MFA activé avec succès',
        'user': user.to_dict(include_tenant=True),
        **token_pair(user, confirmed=CONFIRMATION_WINDOW),
    }), 200


@auth_bp.route('/passkey/setup/begin', methods=['POST'])
@limiter.limit('10 per minute')
@auth_bp.arguments(PasskeySetupBeginSchema)
@auth_bp.response(200, WebAuthnOptionsSchema)
@auth_bp.alt_response(400, schema=ErrorSchema, description=ALREADY_ENROLLED)
@auth_bp.alt_response(401, schema=ErrorSchema, description=BAD_SETUP_TOKEN)
@auth_bp.alt_response(404, schema=ErrorSchema, description='Unknown account.')
def passkey_setup_begin(data):
    """Start registering a passkey at activation"""
    if error := _setup_token_error(data['setup_token'], data['user_id']):
        return error

    user = db.session.get(User, data['user_id'])
    if not user:
        return user_not_found()

    if user.has_second_factor():
        return _already_enrolled()

    return jsonify(passkeys.begin_registration(user, Ceremony.SETUP)), 200


@auth_bp.route('/passkey/setup/complete', methods=['POST'])
@limiter.limit('10 per minute')
@auth_bp.arguments(PasskeySetupCompleteSchema)
@auth_bp.response(200, SessionSchema)
@auth_bp.alt_response(
    400, schema=ErrorSchema, description=f'{ALREADY_ENROLLED} Or a credential that fails.'
)
@auth_bp.alt_response(
    401, schema=ErrorSchema, description='Challenge invalid, expired, or issued to another account.'
)
@auth_bp.alt_response(403, schema=ErrorSchema, description='Account disabled.')
@auth_bp.alt_response(404, schema=ErrorSchema, description='Unknown account.')
def passkey_setup_complete(data):
    """Register the activation passkey, and sign in"""
    user = db.session.get(User, data['user_id'])
    if not user:
        return user_not_found()

    if user.has_second_factor():
        return _already_enrolled()

    try:
        token_user_id, challenge = passkeys.read_challenge(data['challenge_token'], Ceremony.SETUP)
    except passkeys.InvalidChallenge:
        return jsonify({'error': 'challenge_token invalide ou expiré'}), 401

    if token_user_id != user.id:
        return jsonify({'error': 'Token invalide'}), 401

    try:
        passkey = passkeys.verify_registration(
            user, data['credential'], challenge, data.get('device_name'), request.user_agent.string
        )
    except passkeys.VerificationFailed as exc:
        return jsonify({'error': f'Vérification échouée : {exc}'}), 400

    db.session.add(passkey)
    AuditLog.log(
        action=AuditLog.ACTION_PASSKEY_SETUP,
        user_id=user.id,
        details={'device_name': passkey.device_name},
        ip_address=get_client_ip(),
    )
    db.session.commit()

    return complete_login(user)
