from flask import jsonify, request
from flask_jwt_extended import jwt_required

from ...extensions import db
from ...models import AuditLog, Passkey
from ...schemas.auth import (
    AuthErrorSchema,
    PasskeyCreatedSchema,
    PasskeyListSchema,
    PasskeyRegistrationSchema,
    PasskeyRenamedSchema,
    PasskeyRenameSchema,
    WebAuthnOptionsSchema,
)
from ...schemas.common import ErrorSchema, MessageSchema
from ...security import get_client_ip, limiter
from ...services import passkeys
from ...services.passkeys import Ceremony
from ..helpers import get_current_user, step_up_once_enrolled, step_up_required
from ._common import NO_SESSION, NOT_CONFIRMED
from .blueprint import auth_bp

UNKNOWN_PASSKEY = 'Unknown passkey, or not the account’s.'


def _own_passkey(user_id: int, passkey_id: int):
    return Passkey.query.filter_by(id=passkey_id, user_id=user_id).first()


@auth_bp.route('/passkey/register/begin', methods=['POST'])
@limiter.limit('10 per minute')
@jwt_required()
@step_up_once_enrolled
@auth_bp.response(200, WebAuthnOptionsSchema)
@auth_bp.alt_response(401, schema=ErrorSchema, description=NO_SESSION)
@auth_bp.alt_response(403, schema=AuthErrorSchema, description=NOT_CONFIRMED)
def passkey_register_begin():
    """Start adding a passkey

    Asks an account that already has a second factor for a confirmed session; an
    account with none enrols its first freely. The options leave out the passkeys
    already registered, and ask for one that serves passwordless sign-in.
    """
    user = get_current_user()
    return jsonify(passkeys.begin_registration(user, Ceremony.REGISTER)), 200


@auth_bp.route('/passkey/register/complete', methods=['POST'])
@limiter.limit('10 per minute')
@jwt_required()
@step_up_once_enrolled
@auth_bp.arguments(PasskeyRegistrationSchema)
@auth_bp.response(201, PasskeyCreatedSchema)
@auth_bp.alt_response(400, schema=ErrorSchema, description='A credential that fails verification.')
@auth_bp.alt_response(401, schema=ErrorSchema, description=NO_SESSION)
@auth_bp.alt_response(
    403,
    schema=AuthErrorSchema,
    description=f'Challenge invalid, expired, or issued to another account. Or: {NOT_CONFIRMED}',
)
def passkey_register_complete(data):
    """Finish adding a passkey

    Guarded like `/passkey/register/begin`.
    """
    user = get_current_user()

    try:
        token_user_id, challenge = passkeys.read_challenge(
            data['challenge_token'], Ceremony.REGISTER
        )
    except passkeys.InvalidChallenge:
        return jsonify({'error': 'challenge_token invalide ou expiré'}), 403

    if token_user_id != user.id:
        return jsonify({'error': 'Token invalide'}), 403

    try:
        passkey = passkeys.verify_registration(
            user, data['credential'], challenge, data.get('device_name'), request.user_agent.string
        )
    except passkeys.VerificationFailed as exc:
        return jsonify({'error': f'Vérification échouée : {exc}'}), 400

    db.session.add(passkey)
    AuditLog.log(
        action=AuditLog.ACTION_PASSKEY_REGISTERED,
        user_id=user.id,
        details={'device_name': passkey.device_name},
        ip_address=get_client_ip(),
    )
    db.session.commit()

    return jsonify({
        'message': 'Passkey enregistrée avec succès',
        'passkey': passkey.to_dict(),
    }), 201


@auth_bp.route('/passkey', methods=['GET'])
@jwt_required()
@auth_bp.response(200, PasskeyListSchema)
@auth_bp.alt_response(401, schema=ErrorSchema, description=NO_SESSION)
def list_passkeys():
    """List the account's passkeys"""
    user = get_current_user()
    return jsonify({'passkeys': [p.to_dict() for p in user.passkeys]}), 200


@auth_bp.route('/passkey/<int:passkey_id>', methods=['DELETE'])
@jwt_required()
@step_up_required
@auth_bp.response(200, MessageSchema)
@auth_bp.alt_response(401, schema=ErrorSchema, description=NO_SESSION)
@auth_bp.alt_response(403, schema=AuthErrorSchema, description=NOT_CONFIRMED)
@auth_bp.alt_response(404, schema=ErrorSchema, description=UNKNOWN_PASSKEY)
@auth_bp.alt_response(409, schema=ErrorSchema, description='The last passkey, while TOTP is off.')
def delete_passkey(passkey_id):
    """Remove a passkey, from a confirmed session

    Refused for the last one while TOTP is off.
    """
    user = get_current_user()

    passkey = _own_passkey(user.id, passkey_id)
    if not passkey:
        return jsonify({'error': 'Passkey introuvable'}), 404

    if user.passkeys.count() == 1 and not user.mfa_enabled:
        return jsonify({
            'error': 'Impossible de supprimer la dernière passkey sans authentification par code '
                     "active. Activez d'abord l'authentification par code.",
        }), 409

    db.session.delete(passkey)
    AuditLog.log(
        action=AuditLog.ACTION_PASSKEY_DELETED,
        user_id=user.id,
        details={'passkey_id': passkey_id},
        ip_address=get_client_ip(),
    )
    db.session.commit()

    return jsonify({'message': 'Passkey supprimée'}), 200


@auth_bp.route('/passkey/<int:passkey_id>', methods=['PATCH'])
@limiter.limit('10 per minute')
@jwt_required()
@auth_bp.arguments(PasskeyRenameSchema)
@auth_bp.response(200, PasskeyRenamedSchema)
@auth_bp.alt_response(400, schema=ErrorSchema, description='Blank name, or over 100 characters.')
@auth_bp.alt_response(401, schema=ErrorSchema, description=NO_SESSION)
@auth_bp.alt_response(404, schema=ErrorSchema, description=UNKNOWN_PASSKEY)
def rename_passkey(data, passkey_id):
    """Rename a passkey"""
    user = get_current_user()

    passkey = _own_passkey(user.id, passkey_id)
    if not passkey:
        return jsonify({'error': 'Passkey introuvable'}), 404

    device_name = data['device_name'].strip()
    if not device_name:
        return jsonify({'error': 'device_name requis'}), 400
    if len(device_name) > 100:
        return jsonify({'error': 'Le nom ne peut pas dépasser 100 caractères'}), 400

    AuditLog.log(
        action=AuditLog.ACTION_PASSKEY_RENAMED,
        user_id=user.id,
        details={
            'passkey_id': passkey_id, 'old_name': passkey.device_name, 'new_name': device_name,
        },
        ip_address=get_client_ip(),
    )
    passkey.device_name = device_name
    db.session.commit()

    return jsonify({'message': 'Passkey renommée', 'device_name': device_name}), 200
