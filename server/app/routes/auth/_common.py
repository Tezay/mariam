import time

from flask import jsonify
from flask_jwt_extended import create_access_token, create_refresh_token

from ...extensions import db
from ...models import AuditLog, User
from ...security import blacklist_token, get_client_ip

NO_SESSION = 'No valid session.'


def token_pair(user: User) -> dict[str, str]:
    identity = str(user.id)
    return {
        'access_token': create_access_token(identity=identity),
        'refresh_token': create_refresh_token(identity=identity),
    }


def revoke_until_expiry(claims: dict) -> None:
    if claims.get('jti') and claims.get('exp'):
        blacklist_token(claims['jti'], max(1, int(claims['exp'] - time.time())))


def complete_login(user: User):
    """Opens the session once every factor has been checked."""
    # Checked here too: an account can be disabled between two sign-in steps.
    if not user.is_active:
        return account_disabled()

    user.update_last_login()
    AuditLog.log(action=AuditLog.ACTION_LOGIN, user_id=user.id, ip_address=get_client_ip())
    db.session.commit()

    return jsonify({
        'message': 'Connexion réussie',
        'user': user.to_dict(include_tenant=True),
        **token_pair(user),
    }), 200


def account_disabled():
    return jsonify({'error': 'Ce compte est désactivé'}), 403


def user_not_found():
    return jsonify({'error': 'Utilisateur non trouvé'}), 404


def weak_password():
    return jsonify({
        'error': 'Mot de passe trop faible',
        'message': 'Le mot de passe doit contenir au moins 12 caractères, '
                   'une majuscule, une minuscule, un chiffre et un caractère spécial.',
    }), 400
