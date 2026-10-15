"""The visitor's address: taken from X-Real-IP only when the deployment itself sent it."""
from app.security import get_client_ip


def _address(app, headers, peer='172.18.0.5'):
    with app.test_request_context(headers=headers, environ_base={'REMOTE_ADDR': peer}):
        return get_client_ip()


def test_the_proxy_names_the_visitor(app):
    assert _address(app, {'X-Real-IP': '203.0.113.7'}) == '203.0.113.7'


def test_a_client_reaching_the_api_directly_cannot_name_itself(app):
    assert _address(app, {'X-Real-IP': '203.0.113.7'}, peer='198.51.100.20') == '198.51.100.20'


def test_what_is_not_an_address_is_not_taken(app):
    assert _address(app, {'X-Real-IP': '203.0.113.7, 10.0.0.1'}) == '172.18.0.5'
