"""An account holds a role per site, in any organization, and may supervise organizations."""
from app.extensions import db
from app.models import Organization, Restaurant, User
from conftest import join_site, make_restaurant, make_user, site_path, supervise
from tests.auth_support import confirmed_headers, session_headers


def _org(slug):
    org = Organization(name=slug.title(), slug=slug)
    db.session.add(org)
    db.session.commit()
    return org.id


def _site(code, org_id):
    return make_restaurant(None, name=code, code=code, organization_id=org_id)


def _restaurant(restaurant_id):
    return db.session.get(Restaurant, restaurant_id)


def _say_full(client, restaurant_id, headers):
    return client.put(
        f'{site_path(restaurant_id)}/live-status', json={'capacity_reached': True}, headers=headers
    )


class TestRolePerSite:
    def test_an_admin_here_is_an_editor_there(self, app, client):
        org = _org('crous-a')
        here, there = _site('RU_HERE', org), _site('RU_THERE', org)
        uid = make_user(None, role='admin', restaurant_id=here)
        join_site(uid, there, 'editor')
        headers = session_headers(uid)

        mine = client.patch(site_path(here), json={'tagline': 'Ici'}, headers=headers)
        theirs = client.patch(site_path(there), json={'tagline': 'Là'}, headers=headers)

        assert mine.status_code == 200
        assert theirs.get_json()['code'] == 'admin_required'
        assert _restaurant(there).tagline is None

    def test_sites_of_two_organizations(self, app, client):
        first, second = _site('RU_ONE', _org('crous-one')), _site('RU_TWO', _org('crous-two'))
        uid = make_user(None, role='editor', restaurant_id=first)
        join_site(uid, second, 'editor')
        headers = session_headers(uid)

        assert _say_full(client, first, headers).status_code == 200
        assert _say_full(client, second, headers).status_code == 200

    def test_a_site_out_of_reach_is_not_found_before_any_role_is_judged(self, app, client):
        mine, other = _site('RU_MINE', _org('crous-mine')), _site('RU_OTHER', _org('crous-other'))
        uid = make_user(None, role='editor', restaurant_id=mine)

        res = client.patch(site_path(other), json={'tagline': 'Prise'}, headers=session_headers(uid))

        assert res.status_code == 404
        assert res.get_json()['code'] == 'site_not_found'

    def test_a_supervisor_writes_where_it_is_also_a_member(self, app, client):
        org = _org('crous-sup')
        member, supervised = _site('RU_MEMBER', org), _site('RU_SUPERVISED', org)
        uid = make_user(None, role='org_admin', organization_id=org)
        join_site(uid, member, 'editor')
        headers = session_headers(uid)

        assert _say_full(client, member, headers).status_code == 200
        assert _say_full(client, supervised, headers).get_json()['code'] == 'supervisor_read_only'


    def test_a_supervisor_member_reads_as_a_supervisor_and_writes_as_its_role(
        self, app, client
    ):
        org = _org('crous-both')
        site = _site('RU_BOTH', org)
        uid = make_user(None, role='org_admin', organization_id=org)
        join_site(uid, site, 'editor')
        headers = session_headers(uid)

        members = client.get(f'{site_path(site)}/members', headers=headers)
        settings = client.patch(site_path(site), json={'tagline': 'Non'}, headers=headers)

        assert members.status_code == 200
        assert settings.get_json()['code'] == 'admin_required'


class TestTheAccount:
    def test_it_names_its_sites_and_its_supervisions(self, app, client):
        org = _org('crous-acc')
        site = _site('RU_ACC', _org('crous-site'))
        uid = make_user(None, role='org_admin', organization_id=org)
        join_site(uid, site, 'admin')

        body = client.get('/v1/user', headers=session_headers(uid)).get_json()

        assert body['sites'] == [{
            'slug': 'ru-acc', 'name': 'RU_ACC', 'role': 'admin',
            'organization': {'slug': 'crous-site', 'name': 'Crous-Site'},
        }]
        assert body['organizations'] == [{'slug': 'crous-acc', 'name': 'Crous-Acc'}]

    def test_the_previous_release_reads_its_oldest_place(self, app, client):
        org = _org('crous-old')
        first, second = _site('RU_FIRST', org), _site('RU_SECOND', org)
        uid = make_user(None, email='two@mariam.app', role='editor', restaurant_id=first)
        join_site(uid, second, 'admin')
        admin = make_user(None, email='admin@mariam.app', role='admin', restaurant_id=first)

        res = client.delete(
            f'{site_path(first)}/members/{uid}', headers=confirmed_headers(client, admin)
        )

        user = db.session.get(User, uid)
        assert res.status_code == 204
        assert (user.role, user.restaurant_id, user.organization_id) == ('admin', second, org)

    def test_a_place_copied_without_a_date_stays_the_oldest(self, app, client):
        org = _org('crous-undated')
        uid = make_user(
            None, email='undated@mariam.app', role='editor', restaurant_id=_site('RU_U', org)
        )
        user = db.session.get(User, uid)
        user.memberships[0].created_at = None
        db.session.commit()

        supervise(uid, org)

        assert (user.role, user.restaurant_id) == ('editor', user.memberships[0].restaurant_id)

    def test_its_last_place_taken_deletes_it(self, app, client):
        site = _site('RU_LAST', _org('crous-last'))
        uid = make_user(None, email='last@mariam.app', role='editor', restaurant_id=site)
        admin = make_user(None, email='admin@mariam.app', role='admin', restaurant_id=site)

        client.delete(f'{site_path(site)}/members/{uid}', headers=confirmed_headers(client, admin))

        assert db.session.get(User, uid) is None
