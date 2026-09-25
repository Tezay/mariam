import base64
import io
import json
from datetime import timedelta

import pyotp
import qrcode
from flask import current_app, jsonify, request
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    decode_token,
)

from ...extensions import db
from ...models import ActivationLink, AuditLog, Passkey, User
from ...schemas import (
    ActivateAccountSchema,
    ErrorSchema,
    LoginResponseSchema,
)
from ...security import get_client_ip, limiter
from ._webauthn import (
    _decode_challenge_token,
    _detect_device_name,
    _get_webauthn_config,
    _make_challenge_token,
)
from .blueprint import auth_bp
from .login import complete_login


@auth_bp.route('/activate', methods=['POST'])
@limiter.limit("3 per minute")
@auth_bp.arguments(ActivateAccountSchema)
@auth_bp.response(201, LoginResponseSchema)
@auth_bp.alt_response(400, schema=ErrorSchema, description="Invalid token or weak password")
def activate_account(data):
    """
    Activate an account via an invitation link.

    Returns MFA setup QR code for immediate configuration.
    """
    token = data.get('token')
    password = data.get('password')
    username = data.get('username')

    if not token or not password:
        return jsonify({'error': 'Token et mot de passe requis'}), 400

    link = ActivationLink.query.filter_by(token=token).first()

    if not link:
        return jsonify({'error': "Lien d'activation invalide"}), 404

    if not link.is_valid():
        return jsonify({'error': "Lien d'activation expiré ou déjà utilisé"}), 400

    if not User.validate_password_strength(password):
        return jsonify({
            'error': 'Mot de passe trop faible',
            'message': 'Le mot de passe doit contenir au moins 12 caractères, '
                       'une majuscule, une minuscule, un chiffre et un caractère spécial.'
        }), 400

    email = data.get('email') or link.email
    if not email:
        return jsonify({'error': 'Email requis'}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'Cet email est déjà utilisé'}), 409

    user = User(
        email=email,
        username=username,
        role=link.role,
        restaurant_id=link.restaurant_id,
        organization_id=link.organization_id,
    )
    user.set_password(password)

    mfa_secret = pyotp.random_base32()
    user.mfa_secret = mfa_secret
    user.mfa_enabled = False

    link.mark_as_used()
    db.session.add(user)

    AuditLog.log(
        action=AuditLog.ACTION_ACCOUNT_ACTIVATE,
        user_id=None,
        restaurant_id=link.restaurant_id,
        target_type='user',
        details={'email': email, 'role': link.role, 'link_type': link.link_type},
        ip_address=get_client_ip()
    )

    db.session.commit()

    issuer = current_app.config.get('MFA_ISSUER_NAME', 'MARIAM')
    totp = pyotp.TOTP(mfa_secret)
    provisioning_uri = totp.provisioning_uri(name=email, issuer_name=issuer)

    qr = qrcode.QRCode(version=1, box_size=5, border=2)
    qr.add_data(provisioning_uri)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")

    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    qr_base64 = base64.b64encode(buffer.getvalue()).decode()

    return jsonify({
        'message': 'Compte créé avec succès',
        'user': user.to_dict(include_tenant=True),
        'mfa_setup': {
            'qr_code': f'data:image/png;base64,{qr_base64}',
            'secret': mfa_secret,
            'user_id': user.id,
            'setup_token': _make_setup_token(user.id),
        }
    }), 201


@auth_bp.route('/mfa/verify-setup', methods=['POST'])
@limiter.limit("5 per minute")
@auth_bp.response(200, LoginResponseSchema)
@auth_bp.alt_response(401, schema=ErrorSchema, description="Invalid TOTP code")
def verify_mfa_setup():
    """
    Confirm MFA setup by verifying a TOTP code.

    On success, MFA is enabled and full JWT tokens are returned.
    Requires a setup_token issued by the activate endpoint.
    """
    data = request.get_json()

    if not data:
        return jsonify({'error': 'Données manquantes'}), 400

    user_id = data.get('user_id')
    code = data.get('code')
    setup_token = data.get('setup_token')

    if not user_id or not code:
        return jsonify({'error': 'ID utilisateur et code requis'}), 400

    if not setup_token:
        return jsonify({'error': 'setup_token requis'}), 400

    try:
        decoded = decode_token(setup_token)
        if not decoded.get('setup_phase') or int(decoded['sub']) != int(user_id):
            return jsonify({'error': 'setup_token invalide'}), 401
    except Exception:
        return jsonify({'error': 'setup_token invalide ou expiré'}), 401

    user = db.session.get(User, user_id)
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404

    if user.mfa_enabled:
        return jsonify({'error': 'MFA déjà activé'}), 400

    totp = pyotp.TOTP(user.mfa_secret)
    if not totp.verify(code, valid_window=1):
        return jsonify({'error': 'Code invalide'}), 401

    user.mfa_enabled = True

    AuditLog.log(
        action=AuditLog.ACTION_MFA_SETUP,
        user_id=user.id,
        ip_address=get_client_ip()
    )

    db.session.commit()

    access_token = create_access_token(identity=str(user.id))
    refresh_token = create_refresh_token(identity=str(user.id))

    return jsonify({
        'message': 'MFA activé avec succès',
        'user': user.to_dict(include_tenant=True),
        'access_token': access_token,
        'refresh_token': refresh_token
    }), 200


