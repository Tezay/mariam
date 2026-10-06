from flask import jsonify
from flask_jwt_extended import jwt_required

from ...extensions import db
from ...models import Passkey
from ...schemas.auth import (
    AuthErrorSchema,
    PasskeyAssertionSchema,
    StepUpPasswordSchema,
    StepUpTokenSchema,
    WebAuthnOptionsSchema,
)
from ...schemas.common import ErrorSchema
from ...security import limiter
from ...services import passkeys, totp
from ...services.passkeys import Ceremony
from ...services.step_up import issue_step_up_token
from ..helpers import get_current_user
from ._common import NO_SESSION, user_not_found
from .blueprint import auth_bp


@auth_bp.route('/step-up/password', methods=['POST'])
@limiter.limit('5 per minute')
@jwt_required()
@auth_bp.arguments(StepUpPasswordSchema)
@auth_bp.response(200, StepUpTokenSchema)
@auth_bp.alt_response(401, schema=ErrorSchema, description=f'Wrong password or code. {NO_SESSION}')
@auth_bp.alt_response(
    403,
    schema=AuthErrorSchema,
    description='No TOTP on the account: `passkey_required` is set when it has a passkey, '
                '`second_factor_required` when it has no second factor at all.',
)
@auth_bp.alt_response(404, schema=ErrorSchema, description='Account deleted.')
def step_up_password(data):
    """Confirm identity with the password and the TOTP code before a sensitive action

    A proof always attests a second factor. An account without TOTP confirms with its
    passkey through `/step-up/passkey/*`; an account with neither cannot confirm.
    """
    user = get_current_user()
    if not user:
        return user_not_found()

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
        return jsonify({'error': 'Mot de passe incorrect'}), 401

    if not totp.code_matches(user.mfa_secret, data['mfa_code']):
        return jsonify({'error': 'Code MFA invalide'}), 401

    return jsonify({'step_up_token': issue_step_up_token(user.id)}), 200


@auth_bp.route('/step-up/passkey/begin', methods=['POST'])
@limiter.limit('5 per minute')
@jwt_required()
@auth_bp.response(200, WebAuthnOptionsSchema)
@auth_bp.alt_response(401, schema=ErrorSchema, description=NO_SESSION)
@auth_bp.alt_response(404, schema=ErrorSchema, description='Account deleted, or without passkey.')
def step_up_passkey_begin():
    """Start confirming identity with a passkey"""
    user = get_current_user()
    if not user:
        return user_not_found()

    registered = list(user.passkeys)
    if not registered:
        return jsonify({'error': 'Aucune passkey enregistrée'}), 404

    return jsonify(passkeys.begin_authentication(user.id, registered, Ceremony.STEP_UP)), 200


@auth_bp.route('/step-up/passkey/complete', methods=['POST'])
@limiter.limit('5 per minute')
@jwt_required()
@auth_bp.arguments(PasskeyAssertionSchema)
@auth_bp.response(200, StepUpTokenSchema)
@auth_bp.alt_response(400, schema=ErrorSchema, description='Malformed credential id.')
@auth_bp.alt_response(
    401,
    schema=ErrorSchema,
    description=f'Challenge invalid, expired or issued to another account, '
                f'or a signature that fails. {NO_SESSION}',
)
@auth_bp.alt_response(404, schema=ErrorSchema, description='Unknown passkey.')
def step_up_passkey_complete(data):
    """Finish confirming identity with a passkey"""
    user = get_current_user()
    if not user:
        return user_not_found()

    try:
        token_user_id, challenge = passkeys.read_challenge(
            data['challenge_token'], Ceremony.STEP_UP
        )
        raw_id = passkeys.credential_id(data['credential'])
    except passkeys.InvalidChallenge:
        return jsonify({'error': 'challenge_token invalide ou expiré'}), 401
    except passkeys.InvalidCredential:
        return jsonify({'error': 'credential_id invalide'}), 400

    if token_user_id != user.id:
        return jsonify({'error': 'Token invalide'}), 401

    passkey = Passkey.query.filter_by(user_id=user.id, credential_id=raw_id).first()
    if not passkey:
        return jsonify({'error': 'Passkey inconnue'}), 404

    try:
        passkeys.verify_assertion(passkey, data['credential'], challenge)
    except passkeys.VerificationFailed:
        return jsonify({'error': 'Vérification de la passkey échouée'}), 401
    db.session.commit()

    return jsonify({'step_up_token': issue_step_up_token(user.id)}), 200
