"""Today's state of a site's service: said by its team, read by anyone."""
from datetime import timedelta

from app.extensions import db
from app.models import Restaurant, User
from app.utils.time import paris_today
from conftest import auth_headers, get_token, make_restaurant, make_user, site_path


def _site(app, client):
    rid = make_restaurant(app)
    make_user(app, email='editor@mariam.app', role='editor', restaurant_id=rid)
    return rid, site_path(rid), auth_headers(get_token(client, email='editor@mariam.app'))


def _say(client, path, headers, reached):
    return client.put(f'{path}/live-status', json={'capacity_reached': reached}, headers=headers)


class TestLiveStatus:
    def test_nothing_said_reads_as_not_reached(self, app, client):
        _, path, _ = _site(app, client)

        assert client.get(f'{path}/live-status').get_json() == {
            'capacity_reached': False, 'reached_at': None,
        }

    def test_an_editor_says_it_is_reached_then_takes_it_back(self, app, client):
        _, path, headers = _site(app, client)

        said = _say(client, path, headers, True).get_json()
        seen = client.get(f'{path}/live-status').get_json()
        taken_back = _say(client, path, headers, False).get_json()

        assert said['capacity_reached'] and said['reached_at']
        assert seen == said
        assert taken_back == {'capacity_reached': False, 'reached_at': None}

    def test_saying_it_again_keeps_the_hour_it_filled(self, app, client):
        _, path, headers = _site(app, client)

        first = _say(client, path, headers, True).get_json()['reached_at']

        assert _say(client, path, headers, True).get_json()['reached_at'] == first

    def test_it_lapses_with_the_day(self, app, client, monkeypatch):
        _, path, headers = _site(app, client)
        _say(client, path, headers, True)

        monkeypatch.setattr('app.routes.sites.paris_today', lambda: paris_today() + timedelta(days=1))

        assert client.get(f'{path}/live-status').get_json()['capacity_reached'] is False

    def test_a_supervisor_reads_it_but_never_says_it(self, app, client):
        rid, path, _ = _site(app, client)
        supervisor = make_user(app, email='dir@mariam.app', role='org_admin', restaurant_id=None)
        db.session.get(User, supervisor).organization_id = db.session.get(Restaurant, rid).organization_id
        db.session.commit()
        headers = auth_headers(get_token(client, email='dir@mariam.app'))

        assert client.get(f'{path}/live-status', headers=headers).status_code == 200
        assert _say(client, path, headers, True).get_json()['code'] == 'supervisor_read_only'

    def test_another_site_is_not_found(self, app, client):
        _, _, headers = _site(app, client)
        other = make_restaurant(app, name='RU Autre', code='RU_AUTRE')

        assert _say(client, site_path(other), headers, True).get_json()['code'] == 'site_not_found'

