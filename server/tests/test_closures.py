"""A site's exceptional closures: under way or to come for anyone, any range for its editors."""
import datetime

from app.extensions import db
from app.models import ExceptionalClosure
from app.utils.time import paris_today
from conftest import auth_headers, get_token, make_restaurant, make_user, site_path


def _day(offset=0):
    return (paris_today() + datetime.timedelta(days=offset)).isoformat()


def _editor(app, client):
    rid = make_restaurant(app)
    make_user(app, email='editor@mariam.app', role='editor', restaurant_id=rid)
    return f'{site_path(rid)}/closures', auth_headers(get_token(client, email='editor@mariam.app'))


def _close(client, path, headers, start, end, reason='Travaux'):
    return client.post(
        path, json={'start_date': _day(start), 'end_date': _day(end), 'reason': reason},
        headers=headers,
    )


def _reasons(res):
    return [closure['reason'] for closure in res.get_json()['items']]


class TestRead:
    def test_anyone_reads_those_under_way_or_to_come(self, app, client):
        path, headers = _editor(app, client)
        _close(client, path, headers, -10, -5, 'Passée')
        _close(client, path, headers, -1, 1, 'En cours')
        _close(client, path, headers, 20, 22, 'Plus tard')

        assert _reasons(client.get(path)) == ['En cours', 'Plus tard']
        assert _reasons(client.get(f'{path}?from={_day(-30)}')) == ['En cours', 'Plus tard']

    def test_an_editor_reads_those_that_overlap_any_range(self, app, client):
        path, headers = _editor(app, client)
        _close(client, path, headers, -10, -5, 'Passée')
        _close(client, path, headers, -1, 1, 'En cours')

        assert _reasons(client.get(f'{path}?to={_day(-3)}', headers=headers)) == ['Passée']
        assert _reasons(client.get(f'{path}?from={_day(1)}&to={_day(1)}', headers=headers)) == [
            'En cours'
        ]

    def test_an_inactive_closure_reads_as_deleted(self, app, client):
        path, headers = _editor(app, client)
        closure_id = _close(client, path, headers, 0, 0).get_json()['id']
        db.session.get(ExceptionalClosure, closure_id).is_active = False
        db.session.commit()

        assert client.get(path, headers=headers).get_json()['items'] == []
        assert client.delete(f'{path}/{closure_id}', headers=headers).status_code == 404


class TestWrite:
    def test_the_end_follows_the_start(self, app, client):
        path, headers = _editor(app, client)
        closure_id = _close(client, path, headers, 2, 3).get_json()['id']

        assert _close(client, path, headers, 3, 2).status_code == 422
        refused = client.patch(
            f'{path}/{closure_id}', json={'end_date': _day(1)}, headers=headers
        )
        assert refused.get_json()['errors'][0]['pointer'] == '/end_date'

    def test_a_new_start_sends_the_reminders_again(self, app, client):
        path, headers = _editor(app, client)
        closure_id = _close(client, path, headers, 2, 3).get_json()['id']
        closure = db.session.get(ExceptionalClosure, closure_id)
        closure.notified_7d = closure.notified_1d = True
        db.session.commit()

        client.patch(f'{path}/{closure_id}', json={'reason': 'Grève'}, headers=headers)
        assert db.session.get(ExceptionalClosure, closure_id).notified_7d is True
        client.patch(f'{path}/{closure_id}', json={'start_date': _day(1)}, headers=headers)
        assert db.session.get(ExceptionalClosure, closure_id).notified_7d is False

    def test_a_closure_is_deleted(self, app, client):
        path, headers = _editor(app, client)
        closure_id = _close(client, path, headers, 2, 3).get_json()['id']

        assert client.delete(f'{path}/{closure_id}', headers=headers).status_code == 204
        assert db.session.get(ExceptionalClosure, closure_id) is None
