"""A site's menu categories: one level of subcategories, ordered, some protected."""
from app.extensions import db
from app.models import MenuCategory
from conftest import auth_headers, get_token, make_category, make_restaurant, make_user, site_path


def _admin(app, client, role='admin'):
    rid = make_restaurant(app)
    make_user(app, email=f'{role}@mariam.app', role=role, restaurant_id=rid)
    headers = auth_headers(get_token(client, email=f'{role}@mariam.app'))
    return rid, f'{site_path(rid)}/categories', headers


class TestRead:
    def test_a_session_is_needed(self, app, client):
        rid = make_restaurant(app)
        assert client.get(f'{site_path(rid)}/categories').status_code == 401

    def test_the_tree_in_order(self, app, client):
        rid, path, headers = _admin(app, client)
        second = make_category(app, rid, label='Dessert', order=1)
        first = make_category(app, rid, label='Entrées', order=0)
        db.session.add(MenuCategory(restaurant_id=rid, parent_id=second, label='Fruits', order=0))
        db.session.commit()

        items = client.get(path, headers=headers).get_json()['items']

        assert [item['id'] for item in items] == [first, second]
        assert [sub['label'] for sub in items[1]['subcategories']] == ['Fruits']


class TestCreate:
    def test_a_category_comes_last_with_the_next_colour(self, app, client):
        rid, path, headers = _admin(app, client)
        make_category(app, rid)

        res = client.post(path, json={'label': ' Soupes '}, headers=headers)

        assert res.status_code == 201
        assert res.get_json() | {'id': 0} == {
            'id': 0, 'parent_id': None, 'label': 'Soupes', 'order': 1, 'is_protected': False,
            'is_highlighted': False, 'color_key': 'indigo', 'subcategories': [],
        }

    def test_a_subcategory_hangs_from_a_top_level_category_of_the_site(self, app, client):
        rid, path, headers = _admin(app, client)
        parent = make_category(app, rid)
        child = client.post(path, json={'label': 'Viandes', 'parent_id': parent}, headers=headers)
        foreign = make_category(app, make_restaurant(app, name='RU B', code='RU_B'))

        assert child.get_json()['parent_id'] == parent
        for parent_id in (child.get_json()['id'], foreign):
            res = client.post(path, json={'label': 'Trop', 'parent_id': parent_id}, headers=headers)
            assert res.get_json()['code'] == 'category_invalid'

    def test_a_blank_label_is_refused(self, app, client):
        _, path, headers = _admin(app, client)
        assert client.post(path, json={'label': '   '}, headers=headers).status_code == 422

    def test_only_an_admin_creates_one(self, app, client):
        _, path, headers = _admin(app, client, role='editor')
        assert client.post(path, json={'label': 'Soupes'}, headers=headers).status_code == 403


class TestPatch:
    def test_label_highlight_and_colour(self, app, client):
        rid, path, headers = _admin(app, client)
        category = make_category(app, rid)

        res = client.patch(
            f'{path}/{category}',
            json={'label': 'Plats', 'is_highlighted': True, 'color_key': 'mint'},
            headers=headers,
        )

        assert {key: res.get_json()[key] for key in ('label', 'is_highlighted', 'color_key')} == {
            'label': 'Plats', 'is_highlighted': True, 'color_key': 'mint',
        }

    def test_a_colour_comes_from_the_palette(self, app, client):
        rid, path, headers = _admin(app, client)
        category = make_category(app, rid)
        res = client.patch(f'{path}/{category}', json={'color_key': 'green'}, headers=headers)
        assert res.status_code == 422

    def test_an_unknown_category_is_not_found(self, app, client):
        _, path, headers = _admin(app, client)
        res = client.patch(f'{path}/99999', json={'label': 'X'}, headers=headers)
        assert res.get_json()['code'] == 'category_not_found'


class TestOrder:
    def test_a_whole_level_is_ordered_at_once(self, app, client):
        rid, path, headers = _admin(app, client)
        first, second, third = (make_category(app, rid, label=f'C{n}', order=n) for n in range(3))
        db.session.add(MenuCategory(restaurant_id=rid, parent_id=first, label='Sous', order=0))
        db.session.commit()
        sub = MenuCategory.query.filter_by(label='Sous').one().id

        res = client.put(f'{path}/order', json={'category_ids': [third, first, second]}, headers=headers)

        assert [item['id'] for item in res.get_json()['items']] == [third, first, second]
        for partial in ([third, first], [third, first, second, sub], [third, first, first]):
            refused = client.put(f'{path}/order', json={'category_ids': partial}, headers=headers)
            assert refused.get_json()['code'] == 'category_order_invalid'


class TestDelete:
    def test_an_empty_category_goes(self, app, client):
        rid, path, headers = _admin(app, client)
        category = make_category(app, rid)
        assert client.delete(f'{path}/{category}', headers=headers).status_code == 204
        assert db.session.get(MenuCategory, category) is None

    def test_a_protected_category_stays(self, app, client):
        rid, path, headers = _admin(app, client)
        db.session.add(MenuCategory(restaurant_id=rid, label='Plat principal', is_protected=True))
        db.session.commit()
        protected = MenuCategory.query.filter_by(label='Plat principal').one().id

        res = client.delete(f'{path}/{protected}', headers=headers)

        assert res.status_code == 409
        assert res.get_json()['code'] == 'category_protected'
