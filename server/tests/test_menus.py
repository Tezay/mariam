"""A site's menus: one address per day, drafts for its editors only."""
import datetime

from app.extensions import db
from app.models import AuditLog, DishCatalog, Menu, MenuImage, User
from app.utils.time import paris_today
from conftest import auth_headers, get_token, make_category, make_restaurant, make_user, site_path


def _day(offset=0):
    return (paris_today() + datetime.timedelta(days=offset)).isoformat()


def _editor_site(app, client, code='RU_A', email='a@mariam.app', role='admin'):
    rid = make_restaurant(app, name=code, code=code)
    make_user(app, email=email, role=role, restaurant_id=rid)
    return rid, site_path(rid), auth_headers(get_token(client, email=email))


def _put(client, headers, path, day, items=(), chef_note=None):
    return client.put(
        f'{path}/menus/{day}', json={'items': list(items), 'chef_note': chef_note}, headers=headers
    )


def _menu_with_item(app, client, headers, path, rid, day=None, name='Plat test'):
    category_id = make_category(app, rid)
    res = _put(client, headers, path, day or _day(), [{'category_id': category_id, 'name': name}])
    assert res.status_code in (200, 201), res.get_json()
    return category_id


class TestWriteMenu:
    def test_put_creates_then_replaces(self, app, client):
        rid, path, headers = _editor_site(app, client)
        category_id = make_category(app, rid)

        first = _put(client, headers, path, _day(), [{'category_id': category_id, 'name': 'Riz'}])
        assert first.status_code == 201
        item_id = first.get_json()['categories'][0]['items'][0]['id']

        again = _put(client, headers, path, _day(), [
            {'id': item_id, 'category_id': category_id},
            {'category_id': category_id, 'name': 'Pâtes'},
        ], chef_note='Bon appétit')
        assert again.status_code == 200
        menu = again.get_json()
        items = menu['categories'][0]['items']
        assert [item['dish']['name'] for item in items] == ['Riz', 'Pâtes']
        assert items[0]['id'] == item_id
        assert menu['chef_note'] == 'Bon appétit'
        assert menu['status'] == 'draft'

    def test_a_write_needs_a_session_before_its_body(self, app, client):
        rid = make_restaurant(app)
        assert client.put(f'{site_path(rid)}/menus/{_day()}', json=[]).status_code == 401

    def test_the_body_names_items_and_the_note(self, app, client):
        _, path, headers = _editor_site(app, client)
        res = client.put(f'{path}/menus/{_day()}', json={'items': []}, headers=headers)
        assert res.status_code == 422
        assert res.get_json()['errors'][0]['pointer'] == '/chef_note'

    def test_an_item_lands_in_a_category_of_the_site(self, app, client):
        _, path, headers = _editor_site(app, client)
        other = make_category(app, make_restaurant(app, name='RU B', code='RU_B'))

        res = _put(client, headers, path, _day(), [{'category_id': other, 'name': 'Intrus'}])

        assert res.status_code == 422
        assert res.get_json()['code'] == 'category_invalid'
        assert res.get_json()['errors'][0]['pointer'] == '/items/0/category_id'

    def test_patch_changes_the_note_within_its_length(self, app, client):
        rid, path, headers = _editor_site(app, client)
        _menu_with_item(app, client, headers, path, rid)

        res = client.patch(f'{path}/menus/{_day()}', json={'chef_note': 'Frites maison'}, headers=headers)
        assert res.get_json()['chef_note'] == 'Frites maison'
        too_long = client.patch(f'{path}/menus/{_day()}', json={'chef_note': 'x' * 301}, headers=headers)
        assert too_long.status_code == 422

    def test_delete_then_the_day_has_no_menu(self, app, client):
        rid, path, headers = _editor_site(app, client)
        _menu_with_item(app, client, headers, path, rid)

        assert client.delete(f'{path}/menus/{_day()}', headers=headers).status_code == 204
        missing = client.get(f'{path}/menus/{_day()}', headers=headers)
        assert missing.status_code == 404
        assert missing.get_json()['code'] == 'menu_not_found'


class TestPublish:
    def test_publish_and_unpublish(self, app, client):
        rid, path, headers = _editor_site(app, client)
        _menu_with_item(app, client, headers, path, rid)

        published = client.post(f'{path}/menus/{_day()}/publish', headers=headers).get_json()
        assert published['status'] == 'published'
        assert published['published_at'].endswith('+00:00')
        draft = client.post(f'{path}/menus/{_day()}/unpublish', headers=headers).get_json()
        assert draft['status'] == 'draft'

    def test_an_empty_menu_is_not_published(self, app, client):
        _, path, headers = _editor_site(app, client)
        _put(client, headers, path, _day())

        res = client.post(f'{path}/menus/{_day()}/publish', headers=headers)

        assert res.status_code == 409
        assert res.get_json()['code'] == 'menu_empty'

    def test_a_draft_cannot_be_unpublished(self, app, client):
        rid, path, headers = _editor_site(app, client)
        _menu_with_item(app, client, headers, path, rid)

        res = client.post(f'{path}/menus/{_day()}/unpublish', headers=headers)

        assert res.status_code == 409
        assert res.get_json()['code'] == 'menu_not_published'


