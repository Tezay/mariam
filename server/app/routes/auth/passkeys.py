import json

from flask import jsonify, request
from flask_jwt_extended import (
    get_jwt_identity,
    jwt_required,
)

from ...extensions import db
from ...models import AuditLog, Passkey, User
from ...security import get_client_ip, limiter
from ._webauthn import (
    _decode_challenge_token,
    _detect_device_name,
    _get_webauthn_config,
    _make_challenge_token,
)
from .blueprint import auth_bp


@auth_bp.route('/passkey/register/begin', methods=['POST'])
@limiter.limit("10 per minute")
@jwt_required()
def passkey_register_begin():
    """
    Start passkey registration for the authenticated user.

    Returns WebAuthn options for navigator.credentials.create() and a
    short-lived challenge_token to submit with the /complete request.
    """
    from webauthn import generate_registration_options, options_to_json
    from webauthn.helpers.cose import COSEAlgorithmIdentifier
    from webauthn.helpers.structs import (
        AuthenticatorSelectionCriteria,
        AuthenticatorTransport,
        PublicKeyCredentialDescriptor,
        ResidentKeyRequirement,
        UserVerificationRequirement,
    )

    rp_id, rp_name, _ = _get_webauthn_config()
    current_user_id = int(get_jwt_identity())
    user = db.session.get(User, current_user_id)

    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404

    options = generate_registration_options(
        rp_id=rp_id,
        rp_name=rp_name,
        user_id=str(user.id).encode(),
        user_name=user.email,
        user_display_name=user.username or user.email,
        exclude_credentials=[
            PublicKeyCredentialDescriptor(
                id=p.credential_id,
                transports=[AuthenticatorTransport(t) for t in (p.transports or [])
                            if t in {e.value for e in AuthenticatorTransport}],
            )
            for p in user.passkeys
        ],
        # Once TOTP is off, this passkey may be the only factor left: it has to
        # serve passwordless login, as the ones created at activation do.
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.REQUIRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
        supported_pub_key_algs=[
            COSEAlgorithmIdentifier.ECDSA_SHA_256,
            COSEAlgorithmIdentifier.RSASSA_PKCS1_v1_5_SHA_256,
        ],
    )

    challenge_token = _make_challenge_token(user.id, options.challenge, 'register')
    options_dict = json.loads(options_to_json(options))

    return jsonify({
        'options': options_dict,
        'challenge_token': challenge_token,
    }), 200


@auth_bp.route('/passkey/register/complete', methods=['POST'])
@limiter.limit("10 per minute")
@jwt_required()
def passkey_register_complete():
    """
    Finalize passkey registration for the authenticated user.

    Body: { challenge_token, credential, device_name? }
    """
    from webauthn import verify_registration_response
    from webauthn.helpers import base64url_to_bytes
    from webauthn.helpers.structs import (
        AuthenticatorAttestationResponse,
        AuthenticatorTransport,
        RegistrationCredential,
    )

    data = request.get_json()
    if not data:
        return jsonify({'error': 'Données manquantes'}), 400

    challenge_token = data.get('challenge_token')
    credential_data = data.get('credential')
    device_name = data.get('device_name', '').strip() or _detect_device_name(request.headers.get('User-Agent', ''))

    if not challenge_token or not credential_data:
        return jsonify({'error': 'challenge_token et credential requis'}), 400

    current_user_id = int(get_jwt_identity())

    try:
        token_user_id, challenge_bytes = _decode_challenge_token(challenge_token, 'register')
    except Exception:
        return jsonify({'error': 'challenge_token invalide ou expiré'}), 401

    if token_user_id != current_user_id:
        return jsonify({'error': 'Token invalide'}), 401

    user = db.session.get(User, current_user_id)
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404

    rp_id, _, origin = _get_webauthn_config()

    try:
        resp = credential_data.get('response', {})
        transports_raw = resp.get('transports', [])
        transports = [AuthenticatorTransport(t) for t in transports_raw] if transports_raw else None

        credential = RegistrationCredential(
            id=credential_data['id'],
            raw_id=base64url_to_bytes(credential_data.get('rawId', credential_data['id'])),
            response=AuthenticatorAttestationResponse(
                client_data_json=base64url_to_bytes(resp['clientDataJSON']),
                attestation_object=base64url_to_bytes(resp['attestationObject']),
                transports=transports,
            ),
        )
        verification = verify_registration_response(
            credential=credential,
            expected_challenge=challenge_bytes,
            expected_rp_id=rp_id,
            expected_origin=origin,
            require_user_verification=True,
        )
    except Exception as e:
        return jsonify({'error': f'Vérification échouée : {str(e)}'}), 400

    passkey = Passkey(
        user_id=user.id,
        credential_id=verification.credential_id,
        public_key=verification.credential_public_key,
        sign_count=verification.sign_count,
        transports=[t for t in transports_raw] if transports_raw else [],
        device_name=device_name,
    )
    db.session.add(passkey)

    AuditLog.log(
        action=AuditLog.ACTION_PASSKEY_REGISTERED,
        user_id=user.id,
        details={'device_name': device_name},
        ip_address=get_client_ip(),
    )
    db.session.commit()

    return jsonify({
        'message': 'Passkey enregistrée avec succès',
        'passkey': passkey.to_dict(),
    }), 201


