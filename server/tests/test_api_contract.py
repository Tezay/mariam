"""The published specification, and the client types generated from it, are only
as true as each operation's declared responses.
"""

METHODS = ('get', 'post', 'put', 'patch', 'delete')

# Operations that predate the rule; each leaves this list as its domain is
# reworked, and the list goes with the last of them.
PENDING = frozenset({
    'DELETE /v1/catalog/{dish_id}',
    'DELETE /v1/catalog/{dish_id}/image',
    'GET /v1/analytics/overview',
    'GET /v1/analytics/publications',
    'GET /v1/analytics/satisfaction',
    'GET /v1/analytics/traffic',
    'GET /v1/audit-logs',
    'GET /v1/audit-logs/export',
    'GET /v1/catalog',
    'GET /v1/catalog/export',
    'GET /v1/catalog/stats',
    'GET /v1/catalog/{dish_id}',
    'GET /v1/catalog/{dish_id}/stats',
    'GET /v1/menus/jours-feries/{year}',
    'GET /v1/menus/vacances-scolaires/{year}',
    'GET /v1/menus/{menu_id}/substitutions',
    'GET /v1/org/catalog',
    'GET /v1/org/catalog/group',
    'GET /v1/org/sites',
    'GET /v1/public/org',
    'GET /v1/public/unsubscribe/{token}',
    'GET /v1/public/{restaurant_slug}/closures',
    'GET /v1/public/{restaurant_slug}/events',
    'GET /v1/public/{restaurant_slug}/restaurant',
    'GET /v1/public/{restaurant_slug}/today',
    'GET /v1/public/{restaurant_slug}/tomorrow',
    'GET /v1/public/{restaurant_slug}/vote',
    'GET /v1/public/{restaurant_slug}/week',
    'POST /v1/catalog',
    'POST /v1/catalog/bulk/category',
    'POST /v1/catalog/bulk/delete',
    'POST /v1/catalog/bulk/labels',
    'POST /v1/catalog/{dish_id}/image',
    'POST /v1/public/device',
    'POST /v1/public/track',
    'POST /v1/public/unsubscribe/{token}',
    'POST /v1/public/{restaurant_slug}/vote',
    'PUT /v1/catalog/{dish_id}',
    'PUT /v1/menus/{menu_id}/substitutions/{category_id}',
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