class TestRead:
    def test_an_editor_reads_drafts_and_anyone_else_the_published(self, app, client):
        rid, path, headers = _editor_site(app, client)
        _menu_with_item(app, client, headers, path, rid, day=_day(0))
        _menu_with_item(app, client, headers, path, rid, day=_day(1), name='Brouillon')
        client.post(f'{path}/menus/{_day(0)}/publish', headers=headers)
        make_user(app, email='reader@mariam.app', role='reader', restaurant_id=rid)
        reader = auth_headers(get_token(client, email='reader@mariam.app'))

        mine = client.get(f'{path}/menus?from={_day(0)}&to={_day(1)}', headers=headers).get_json()
        assert [menu['status'] for menu in mine['items']] == ['published', 'draft']
        for caller in ({}, reader):
            seen = client.get(f'{path}/menus?from={_day(0)}&to={_day(1)}', headers=caller).get_json()
            assert [menu['date'] for menu in seen['items']] == [_day(0)]
            assert 'status' not in seen['items'][0]
            assert client.get(f'{path}/menus/{_day(1)}', headers=caller).status_code == 404

    def test_only_an_editor_sees_the_image_ids(self, app, client):
        rid, path, headers = _editor_site(app, client)
        _menu_with_item(app, client, headers, path, rid)
        client.post(f'{path}/menus/{_day()}/publish', headers=headers)
        menu = Menu.query.one()
        db.session.add(MenuImage(menu_id=menu.id, storage_key='k', url='https://img/1', order=0))
        db.session.commit()

        assert client.get(f'{path}/menus/{_day()}', headers=headers).get_json()['images'][0]['id']
        assert client.get(f'{path}/menus/{_day()}').get_json()['images'] == [
            {'url': 'https://img/1', 'order': 0}
        ]

    def test_an_editor_reads_past_the_window(self, app, client):
        rid, path, headers = _editor_site(app, client)
        _menu_with_item(app, client, headers, path, rid, day=_day(40))
        client.post(f'{path}/menus/{_day(40)}/publish', headers=headers)

        assert client.get(f'{path}/menus/{_day(40)}', headers=headers).status_code == 200
        assert client.get(f'{path}/menus/{_day(40)}').status_code == 404

    def test_a_session_read_is_not_stored_by_caches(self, app, client):
        rid, path, headers = _editor_site(app, client)
        _menu_with_item(app, client, headers, path, rid)

        res = client.get(f'{path}/menus/{_day()}', headers=headers)

        assert res.headers['Cache-Control'] == 'no-store'
        assert 'ETag' not in res.headers
        assert res.headers.get('Access-Control-Allow-Origin') != '*'


class TestOtherSites:
    def test_another_sites_editor_writes_nothing_and_reads_the_published(self, app, client):
        rid, path, headers = _editor_site(app, client)
        _menu_with_item(app, client, headers, path, rid)
        _, _, other = _editor_site(app, client, code='RU_B', email='b@mariam.app')

        assert client.get(f'{path}/menus/{_day()}', headers=other).status_code == 404
        for method, url in (
            ('PUT', f'{path}/menus/{_day()}'),
            ('PATCH', f'{path}/menus/{_day()}'),
            ('DELETE', f'{path}/menus/{_day()}'),
            ('POST', f'{path}/menus/{_day()}/publish'),
        ):
            res = client.open(url, method=method, json={'items': [], 'chef_note': None}, headers=other)
            assert res.status_code == 404, url
            assert res.get_json()['code'] == 'site_not_found'
        assert Menu.query.one().status == 'draft'

    def test_a_supervisor_reads_drafts_of_its_sites_and_writes_none(self, app, client):
        rid, path, headers = _editor_site(app, client)
        _menu_with_item(app, client, headers, path, rid)
        supervisor_id = make_user(app, email='sup@mariam.app', role='org_admin', restaurant_id=None)
        db.session.get(User, supervisor_id).organization_id = Menu.query.one().restaurant.organization_id
        db.session.commit()
        supervisor = auth_headers(get_token(client, email='sup@mariam.app'))

        assert client.get(f'{path}/menus/{_day()}', headers=supervisor).get_json()['status'] == 'draft'
        res = client.post(f'{path}/menus/{_day()}/publish', headers=supervisor)
        assert res.status_code == 403
        assert res.get_json()['code'] == 'supervisor_read_only'


