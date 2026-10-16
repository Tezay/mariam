from app.problems import MEDIA_TYPE, validation_issues


def test_an_unknown_route_answers_a_problem(client):
    res = client.get('/v1/nope')

    assert res.status_code == 404
    assert res.mimetype == MEDIA_TYPE
    assert res.get_json() == {
        'title': 'Not Found',
        'status': 404,
        'detail': 'Ressource introuvable.',
        'code': 'not_found',
    }


def test_a_refused_method_names_the_allowed_ones(client):
    res = client.delete('/v1/taxonomy')

    assert res.status_code == 405
    assert res.get_json()['code'] == 'method_not_allowed'
    assert 'GET' in res.headers['Allow']


def test_an_invalid_body_points_at_the_field(client):
    res = client.post('/v1/auth/login', json={'email': 'not-an-email', 'password': 'x'})

    assert res.status_code == 422
    assert res.mimetype == MEDIA_TYPE
    body = res.get_json()
    assert body['code'] == 'validation_failed'
    assert [issue['pointer'] for issue in body['errors']] == ['/email']


def test_an_unhandled_exception_keeps_its_details_inside(app, client, monkeypatch):
    def broken():
        raise RuntimeError('postgres://user:secret@db/mariam')

    monkeypatch.setitem(app.config, 'PROPAGATE_EXCEPTIONS', False)
    monkeypatch.setitem(app.view_functions, 'taxonomy.get_taxonomy', broken)

    res = client.get('/v1/taxonomy')

    assert res.status_code == 500
    assert res.get_json()['code'] == 'internal_error'
    assert b'secret' not in res.data


def test_validation_messages_flatten_to_one_issue_each():
    messages = {
        'json': {
            'items': {0: {'name': ['Requis.']}},
            'a/b': ['Invalide.'],
            '_schema': ['Dates inversées.'],
        },
        'query': {'page': ['Doit être positif.', 'Trop grand.']},
    }

    assert validation_issues(messages) == [
        {'pointer': '/items/0/name', 'detail': 'Requis.'},
        {'pointer': '/a~1b', 'detail': 'Invalide.'},
        {'pointer': '', 'detail': 'Dates inversées.'},
        {'parameter': 'page', 'detail': 'Doit être positif.'},
        {'parameter': 'page', 'detail': 'Trop grand.'},
    ]
