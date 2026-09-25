import json
from datetime import UTC, datetime

import pyotp
from flask import jsonify, request
from flask_jwt_extended import (
    get_jwt_identity,
    jwt_required,
)

from ...extensions import db
from ...models import Passkey, User
from ...security import limiter
from ...services.step_up import issue_step_up_token
from ._webauthn import _decode_challenge_token, _get_webauthn_config, _make_challenge_token
from .blueprint import auth_bp


@auth_bp.route('/step-up/password', methods=['POST'])
@limiter.limit("5 per minute")
@jwt_required()
def step_up_password():
    """Re-authenticate with password (and TOTP when enabled) before a sensitive action.

    Body: { password, mfa_code }
    """
    data = request.get_json() or {}
    user = db.session.get(User, int(get_jwt_identity()))
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404

    if not user.check_password(data.get('password') or ''):
        return jsonify({'error': 'Mot de passe incorrect'}), 401

    if user.mfa_enabled and user.mfa_secret:
        code = data.get('mfa_code') or ''
        if not pyotp.TOTP(user.mfa_secret).verify(code, valid_window=1):
            return jsonify({'error': 'Code MFA invalide'}), 401

    return jsonify({'step_up_token': issue_step_up_token(user.id)}), 200


@auth_bp.route('/step-up/passkey/begin', methods=['POST'])
@limiter.limit("5 per minute")
@jwt_required()
def step_up_passkey_begin():
    """Challenge the caller's registered passkeys before a sensitive action."""
    from webauthn import generate_authentication_options, options_to_json
    from webauthn.helpers.structs import (
        AuthenticatorTransport,
        PublicKeyCredentialDescriptor,
        UserVerificationRequirement,
    )

    user = db.session.get(User, int(get_jwt_identity()))
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404

    passkeys = list(user.passkeys)
    if not passkeys:
        return jsonify({'error': 'Aucune passkey enregistrée'}), 404

    rp_id, _, _ = _get_webauthn_config()
    options = generate_authentication_options(
        rp_id=rp_id,
        allow_credentials=[
            PublicKeyCredentialDescriptor(
                id=p.credential_id,
                transports=[AuthenticatorTransport(tr) for tr in (p.transports or [])
                            if tr in {e.value for e in AuthenticatorTransport}],
            )
            for p in passkeys
        ],
        user_verification=UserVerificationRequirement.REQUIRED,
    )
    return jsonify({
        'options': json.loads(options_to_json(options)),
        'challenge_token': _make_challenge_token(user.id, options.challenge),
    }), 200


@auth_bp.route('/step-up/passkey/complete', methods=['POST'])
@limiter.limit("5 per minute")
@jwt_required()
def step_up_passkey_complete():
    """Verify the passkey assertion and return the proof.

    Body: { challenge_token, credential }
    """
    from webauthn import verify_authentication_response
    from webauthn.helpers import base64url_to_bytes
    from webauthn.helpers.structs import (
        AuthenticationCredential,
        AuthenticatorAssertionResponse,
    )

    data = request.get_json() or {}
    challenge_token = data.get('challenge_token')
    credential_data = data.get('credential')
    if not challenge_token or not credential_data:
        return jsonify({'error': 'challenge_token et credential requis'}), 400

    current_user_id = int(get_jwt_identity())
    try:
        token_user_id, challenge_bytes = _decode_challenge_token(challenge_token)
    except Exception:
        return jsonify({'error': 'challenge_token invalide ou expiré'}), 401
    if token_user_id != current_user_id:
        return jsonify({'error': 'Token invalide'}), 401

    try:
        raw_id_bytes = base64url_to_bytes(credential_data['id'])
    except Exception:
        return jsonify({'error': 'credential_id invalide'}), 400

    passkey = Passkey.query.filter_by(
        user_id=current_user_id, credential_id=raw_id_bytes
    ).first()
    if not passkey:
        return jsonify({'error': 'Passkey inconnue'}), 404

    rp_id, _, origin = _get_webauthn_config()
    try:
        resp = credential_data.get('response', {})
        verification = verify_authentication_response(
            credential=AuthenticationCredential(
                id=credential_data['id'],
                raw_id=raw_id_bytes,
                response=AuthenticatorAssertionResponse(
                    client_data_json=base64url_to_bytes(resp['clientDataJSON']),
                    authenticator_data=base64url_to_bytes(resp['authenticatorData']),
                    signature=base64url_to_bytes(resp['signature']),
                    user_handle=(
                        base64url_to_bytes(resp['userHandle']) if resp.get('userHandle') else None
                    ),
                ),
            ),
            expected_challenge=challenge_bytes,
            expected_rp_id=rp_id,
            expected_origin=origin,
            credential_public_key=passkey.public_key,
            credential_current_sign_count=passkey.sign_count,
            require_user_verification=True,
        )
    except Exception:
        return jsonify({'error': 'Vérification de la passkey échouée'}), 401

    passkey.sign_count = verification.new_sign_count
    passkey.last_used_at = datetime.now(UTC)
    db.session.commit()

    return jsonify({'step_up_token': issue_step_up_token(current_user_id)}), 200