class TestItemsImagesSubstitutes:
    def test_an_item_runs_out_and_comes_back(self, app, client):
        rid, path, headers = _editor_site(app, client)
        _menu_with_item(app, client, headers, path, rid)
        item_id = Menu.query.one().items[0].id

        res = client.patch(
            f'{path}/menus/{_day()}/items/{item_id}', json={'is_out_of_stock': True}, headers=headers
        )
        assert res.get_json()['is_out_of_stock'] is True
        missing = client.patch(
            f'{path}/menus/{_day()}/items/{item_id + 1}', json={'is_out_of_stock': True}, headers=headers
        )
        assert missing.get_json()['code'] == 'menu_item_not_found'

    def test_images_reorder_only_by_a_full_permutation(self, app, client):
        rid, path, headers = _editor_site(app, client)
        _menu_with_item(app, client, headers, path, rid)
        menu = Menu.query.one()
        images = [MenuImage(menu_id=menu.id, storage_key=f'k{n}', url=f'https://img/{n}', order=n)
                  for n in range(3)]
        db.session.add_all(images)
        db.session.commit()
        first, second, third = (image.id for image in images)

        partial = client.put(
            f'{path}/menus/{_day()}/images/order', json={'image_ids': [third, first]}, headers=headers
        )
        assert partial.get_json()['code'] == 'image_order_invalid'
        res = client.put(
            f'{path}/menus/{_day()}/images/order',
            json={'image_ids': [third, first, second]},
            headers=headers,
        )
        assert [image['id'] for image in res.get_json()['items']] == [third, first, second]

    def test_an_image_needs_the_storage(self, app, client):
        rid, path, headers = _editor_site(app, client)
        _menu_with_item(app, client, headers, path, rid)

        res = client.post(f'{path}/menus/{_day()}/images', data={'file': (b'x', 'a.jpg')},
                          headers=headers, content_type='multipart/form-data')

        assert res.status_code in (422, 503)

    def test_substitutes_come_from_the_site_three_at_most(self, app, client):
        rid, path, headers = _editor_site(app, client)
        category_id = _menu_with_item(app, client, headers, path, rid)
        dishes = [DishCatalog(restaurant_id=rid, category_id=category_id, name=f'Sub {n}')
                  for n in range(4)]
        db.session.add_all(dishes)
        db.session.commit()
        ids = [dish.id for dish in dishes]
        url = f'{path}/menus/{_day()}/substitutions/{category_id}'

        assert client.put(url, json={'dish_ids': ids}, headers=headers).status_code == 422
        other = make_restaurant(app, name='RU B', code='RU_B')
        stranger = DishCatalog(restaurant_id=other, category_id=make_category(app, other), name='Ailleurs')
        db.session.add(stranger)
        db.session.commit()
        assert client.put(url, json={'dish_ids': [stranger.id]}, headers=headers).get_json()['code'] == 'dish_invalid'

        res = client.put(url, json={'dish_ids': ids[1::-1]}, headers=headers)
        assert [sub['dish']['name'] for sub in res.get_json()['items']] == ['Sub 1', 'Sub 0']
        menu = client.get(f'{path}/menus/{_day()}', headers=headers).get_json()
        assert [sub['order'] for sub in menu['substitutions'][str(category_id)]] == [0, 1]


class TestNotificationPayloads:
    """Push bodies read the current item shape: a nested dish and a category_id."""

    def _items(self):
        return [
            {'id': 1, 'category_id': 10, 'dish_id': 5,
             'dish': {'id': 5, 'name': 'Poulet rôti'}, 'order': 0, 'is_out_of_stock': False},
            {'id': 2, 'category_id': 10, 'dish_id': 6,
             'dish': {'id': 6, 'name': 'Riz pilaf'}, 'order': 1, 'is_out_of_stock': False},
            {'id': 3, 'category_id': 20, 'dish_id': 7,
             'dish': {'id': 7, 'name': 'Tarte aux pommes'}, 'order': 0, 'is_out_of_stock': False},
        ]

    def test_format_menu_body_one_item_per_category(self):
        from app.services.notification_service import _format_menu_body
        body = _format_menu_body(self._items())
        assert body == '• Poulet rôti\n• Tarte aux pommes'

    def test_format_menu_body_skips_out_of_stock(self):
        from app.services.notification_service import _format_menu_body
        items = self._items()
        items[0]['is_out_of_stock'] = True
        body = _format_menu_body(items)
        assert body == '• Riz pilaf\n• Tarte aux pommes'

    def test_format_menu_body_empty(self):
        from app.services.notification_service import _format_menu_body
        assert _format_menu_body([]) is None

    def test_today_payload(self):
        from app.services.notification_service import build_today_menu_payload
        payload = build_today_menu_payload(self._items())
        assert payload is not None
        assert 'Poulet rôti' in payload['body']


class TestMenuAudit:
    """Draft saves are not audited; creating a menu and changing a published one are."""

    def test_draft_updates_not_audited(self, app, client):
        _, path, headers = _editor_site(app, client)
        for _ in range(3):
            _put(client, headers, path, _day())
        assert AuditLog.query.filter_by(action='menu_create').count() == 1
        assert AuditLog.query.filter_by(action='menu_update').count() == 0

    def test_published_update_audited_with_its_site(self, app, client):
        rid, path, headers = _editor_site(app, client)
        category_id = _menu_with_item(app, client, headers, path, rid)
        client.post(f'{path}/menus/{_day()}/publish', headers=headers)

        _put(client, headers, path, _day(), [{'category_id': category_id, 'name': 'Remplaçant'}])

        update = AuditLog.query.filter_by(action='menu_update').one()
        assert update.restaurant_id == rid
