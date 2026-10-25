"""The published specification, and the client types generated from it, are only
as true as each operation's declared responses and security.
"""
import re

from conftest import probe_path

METHODS = ('get', 'post', 'put', 'patch', 'delete')

_ARGUMENT = re.compile(r'<(?:(\w+)(?:\([^)]*\))?:)?(\w+)>')


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

    assert undocumented == set(), 'declare a response schema for these'


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
