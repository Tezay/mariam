from flask import request
from flask_jwt_extended import jwt_required

from ...extensions import db
from ...models import AuditLog, Passkey
from ...problems import Problem
from ...schemas.auth import PasskeyRegistrationSchema, WebAuthnOptionsSchema
from ...schemas.user import PasskeyListSchema, PasskeyPatchSchema, PasskeySchema
from ...security import get_client_ip, limiter
from ...services import passkeys
from ...services.account import SecurityEvent, notify_security_event
from ...services.passkeys import Ceremony
from ...utils.time import as_utc
from ..auth._common import challenge_refused, passkey_refused
from ..helpers import get_current_user, step_up_once_enrolled, step_up_required
from .blueprint import user_bp


def passkey_view(passkey) -> dict:
    return {
        'id': passkey.id,
        'device_name': passkey.device_name or 'Appareil inconnu',
        'transports': passkey.transports or [],
        'created_at': as_utc(passkey.created_at),
        'last_used_at': as_utc(passkey.last_used_at),
    }


def _own_passkey(user_id: int, passkey_id: int):
    passkey = Passkey.query.filter_by(id=passkey_id, user_id=user_id).first()
    if passkey is None:
        raise Problem(404, 'passkey_not_found', 'Passkey introuvable.')
    return passkey


@user_bp.route('/passkeys', methods=['GET'])
@jwt_required()
@user_bp.response(200, PasskeyListSchema)
def list_passkeys():
    """The account's passkeys."""
    return {'items': [passkey_view(passkey) for passkey in get_current_user().passkeys]}


@user_bp.route('/passkeys/options', methods=['POST'])
@limiter.limit('10 per minute')
@jwt_required()
@step_up_once_enrolled
@user_bp.response(200, WebAuthnOptionsSchema)
@user_bp.problem(403, 'step_up_required')
def passkey_options():
    """Options to create a passkey with, and the challenge to send back.

    From a confirmed session once the account has a second factor; its first is
    enrolled freely. The options leave out the passkeys already registered, and ask
    for one that serves passwordless sign-in.
    """
    return passkeys.begin_registration(get_current_user(), Ceremony.REGISTER)


@user_bp.route('/passkeys', methods=['POST'])
@limiter.limit('10 per minute')
@jwt_required()
@step_up_once_enrolled
@user_bp.arguments(PasskeyRegistrationSchema)
@user_bp.response(201, PasskeySchema)
@user_bp.problem(403, 'step_up_required', 'challenge_invalid', 'passkey_refused')
def create_passkey(body):
    """Register the passkey the browser created from the options; guarded like them."""
    user = get_current_user()
    try:
        owner_id, challenge = passkeys.read_challenge(body['challenge_token'], Ceremony.REGISTER)
    except passkeys.InvalidChallenge:
        raise challenge_refused(403) from None
    if owner_id != user.id:
        raise challenge_refused(403)
    try:
        passkey = passkeys.verify_registration(
            user, body['credential'], challenge, body.get('device_name'), request.user_agent.string
        )
    except passkeys.VerificationFailed:
        raise passkey_refused(403) from None
    db.session.add(passkey)
    AuditLog.log(
        action=AuditLog.ACTION_PASSKEY_REGISTERED,
        user_id=user.id,
        details={'device_name': passkey.device_name},
        ip_address=get_client_ip(),
    )
    db.session.commit()
    notify_security_event(user, SecurityEvent.PASSKEY_ADDED)
    return passkey_view(passkey)


@user_bp.route('/passkeys/<int:passkey_id>', methods=['PATCH'])
@limiter.limit('10 per minute')
@jwt_required()
@user_bp.arguments(PasskeyPatchSchema)
@user_bp.response(200, PasskeySchema)
@user_bp.problem(404, 'passkey_not_found')
def patch_passkey(body, passkey_id: int):
    """Rename a passkey."""
    user = get_current_user()
    passkey = _own_passkey(user.id, passkey_id)
    name = body['device_name']
    AuditLog.log(
        action=AuditLog.ACTION_PASSKEY_RENAMED,
        user_id=user.id,
        details={'passkey_id': passkey_id, 'old_name': passkey.device_name, 'new_name': name},
        ip_address=get_client_ip(),
    )
    passkey.device_name = name
    db.session.commit()
    return passkey_view(passkey)


@user_bp.route('/passkeys/<int:passkey_id>', methods=['DELETE'])
@jwt_required()
@step_up_required
@user_bp.response(204)
@user_bp.problem(403, 'step_up_required')
@user_bp.problem(404, 'passkey_not_found')
@user_bp.problem(409, 'last_second_factor')
def delete_passkey(passkey_id: int):
    """Remove a passkey, from a confirmed session; never the last while TOTP is off."""
    user = get_current_user()
    passkey = _own_passkey(user.id, passkey_id)
    if user.passkeys.count() == 1 and not user.mfa_enabled:
        raise Problem(
            409, 'last_second_factor',
            "C'est la dernière passkey et l'authentification par code n'est pas activée : "
            "activez-la d'abord.",
        )
    db.session.delete(passkey)
    AuditLog.log(
        action=AuditLog.ACTION_PASSKEY_DELETED,
        user_id=user.id,
        details={'passkey_id': passkey_id},
        ip_address=get_client_ip(),
    )
    db.session.commit()
    notify_security_event(user, SecurityEvent.PASSKEY_REMOVED)