@auth_bp.route('/passkey', methods=['GET'])
@jwt_required()
def list_passkeys():
    """List all registered passkeys for the authenticated user."""
    current_user_id = int(get_jwt_identity())
    user = db.session.get(User, current_user_id)

    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404

    return jsonify({
        'passkeys': [p.to_dict() for p in user.passkeys],
    }), 200


@auth_bp.route('/passkey/<int:passkey_id>', methods=['DELETE'])
@jwt_required()
def delete_passkey(passkey_id):
    """
    Delete a registered passkey (must belong to the authenticated user).

    Rejected if it is the last passkey and TOTP is not active (2FA constraint).
    """
    current_user_id = int(get_jwt_identity())
    user = db.session.get(User, current_user_id)
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404

    passkey = Passkey.query.filter_by(id=passkey_id, user_id=current_user_id).first()
    if not passkey:
        return jsonify({'error': 'Passkey introuvable'}), 404

    # Contrainte : au moins une méthode 2FA doit rester active
    if user.passkeys.count() == 1 and not user.mfa_enabled:
        return jsonify({
            'error': "Impossible de supprimer la dernière passkey sans authentification par code active. "
                     "Activez d'abord l'authentification par code.",
        }), 409

    db.session.delete(passkey)

    AuditLog.log(
        action=AuditLog.ACTION_PASSKEY_DELETED,
        user_id=current_user_id,
        details={'passkey_id': passkey_id},
        ip_address=get_client_ip(),
    )
    db.session.commit()

    return jsonify({'message': 'Passkey supprimée'}), 200


@auth_bp.route('/passkey/<int:passkey_id>', methods=['PATCH'])
@limiter.limit("10 per minute")
@jwt_required()
def rename_passkey(passkey_id):
    """
    Rename a registered passkey.

    Body: { device_name }
    """
    current_user_id = int(get_jwt_identity())

    passkey = Passkey.query.filter_by(id=passkey_id, user_id=current_user_id).first()
    if not passkey:
        return jsonify({'error': 'Passkey introuvable'}), 404

    data = request.get_json()
    device_name = (data.get('device_name', '') if data else '').strip()
    if not device_name:
        return jsonify({'error': 'device_name requis'}), 400
    if len(device_name) > 100:
        return jsonify({'error': 'Le nom ne peut pas dépasser 100 caractères'}), 400

    old_name = passkey.device_name
    passkey.device_name = device_name
    AuditLog.log(
        action=AuditLog.ACTION_PASSKEY_RENAMED,
        user_id=current_user_id,
        details={'passkey_id': passkey_id, 'old_name': old_name, 'new_name': device_name},
        ip_address=get_client_ip(),
    )
    db.session.commit()

    return jsonify({'message': 'Passkey renommée', 'device_name': device_name}), 200
