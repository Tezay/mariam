from flask_smorest import Blueprint

from ..problems import Problem
from ..schemas.public import DeviceSchema
from ..security import get_client_ip, limiter, public_limit
from ..services.votes import mint_device_id, throttle_device_mint

devices_bp = Blueprint('devices', __name__, description='Devices: the token a vote is cast with')


@devices_bp.route('', methods=['POST'])
@devices_bp.doc(security=[])
@limiter.limit(public_limit)
@devices_bp.response(201, DeviceSchema)
def create_device():
    """A signed device token, sent back as `Device-Id` when voting.

    The signature stops a client from minting its own identities; an hourly
    allowance bounds how many one address can collect.
    """
    if not throttle_device_mint(get_client_ip()):
        raise Problem(429, 'device_limit_reached', 'Trop de demandes, réessayez plus tard.')
    return {'device_id': mint_device_id()}