@auth_bp.route('/check-activation/<token>', methods=['GET'])
@auth_bp.response(200, LoginResponseSchema)
@auth_bp.alt_response(404, schema=ErrorSchema, description="Invalid or expired link")
def check_activation_link(token):
    """Verify if an activation link is valid before showing the form."""
    link = ActivationLink.query.filter_by(token=token).first()

    if not link:
        return jsonify({'valid': False, 'error': 'Lien invalide'}), 404

    if not link.is_valid():
        return jsonify({'valid': False, 'error': 'Lien expiré ou déjà utilisé'}), 400

    return jsonify({
        'valid': True,
        'link_type': link.link_type,
        'email': link.email,
        'role': link.role
    }), 200


def _make_setup_token(user_id: int) -> str:
    """
    Issue a short-lived setup token (15 min) used exclusively during account
    activation to authorise passkey registration and TOTP verification.

    Accepted ONLY by passkey_setup_begin, passkey_setup_complete, and
    verify_mfa_setup. Blocked on all regular @jwt_required() endpoints by
    the check_if_token_revoked callback (setup_phase claim).
    """
    return create_access_token(
        identity=str(user_id),
        additional_claims={'setup_phase': True},
        expires_delta=timedelta(minutes=15),
    )


@auth_bp.route('/passkey/setup/begin', methods=['POST'])
@limiter.limit("10 per minute")
def passkey_setup_begin():
    """
    Start passkey registration during account activation.

    Uses resident_key=REQUIRED so the passkey is discoverable
    (required for passwordless login).
    Body: { user_id }
    """
    from webauthn import generate_registration_options, options_to_json
    from webauthn.helpers.cose import COSEAlgorithmIdentifier
    from webauthn.helpers.structs import (
        AuthenticatorSelectionCriteria,
        ResidentKeyRequirement,
        UserVerificationRequirement,
    )

    data = request.get_json()
    if not data:
        return jsonify({'error': 'Données manquantes'}), 400

    user_id = data.get('user_id')
    setup_token = data.get('setup_token')

    if not user_id:
        return jsonify({'error': 'user_id requis'}), 400

    if not setup_token:
        return jsonify({'error': 'setup_token requis'}), 400

    try:
        decoded = decode_token(setup_token)
        if not decoded.get('setup_phase') or int(decoded['sub']) != int(user_id):
            return jsonify({'error': 'setup_token invalide'}), 401
    except Exception:
        return jsonify({'error': 'setup_token invalide ou expiré'}), 401

    user = db.session.get(User, int(user_id))
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404

    if user.mfa_enabled:
        return jsonify({'error': 'Compte déjà activé avec TOTP'}), 400

    rp_id, rp_name, _ = _get_webauthn_config()

    options = generate_registration_options(
        rp_id=rp_id,
        rp_name=rp_name,
        user_id=str(user.id).encode(),
        user_name=user.email,
        user_display_name=user.username or user.email,
        exclude_credentials=[],
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.REQUIRED,  # obligatoire pour le login discoverable
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
        supported_pub_key_algs=[
            COSEAlgorithmIdentifier.ECDSA_SHA_256,
            COSEAlgorithmIdentifier.RSASSA_PKCS1_v1_5_SHA_256,
        ],
    )

    challenge_token = _make_challenge_token(user.id, options.challenge)
    options_dict = json.loads(options_to_json(options))

    return jsonify({
        'options': options_dict,
        'challenge_token': challenge_token,
    }), 200


@auth_bp.route('/passkey/setup/complete', methods=['POST'])
@limiter.limit("10 per minute")
def passkey_setup_complete():
    """
    Finalize passkey registration during account activation.

    Stores the passkey and returns access JWTs (immediate login).
    Body: { user_id, challenge_token, credential, device_name? }
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

    user_id = data.get('user_id')
    challenge_token = data.get('challenge_token')
    credential_data = data.get('credential')
    device_name = data.get('device_name', '').strip() or _detect_device_name(request.headers.get('User-Agent', ''))

    if not user_id or not challenge_token or not credential_data:
        return jsonify({'error': 'user_id, challenge_token et credential requis'}), 400

    user = db.session.get(User, int(user_id))
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404

    if user.mfa_enabled:
        return jsonify({'error': 'Compte déjà activé avec TOTP'}), 400

    try:
        token_user_id, challenge_bytes = _decode_challenge_token(challenge_token)
    except Exception:
        return jsonify({'error': 'challenge_token invalide ou expiré'}), 401

    if token_user_id != int(user_id):
        return jsonify({'error': 'Token invalide'}), 401

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
        action=AuditLog.ACTION_PASSKEY_SETUP,
        user_id=user.id,
        details={'device_name': device_name},
        ip_address=get_client_ip(),
    )
    db.session.commit()

    return complete_login(user)
