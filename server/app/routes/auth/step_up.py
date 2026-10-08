from flask import jsonify
from flask_jwt_extended import jwt_required

from ...extensions import db
from ...models import Passkey
from ...schemas.auth import (
    AuthErrorSchema,
    ConfirmedTokenSchema,
    PasskeyAssertionSchema,
    StepUpPasswordSchema,
    WebAuthnOptionsSchema,
)
from ...schemas.common import ErrorSchema
from ...security import limiter
from ...services import passkeys, totp
from ...services.passkeys import Ceremony
from ..helpers import get_current_user
from ._common import CONFIRMATION_WINDOW, NO_SESSION, renewed_access_token
from .blueprint import auth_bp


@auth_bp.route('/step-up/password', methods=['POST'])
@limiter.limit('5 per minute')
@jwt_required()
@auth_bp.arguments(StepUpPasswordSchema)
@auth_bp.response(200, ConfirmedTokenSchema)
@auth_bp.alt_response(401, schema=ErrorSchema, description=NO_SESSION)
@auth_bp.alt_response(
    403,
    schema=AuthErrorSchema,
    description='Wrong password or code. Or no TOTP on the account: `passkey_required` is '
                'set when it has a passkey, `second_factor_required` when it has no second '
                'factor at all.',
)
def step_up_password(data):
    """Confirm identity with the password and the TOTP code

    Returns an access token that replaces the caller's and opens the routes asking
    for a confirmed session, for ten minutes. A confirmation always attests a second
    factor: an account without TOTP confirms with its passkey through
    `/step-up/passkey/*`, and an account with neither cannot confirm.
    """
    user = get_current_user()

    if not (user.mfa_enabled and user.mfa_secret):
        if user.passkeys.count() > 0:
            return jsonify({
                'error': 'Ce compte confirme son identité avec sa passkey',
                'passkey_required': True,
            }), 403
        return jsonify({
            'error': 'Configurez d’abord la double authentification',
            'second_factor_required': True,
        }), 403

    if not user.check_password(data['password']):
        return jsonify({'error': 'Mot de passe incorrect'}), 403

    if not totp.code_matches(user.mfa_secret, data['mfa_code']):
        return jsonify({'error': 'Code MFA invalide'}), 403

    return jsonify({
        'access_token': renewed_access_token(confirmed=CONFIRMATION_WINDOW),
    }), 200


@auth_bp.route('/step-up/passkey/begin', methods=['POST'])
@limiter.limit('5 per minute')
@jwt_required()
@auth_bp.response(200, WebAuthnOptionsSchema)
@auth_bp.alt_response(401, schema=ErrorSchema, description=NO_SESSION)
@auth_bp.alt_response(404, schema=ErrorSchema, description='No passkey on the account.')
def step_up_passkey_begin():
    """Start confirming identity with a passkey"""
    user = get_current_user()

    registered = list(user.passkeys)
    if not registered:
        return jsonify({'error': 'Aucune passkey enregistrée'}), 404

    return jsonify(passkeys.begin_authentication(user.id, registered, Ceremony.STEP_UP)), 200


@auth_bp.route('/step-up/passkey/complete', methods=['POST'])
@limiter.limit('5 per minute')
@jwt_required()
@auth_bp.arguments(PasskeyAssertionSchema)
@auth_bp.response(200, ConfirmedTokenSchema)
@auth_bp.alt_response(400, schema=ErrorSchema, description='Malformed credential id.')
@auth_bp.alt_response(401, schema=ErrorSchema, description=NO_SESSION)
@auth_bp.alt_response(
    403,
    schema=ErrorSchema,
    description='Challenge invalid, expired or issued to another account, '
                'or a signature that fails.',
)
@auth_bp.alt_response(404, schema=ErrorSchema, description='Unknown passkey.')
def step_up_passkey_complete(data):
    """Finish confirming identity with a passkey

    Returns the same confirmed access token as `/step-up/password`.
    """
    user = get_current_user()

    try:
        token_user_id, challenge = passkeys.read_challenge(
            data['challenge_token'], Ceremony.STEP_UP
        )
        raw_id = passkeys.credential_id(data['credential'])
    except passkeys.InvalidChallenge:
        return jsonify({'error': 'challenge_token invalide ou expiré'}), 403
    except passkeys.InvalidCredential:
        return jsonify({'error': 'credential_id invalide'}), 400

    if token_user_id != user.id:
        return jsonify({'error': 'Token invalide'}), 403

    passkey = Passkey.query.filter_by(user_id=user.id, credential_id=raw_id).first()
    if not passkey:
        return jsonify({'error': 'Passkey inconnue'}), 404

    try:
        passkeys.verify_assertion(passkey, data['credential'], challenge)
    except passkeys.VerificationFailed:
        return jsonify({'error': 'Vérification de la passkey échouée'}), 403
    db.session.commit()

    return jsonify({
        'access_token': renewed_access_token(confirmed=CONFIRMATION_WINDOW),
    }), 200
