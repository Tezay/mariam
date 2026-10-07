from datetime import UTC, datetime, timedelta

from flask import jsonify
from flask_jwt_extended import create_access_token, decode_token
from werkzeug.security import check_password_hash, generate_password_hash

from ...extensions import db
from ...models import AuditLog, Passkey, User
from ...schemas.auth import (
    AuthErrorSchema,
    LoginResponseSchema,
    LoginSchema,
    MFAVerifySchema,
    PasskeyAssertionSchema,
    SessionSchema,
    WebAuthnOptionsSchema,
)
from ...schemas.common import ErrorSchema
from ...security import claim_token, get_client_ip, is_token_blacklisted, limiter
from ...services import passkeys, totp
from ...services.passkeys import Ceremony
from ._common import complete_login, user_not_found
from .blueprint import auth_bp

MFA_TOKEN_TTL = timedelta(minutes=10)

# Hashed once, so that an unknown email costs a hash check too and cannot be told
# from a wrong password by its timing.
_DUMMY_PASSWORD_HASH = generate_password_hash('mariam-timing-equalizer')


@auth_bp.route('/login', methods=['POST'])
@limiter.limit('5 per minute')
@auth_bp.arguments(LoginSchema)
@auth_bp.response(200, LoginResponseSchema)
@auth_bp.alt_response(401, schema=ErrorSchema, description='Wrong email or password.')
@auth_bp.alt_response(
    403, schema=AuthErrorSchema, description='Account disabled, or protected by a passkey only.'
)
def login(data):
    """Sign in with email and password

    Opens the session when the account has no second factor. With TOTP enabled, returns
    an `mfa_token` instead, to finish with `/mfa/verify`. An account protected by a
    passkey only is refused with `passkey_only` set: it signs in with `/passkey/login/*`.
    """
    user = User.query.filter_by(email=data['email']).first()

    if user is None:
        check_password_hash(_DUMMY_PASSWORD_HASH, data['password'])
    if not user or not user.check_password(data['password']):
        AuditLog.log(
            action=AuditLog.ACTION_LOGIN_FAILED,
            details={'email': data['email']},
            ip_address=get_client_ip(),
        )
        db.session.commit()
        return jsonify({'error': 'Email ou mot de passe incorrect'}), 401

    if not user.is_active:
        return jsonify({'error': 'Ce compte est désactivé'}), 403

    if user.mfa_enabled:
        mfa_token = create_access_token(
            identity=str(user.id),
            additional_claims={'mfa_pending': True},
            expires_delta=MFA_TOKEN_TTL,
        )
        return jsonify({
            'mfa_required': True,
            'mfa_token': mfa_token,
            'message': 'Veuillez entrer votre code MFA',
        }), 200

    if user.passkeys.count() > 0:
        return jsonify({
            'error': 'Ce compte utilise la connexion par passkey. '
                     'Veuillez vous connecter avec votre appareil.',
            'passkey_only': True,
        }), 403

    return complete_login(user)


@auth_bp.route('/mfa/verify', methods=['POST'])
@limiter.limit('5 per minute')
@auth_bp.arguments(MFAVerifySchema)
@auth_bp.response(200, SessionSchema)
@auth_bp.alt_response(
    401, schema=ErrorSchema, description='Wrong code, or an MFA token invalid, expired or spent.'
)
@auth_bp.alt_response(
    403, schema=ErrorSchema, description='Account disabled since the password step.'
)
@auth_bp.alt_response(
    404, schema=ErrorSchema, description='Account deleted since the password step.'
)
def verify_mfa(data):
    """Finish a sign-in with the authenticator-app code

    The `mfa_token` from `/login` works once, within ten minutes.
    """
    try:
        claims = decode_token(data['mfa_token'])
        user_id = int(claims['sub'])
    except Exception:
        return jsonify({'error': 'Token MFA invalide ou expiré'}), 401
    if not claims.get('mfa_pending'):
        return jsonify({'error': 'Token invalide'}), 401

    # Single use: a spent token is refused here, and a matching code spends it below.
    jti = claims.get('jti')
    if jti and is_token_blacklisted(jti):
        return jsonify({'error': 'Token MFA invalide ou expiré'}), 401

    user = db.session.get(User, user_id)
    if not user:
        return user_not_found()

    # Decoded by hand, so the token loader never saw it: a password step taken
    # before the account's sessions were ended does not finish the sign-in.
    if user.has_revoked(claims['iat'], None):
        return jsonify({'error': 'Token MFA invalide ou expiré'}), 401

    if not totp.code_matches(user.mfa_secret, data['code']):
        AuditLog.log(
            action=AuditLog.ACTION_LOGIN_FAILED,
            user_id=user.id,
            details={'reason': 'invalid_mfa_code'},
            ip_address=get_client_ip(),
        )
        db.session.commit()
        return jsonify({'error': 'Code MFA invalide'}), 401

    if jti:
        exp = claims.get('exp')
        remaining = exp - datetime.now(UTC).timestamp() if exp else MFA_TOKEN_TTL.total_seconds()
        # Decided here rather than by the lookup above: of two requests racing
        # on the token with a right code, one only opens a session.
        if not claim_token(jti, max(1, int(remaining))):
            return jsonify({'error': 'Token MFA invalide ou expiré'}), 401

    return complete_login(user)


@auth_bp.route('/passkey/login/begin', methods=['POST'])
@limiter.limit('10 per minute')
@auth_bp.response(200, WebAuthnOptionsSchema)
def passkey_login_begin():
    """Start a passwordless sign-in

    The options allow any passkey registered for this site: the one the user picks
    identifies the account.
    """
    # No account yet: the assertion names it through its passkey.
    return jsonify(passkeys.begin_authentication(0, [], Ceremony.LOGIN)), 200


@auth_bp.route('/passkey/login/complete', methods=['POST'])
@limiter.limit('10 per minute')
@auth_bp.arguments(PasskeyAssertionSchema)
@auth_bp.response(200, SessionSchema)
@auth_bp.alt_response(400, schema=ErrorSchema, description='Malformed credential id.')
@auth_bp.alt_response(
    401, schema=ErrorSchema, description='Challenge invalid or expired, or a signature that fails.'
)
@auth_bp.alt_response(
    404, schema=ErrorSchema, description='Unknown passkey, or a disabled account.'
)
def passkey_login_complete(data):
    """Finish a passwordless sign-in"""
    try:
        _, challenge = passkeys.read_challenge(data['challenge_token'], Ceremony.LOGIN)
        raw_id = passkeys.credential_id(data['credential'])
    except passkeys.InvalidChallenge:
        return jsonify({'error': 'challenge_token invalide ou expiré'}), 401
    except passkeys.InvalidCredential:
        return jsonify({'error': 'credential_id invalide'}), 400

    passkey = Passkey.query.filter_by(credential_id=raw_id).first()
    if not passkey:
        return jsonify({'error': 'Passkey inconnue'}), 404

    user = db.session.get(User, passkey.user_id)
    if not user or not user.is_active:
        return jsonify({'error': 'Utilisateur non trouvé ou désactivé'}), 404

    try:
        passkeys.verify_assertion(passkey, data['credential'], challenge)
    except passkeys.VerificationFailed as exc:
        AuditLog.log(
            action=AuditLog.ACTION_LOGIN_FAILED,
            user_id=user.id,
            details={'reason': 'passkey_login_failed', 'error': str(exc)},
            ip_address=get_client_ip(),
        )
        db.session.commit()
        return jsonify({'error': 'Vérification de la passkey échouée'}), 401

    return complete_login(user)
