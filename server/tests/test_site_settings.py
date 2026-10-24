"""A site's settings: one address with its public page, written by its admins."""
import re
from pathlib import Path

import pytest

from app.data.site_profile import PAYMENT_METHODS
from app.extensions import db
from app.models import MenuCategory, Restaurant
from app.models.taxonomy import DietaryTag, DietaryTagCategory
from conftest import auth_headers, get_token, make_category, make_restaurant, make_user, site_path

SETTINGS_SHARED = (
    Path(__file__).resolve().parents[2] / 'client/src/pages/admin/settings/settings-shared.ts'
)
CATEGORY_COLORS = Path(__file__).resolve().parents[2] / 'client/src/lib/category-colors.ts'


def _site(app, client, role='admin'):
    rid = make_restaurant(app)
    make_user(app, email=f'{role}@mariam.app', role=role, restaurant_id=rid)
    return rid, site_path(rid), auth_headers(get_token(client, email=f'{role}@mariam.app'))


class TestRead:
    def test_the_vote_categories_are_for_the_sites_editors(self, app, client):
        _, path, headers = _site(app, client)

        assert 'vote_category_ids' in client.get(path, headers=headers).get_json()
        assert 'vote_category_ids' not in client.get(path).get_json()


class TestPatch:
    def test_an_admin_changes_the_details(self, app, client):
        rid, path, headers = _site(app, client)

        res = client.patch(path, json={'name': 'RU Nord', 'capacity': 120}, headers=headers)

        assert res.get_json()['name'] == 'RU Nord'
        assert db.session.get(Restaurant, rid).capacity == 120

    def test_only_an_admin_changes_them(self, app, client):
        _, path, headers = _site(app, client, role='editor')

        res = client.patch(path, json={'name': 'Test'}, headers=headers)

        assert res.status_code == 403
        assert res.get_json()['code'] == 'admin_required'

    @pytest.mark.parametrize('body', [
        {'service_days': [7]},
        {'service_hours': {'0': {'open': '25:00', 'close': '14:00'}}},
        {'service_hours': {'0': {'open': '14:00', 'close': '11:30'}}},
        {'service_hours': {'7': {'open': '11:30', 'close': '14:00'}}},
        {'payment_methods': ['cheque']},
        {'email': 'pas-une-adresse'},
        {'capacity': -1},
    ])
    def test_a_value_out_of_its_rule_is_refused(self, app, client, body):
        _, path, headers = _site(app, client)

        assert client.patch(path, json=body, headers=headers).status_code == 422

    def test_hours_replace_the_previous_ones(self, app, client):
        _, path, headers = _site(app, client)
        both = {'0': {'open': '11:30', 'close': '14:00'}, '1': {'open': '11:00', 'close': '13:30'}}
        client.patch(path, json={'service_hours': both}, headers=headers)

        res = client.patch(path, json={'service_hours': {'1': both['1']}}, headers=headers)

        assert res.get_json()['service_hours'] == {'1': both['1']}

    def test_a_vote_category_comes_from_the_site(self, app, client):
        rid, path, headers = _site(app, client)
        own = make_category(app, rid)
        foreign = make_category(app, make_restaurant(app, name='RU B', code='RU_B'))

        refused = client.patch(path, json={'vote_category_ids': [own, foreign]}, headers=headers)
        kept = client.patch(path, json={'vote_category_ids': [own]}, headers=headers)

        assert refused.get_json()['errors'][0]['pointer'] == '/vote_category_ids/1'
        assert kept.get_json()['vote_category_ids'] == [own]

    def test_labels_name_known_tags(self, app, client):
        rid, path, headers = _site(app, client)
        db.session.add(DietaryTagCategory(id='regime', name='Régime'))
        db.session.add(DietaryTag(id='vegetarian', label='Végétarien', icon='leaf',
                                  color='#22c55e', category_id='regime'))
        db.session.commit()

        refused = client.patch(path, json={'tag_ids': ['vegetarian', 'unknown']}, headers=headers)
        kept = client.patch(path, json={'tag_ids': ['vegetarian']}, headers=headers)

        assert refused.get_json()['code'] == 'tag_invalid'
        assert [tag['id'] for tag in kept.get_json()['dietary_tags']] == ['vegetarian']
        assert db.session.get(Restaurant, rid).tags_customized is True


class TestSiteName:
    def _rename(self, app, client, name):
        rid, path, headers = _site(app, client)
        res = client.patch(path, json={'name': name}, headers=headers)
        return res, db.session.get(Restaurant, rid).name

    @pytest.mark.parametrize('name', [
        "Resto U' Créteil", 'RU n°2 – bât. B', 'R.U. Nord', 'Crous & Go (Saclay)', 'x' * 50,
    ])
    def test_an_ordinary_name_is_kept(self, app, client, name):
        res, stored = self._rename(app, client, name)

        assert res.status_code == 200
        assert stored == name

    def test_stray_whitespace_is_collapsed(self, app, client):
        res, stored = self._rename(app, client, '  RU \n  Nord ')

        assert res.status_code == 200
        assert stored == 'RU Nord'

    @pytest.mark.parametrize('name', [
        '', '   ', 'x' * 51, 'RU https://exemple.com', 'exemple.com', 'www.exemple.com',
        'contact@exemple', 'RU Nord/Sud', 'RU Nord\\Sud', 'RU : Nord', 'St.Denis', 'RU\x00Nord',
    ])
    def test_a_name_empty_too_long_or_carrying_an_address_is_refused(self, app, client, name):
        res, stored = self._rename(app, client, name)

        assert res.status_code == 422
        assert stored == 'RU Test'


class TestCalendarSettings:
    def test_a_member_reads_them_and_an_admin_changes_them(self, app, client):
        rid, path, headers = _site(app, client)
        make_user(app, email='reader@mariam.app', role='reader', restaurant_id=rid)
        reader = auth_headers(get_token(client, email='reader@mariam.app'))

        assert client.get(f'{path}/calendar-settings', headers=reader).get_json() == {
            'show_public_holidays': True, 'show_school_vacations': False, 'school_vacation_zone': None,
        }
        changed = client.patch(
            f'{path}/calendar-settings',
            json={'show_school_vacations': True, 'school_vacation_zone': 'C'},
            headers=headers,
        )
        assert changed.get_json()['school_vacation_zone'] == 'C'
        assert client.patch(
            f'{path}/calendar-settings', json={'school_vacation_zone': 'D'}, headers=headers
        ).status_code == 422
        assert client.patch(
            f'{path}/calendar-settings', json={'show_public_holidays': False}, headers=reader
        ).status_code == 403


@pytest.mark.skipif(not SETTINGS_SHARED.exists(), reason='the client sources are not mounted here')
def test_the_client_offers_every_payment_method():
    offered = re.findall(r"\{ id: '(\w+)'", SETTINGS_SHARED.read_text())

    assert tuple(offered) == PAYMENT_METHODS


@pytest.mark.skipif(not CATEGORY_COLORS.exists(), reason='the client sources are not mounted here')
def test_the_client_draws_every_category_colour():
    source = CATEGORY_COLORS.read_text()
    drawn = re.findall(r'^  (\w+): \{', source.split('COLOR_KEY_MAP')[1], re.M)

    assert tuple(drawn) == MenuCategory.COLOR_KEYS
