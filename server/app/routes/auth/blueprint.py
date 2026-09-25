from flask_smorest import Blueprint

auth_bp = Blueprint(
    'auth',
    __name__,
    description='Authentication — Login, MFA, password management'
)
