from ...problems import Blueprint

user_bp = Blueprint(
    'user', __name__,
    description="The signed-in account: its profile, preferences, alerts and second factors",
)
