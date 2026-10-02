from flask_smorest import Blueprint

auth_bp = Blueprint(
    'auth', __name__, description='Sign-in, second factors, passwords and sessions.'
)
