"""The published specification, and the client types generated from it, are only
as true as each operation's declared responses and security.
"""
import re

from conftest import probe_path

METHODS = ('get', 'post', 'put', 'patch', 'delete')

_ARGUMENT = re.compile(r'<(?:(\w+)(?:\([^)]*\))?:)?(\w+)>')

# Operations that predate the rule; each leaves this list as its domain is
# reworked, and the list goes with the last of them.
PENDING = frozenset({
    'GET /v1/analytics/overview',
    'GET /v1/analytics/publications',
    'GET /v1/analytics/satisfaction',
    'GET /v1/analytics/traffic',
    'GET /v1/audit-logs',
    'GET /v1/audit-logs/export',
    'GET /v1/org/catalog',
    'GET /v1/org/catalog/group',
    'GET /v1/org/sites',
    'GET /v1/public/unsubscribe/{token}',
    'POST /v1/public/unsubscribe/{token}',
})


def _documents_success(operation):
    return any(
        status == '204' or 'content' in response
        for status, response in operation.get('responses', {}).items()
        if status.startswith('2')
    )


def test_every_operation_documents_what_it_answers(client):
    spec = client.get('/v1/openapi.json').get_json()
    undocumented = {
        f'{method.upper()} {path}'
        for path, item in spec['paths'].items()
        for method, operation in item.items()
        if method in METHODS and not _documents_success(operation)
    }

    assert undocumented - PENDING == set(), 'declare a response schema for these'
    assert PENDING - undocumented == set(), 'documented or gone: take these off PENDING'


def test_the_documented_security_is_the_one_applied(app, client):
    """A route open to anyone, a session optional or not, answers without one;
    any other answers 401.
    """
    spec = client.get('/v1/openapi.json').get_json()
    default = spec.get('security', [])
    wrong = []
    for rule in app.url_map.iter_rules():
        operations = spec['paths'].get(_ARGUMENT.sub(r'{\2}', rule.rule))
        if operations is None:
            continue
        probe = probe_path(rule.rule)
        for method in sorted(rule.methods & {'GET', 'POST', 'PUT', 'PATCH', 'DELETE'}):
            security = operations[method.lower()].get('security', default)
            documented = security != [] and {} not in security
            if documented != (client.open(probe, method=method).status_code == 401):
                wrong.append(f"{method} {rule.rule} ({'session' if documented else 'public'})")

    assert not wrong, 'documented security differs from the route:\n' + '\n'.join(wrong)
