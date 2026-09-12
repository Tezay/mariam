"""
Tests du catalogue de plats : CRUD, contrôle des rôles, isolation multi-restaurant.
"""
from conftest import auth_headers, get_token, make_category, make_restaurant, make_user


def _category_for(client, token):
    """A dish now requires a category: reuse the site's first, creating it if needed."""
    from app.extensions import db
    from app.models import MenuCategory

    settings = client.get('/v1/settings', headers=auth_headers(token)).get_json()
    rid = settings['restaurant']['id']
    category = MenuCategory.query.filter_by(restaurant_id=rid).first()
    if category is None:
        category = MenuCategory(restaurant_id=rid, label='Plat', order=0)
        db.session.add(category)
        db.session.commit()
    return category.id


def _create_dish(client, token, name='poulet rôti', **extra):
    extra.setdefault('category_id', _category_for(client, token))
    return client.post('/v1/catalog',
                       json={'name': name, **extra},
                       headers=auth_headers(token))


class TestCatalogCrud:
    def test_create_dish(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        res = _create_dish(client, token)
        assert res.status_code == 201
        dish = res.get_json()['dish']
        # Le nom est normalisé : première lettre en majuscule
        assert dish['name'] == 'Poulet rôti'

    def test_create_dish_requires_auth(self, client):
        res = client.post('/v1/catalog', json={'name': 'Poulet'})
        assert res.status_code == 401

    def test_create_dish_invalid_payload(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        res = client.post('/v1/catalog', json={}, headers=auth_headers(token))
        assert res.status_code == 400

    def test_list_dishes(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        _create_dish(client, token, name='Poulet rôti')
        _create_dish(client, token, name='Riz pilaf')
        res = client.get('/v1/catalog', headers=auth_headers(token))
        assert res.status_code == 200
        names = {d['name'] for d in res.get_json()['dishes']}
        assert names == {'Poulet rôti', 'Riz pilaf'}

    def test_get_dish(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        dish_id = _create_dish(client, token).get_json()['dish']['id']
        res = client.get(f'/v1/catalog/{dish_id}', headers=auth_headers(token))
        assert res.status_code == 200
        assert res.get_json()['dish']['id'] == dish_id

    def test_get_dish_not_found(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        res = client.get('/v1/catalog/9999', headers=auth_headers(token))
        assert res.status_code == 404

    def test_update_dish(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        dish_id = _create_dish(client, token).get_json()['dish']['id']
        res = client.put(f'/v1/catalog/{dish_id}',
                         json={'name': 'poulet basquaise'},
                         headers=auth_headers(token))
        assert res.status_code == 200
        assert res.get_json()['dish']['name'] == 'Poulet basquaise'

    def test_update_dish_invalid_payload(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        dish_id = _create_dish(client, token).get_json()['dish']['id']
        res = client.put(f'/v1/catalog/{dish_id}',
                         json={'name': ''},
                         headers=auth_headers(token))
        assert res.status_code == 400

    def test_delete_dish(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        dish_id = _create_dish(client, token).get_json()['dish']['id']
        res = client.delete(f'/v1/catalog/{dish_id}', headers=auth_headers(token))
        assert res.status_code == 200
        assert client.get(f'/v1/catalog/{dish_id}',
                          headers=auth_headers(token)).status_code == 404

    def test_delete_dish_used_in_menu_rejected(self, app, client):
        import datetime
        restaurant_id = make_restaurant(app)
        make_user(app)
        token = get_token(client)
        category_id = make_category(app, restaurant_id)
        client.post('/v1/menus',
                    json={'date': datetime.date.today().isoformat(),
                          'items': [{'category_id': category_id, 'name': 'Poulet rôti'}]},
                    headers=auth_headers(token))
        dishes = client.get('/v1/catalog', headers=auth_headers(token)).get_json()['dishes']
        assert len(dishes) == 1
        res = client.delete(f"/v1/catalog/{dishes[0]['id']}", headers=auth_headers(token))
        assert res.status_code == 409

    def test_menu_items_reuse_existing_dish(self, app, client):
        """Deux menus avec le même nom de plat réutilisent la même entrée du catalogue."""
        import datetime
        restaurant_id = make_restaurant(app)
        make_user(app)
        token = get_token(client)
        category_id = make_category(app, restaurant_id)
        today = datetime.date.today()
        for offset in (0, 1):
            client.post('/v1/menus',
                        json={'date': (today + datetime.timedelta(days=offset)).isoformat(),
                              'items': [{'category_id': category_id, 'name': 'Poulet rôti'}]},
                        headers=auth_headers(token))
        dishes = client.get('/v1/catalog', headers=auth_headers(token)).get_json()['dishes']
        assert len(dishes) == 1

    def test_dish_stats(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        dish_id = _create_dish(client, token).get_json()['dish']['id']
        res = client.get(f'/v1/catalog/{dish_id}/stats', headers=auth_headers(token))
        assert res.status_code == 200
        data = res.get_json()
        for key in ('week', 'month', 'semester', 'year', 'history'):
            assert key in data


class TestCatalogRoles:
    """Les routes d'écriture du catalogue exigent le rôle editor ou admin."""

    def test_reader_cannot_create_dish(self, app, client):
        make_restaurant(app)
        make_user(app, email='reader@mariam.app', role='reader')
        token = get_token(client, email='reader@mariam.app')
        res = _create_dish(client, token)
        assert res.status_code == 403

    def test_reader_cannot_delete_dish(self, app, client):
        make_restaurant(app)
        make_user(app)
        make_user(app, email='reader@mariam.app', role='reader')
        admin_token = get_token(client)
        dish_id = _create_dish(client, admin_token).get_json()['dish']['id']
        reader_token = get_token(client, email='reader@mariam.app')
        res = client.delete(f'/v1/catalog/{dish_id}', headers=auth_headers(reader_token))
        assert res.status_code == 403

    def test_reader_can_list_dishes(self, app, client):
        make_restaurant(app)
        make_user(app, email='reader@mariam.app', role='reader')
        token = get_token(client, email='reader@mariam.app')
        res = client.get('/v1/catalog', headers=auth_headers(token))
        assert res.status_code == 200


class TestCatalogTenantIsolation:
    """Chaque restaurant ne voit et ne modifie que son propre catalogue."""

    def _two_restaurants(self, app, client):
        rid_a = make_restaurant(app, name='RU A', code='RU_A')
        rid_b = make_restaurant(app, name='RU B', code='RU_B')
        make_user(app, email='a@mariam.app', restaurant_id=rid_a)
        make_user(app, email='b@mariam.app', restaurant_id=rid_b)
        return get_token(client, email='a@mariam.app'), get_token(client, email='b@mariam.app')

    def test_dish_not_visible_from_other_restaurant(self, app, client):
        token_a, token_b = self._two_restaurants(app, client)
        dish_id = _create_dish(client, token_a).get_json()['dish']['id']
        assert client.get(f'/v1/catalog/{dish_id}',
                          headers=auth_headers(token_b)).status_code == 404
        assert client.get('/v1/catalog',
                          headers=auth_headers(token_b)).get_json()['dishes'] == []

    def test_cannot_update_other_restaurant_dish(self, app, client):
        token_a, token_b = self._two_restaurants(app, client)
        dish_id = _create_dish(client, token_a).get_json()['dish']['id']
        res = client.put(f'/v1/catalog/{dish_id}',
                         json={'name': 'Piraté'},
                         headers=auth_headers(token_b))
        assert res.status_code == 404

    def test_cannot_delete_other_restaurant_dish(self, app, client):
        token_a, token_b = self._two_restaurants(app, client)
        dish_id = _create_dish(client, token_a).get_json()['dish']['id']
        res = client.delete(f'/v1/catalog/{dish_id}', headers=auth_headers(token_b))
        assert res.status_code == 404


class TestDishSatisfaction:
    """The stats block distinguishes why a dish carries no rating."""

    def _dish_with_votes(self, client, app, count=0, enabled=True, votable=True):
        from app.extensions import db
        from app.models import DishCatalog, Menu, MenuVote, Organization, Restaurant
        from app.utils.time import paris_today

        rid = make_restaurant(app)
        make_user(app)
        category = make_category(app, restaurant_id=rid, label='Plat')
        org = Organization(name='cat-sat', slug='cat-sat')
        db.session.add(org)
        db.session.commit()

        site = Restaurant.query.get(rid)
        site.organization_id = org.id
        site.vote_enabled = enabled
        site.vote_category_ids = [category] if votable else []
        dish = DishCatalog(restaurant_id=rid, category_id=category, name='Gratin')
        menu = Menu(restaurant_id=rid, date=paris_today(), status='published')
        db.session.add_all([dish, menu])
        db.session.commit()

        for index in range(count):
            db.session.add(MenuVote(
                organization_id=org.id, restaurant_id=rid, menu_id=menu.id,
                date=menu.date, device_id=f'dev-{index}', rating=3, dishes=[dish],
            ))
        db.session.commit()
        return dish.id

    def _satisfaction(self, client, token, dish_id):
        res = client.get(f'/v1/catalog/{dish_id}/stats', headers=auth_headers(token))
        assert res.status_code == 200, res.get_json()
        return res.get_json()['satisfaction']

    def test_a_site_without_voting_says_so(self, app, client):
        dish_id = self._dish_with_votes(client, app, enabled=False)
        token = get_token(client)
        assert self._satisfaction(client, token, dish_id)['enabled'] is False

    def test_a_category_outside_the_vote_says_so(self, app, client):
        dish_id = self._dish_with_votes(client, app, votable=False)
        token = get_token(client)
        satisfaction = self._satisfaction(client, token, dish_id)
        assert (satisfaction['enabled'], satisfaction['votable']) == (True, False)

    def test_a_score_needs_enough_votes(self, app, client):
        dish_id = self._dish_with_votes(client, app, count=4)
        token = get_token(client)
        satisfaction = self._satisfaction(client, token, dish_id)
        assert (satisfaction['votes'], satisfaction['score']) == (4, None)

    def test_enough_votes_yield_a_score(self, app, client):
        dish_id = self._dish_with_votes(client, app, count=5)
        token = get_token(client)
        satisfaction = self._satisfaction(client, token, dish_id)
        assert (satisfaction['votes'], satisfaction['score']) == (5, 3.0)
        assert satisfaction['distribution']['3'] == 5


class TestStatsBatch:
    def test_several_dishes_come_back_in_one_call(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        first = _create_dish(client, token, name='Poulet').get_json()['dish']['id']
        second = _create_dish(client, token, name='Gratin').get_json()['dish']['id']

        res = client.get(
            f'/v1/catalog/stats?ids={first},{second}', headers=auth_headers(token)
        )

        assert res.status_code == 200
        assert set(res.get_json()['stats']) == {str(first), str(second)}

    def test_a_dish_of_another_restaurant_is_dropped(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        mine = _create_dish(client, token, name='Poulet').get_json()['dish']['id']

        res = client.get(f'/v1/catalog/stats?ids={mine},999999', headers=auth_headers(token))

        assert set(res.get_json()['stats']) == {str(mine)}


class TestLeafCategoryRule:
    """A category with subcategories groups them; only leaves carry dishes."""

    def _tree(self, client, token):
        from app.extensions import db
        from app.models import MenuCategory

        settings = client.get('/v1/settings', headers=auth_headers(token)).get_json()
        rid = settings['restaurant']['id']
        parent = MenuCategory(restaurant_id=rid, label='Plat principal', order=0)
        db.session.add(parent)
        db.session.commit()
        return rid, parent.id

    def test_a_dish_may_not_hang_from_a_parent(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        rid, parent_id = self._tree(client, token)
        child = client.post(
            '/v1/settings/categories',
            json={'label': 'Viandes', 'parent_id': parent_id},
            headers=auth_headers(token),
        )
        assert child.status_code == 201

        res = _create_dish(client, token, name='Bœuf', category_id=parent_id)

        assert res.status_code == 400

    def test_a_subcategory_reports_the_dishes_it_would_strand(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        _rid, parent_id = self._tree(client, token)
        _create_dish(client, token, name='Bœuf', category_id=parent_id)

        blocked = client.post(
            '/v1/settings/categories',
            json={'label': 'Viandes', 'parent_id': parent_id},
            headers=auth_headers(token),
        )
        assert blocked.status_code == 409
        assert blocked.get_json()['stranded_dishes'] == 1

        moved = client.post(
            '/v1/settings/categories',
            json={'label': 'Viandes', 'parent_id': parent_id, 'move_dishes': True},
            headers=auth_headers(token),
        )
        assert moved.status_code == 201
        child_id = moved.get_json()['category']['id']
        listed = client.get('/v1/catalog', headers=auth_headers(token)).get_json()['dishes']
        assert [dish['category_id'] for dish in listed if dish['name'] == 'Bœuf'] == [child_id]

    def test_a_populated_category_cannot_be_deleted(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        _rid, parent_id = self._tree(client, token)
        _create_dish(client, token, name='Bœuf', category_id=parent_id)

        res = client.delete(
            f'/v1/settings/categories/{parent_id}', headers=auth_headers(token)
        )

        assert res.status_code == 409
        assert res.get_json()['attached_dishes'] == 1


class TestBulkActions:
    def test_delete_keeps_the_dishes_served_in_a_menu(self, app, client):
        from app.extensions import db
        from app.models import Menu, MenuItem
        from app.utils.time import paris_today

        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        free = _create_dish(client, token, name='Libre').get_json()['dish']
        served = _create_dish(client, token, name='Servi').get_json()['dish']
        menu = Menu(restaurant_id=served['restaurant_id'], date=paris_today(), status='published')
        db.session.add(menu)
        db.session.commit()
        db.session.add(MenuItem(
            menu_id=menu.id, category_id=served['category_id'], dish_id=served['id'], order=0
        ))
        db.session.commit()

        res = client.post(
            '/v1/catalog/bulk/delete',
            json={'ids': [free['id'], served['id']]},
            headers=auth_headers(token),
        )

        payload = res.get_json()
        assert payload['deleted'] == [free['id']]
        assert [kept['id'] for kept in payload['kept']] == [served['id']]

    def test_moving_to_a_parent_category_is_refused(self, app, client):
        from app.extensions import db
        from app.models import MenuCategory

        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        dish = _create_dish(client, token).get_json()['dish']
        parent = MenuCategory(restaurant_id=dish['restaurant_id'], label='Parent', order=9)
        db.session.add(parent)
        db.session.commit()
        db.session.add(MenuCategory(
            restaurant_id=dish['restaurant_id'], parent_id=parent.id, label='Enfant', order=0
        ))
        db.session.commit()

        res = client.post(
            '/v1/catalog/bulk/category',
            json={'ids': [dish['id']], 'category_id': parent.id},
            headers=auth_headers(token),
        )

        assert res.status_code == 400

    def test_export_returns_a_csv(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        dish = _create_dish(client, token, name='Gratin').get_json()['dish']

        res = client.get(f'/v1/catalog/export?ids={dish["id"]}', headers=auth_headers(token))

        assert res.status_code == 200
        assert 'text/csv' in res.headers['Content-Type']
        assert 'Gratin' in res.get_data(as_text=True)

    def test_export_follows_the_filters(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        _create_dish(client, token, name='Gratin')
        _create_dish(client, token, name='Tarte')

        res = client.get('/v1/catalog/export?q=gratin', headers=auth_headers(token))

        body = res.get_data(as_text=True)
        assert 'Gratin' in body
        assert 'Tarte' not in body

    def test_export_carries_the_category_path_and_taxonomy(self, app, client):
        from app.extensions import db
        from app.models import MenuCategory
        from app.models.taxonomy import DietaryTag, DietaryTagCategory

        rid = make_restaurant(app)
        make_user(app)
        token = get_token(client)
        db.session.add(DietaryTagCategory(id='regime', name='Régime'))
        db.session.add(DietaryTag(
            id='vegetarian', label='Végétarien', icon='leaf', color='#22c55e',
            category_id='regime',
        ))
        parent = MenuCategory(restaurant_id=rid, label='Plat principal', order=0)
        db.session.add(parent)
        db.session.commit()
        child = MenuCategory(restaurant_id=rid, parent_id=parent.id, label='Viandes', order=0)
        db.session.add(child)
        db.session.commit()
        _create_dish(client, token, name='Bœuf', category_id=child.id, tag_ids=['vegetarian'])

        res = client.get('/v1/catalog/export', headers=auth_headers(token))

        header, row = res.get_data(as_text=True).strip().splitlines()[:2]
        assert header.lstrip('﻿') == 'nom;categorie;sous_categorie;labels;certifications'
        assert row.startswith('Bœuf;Plat principal;Viandes;Végétarien;')


class TestCatalogFilters:
    def test_several_categories_read_as_a_union(self, app, client):
        from app.extensions import db
        from app.models import MenuCategory

        rid = make_restaurant(app)
        make_user(app)
        token = get_token(client)
        entrees = MenuCategory(restaurant_id=rid, label='Entrées', order=0)
        desserts = MenuCategory(restaurant_id=rid, label='Desserts', order=1)
        plats = MenuCategory(restaurant_id=rid, label='Plats', order=2)
        db.session.add_all([entrees, desserts, plats])
        db.session.commit()
        _create_dish(client, token, name='Salade', category_id=entrees.id)
        _create_dish(client, token, name='Tarte', category_id=desserts.id)
        _create_dish(client, token, name='Bœuf', category_id=plats.id)

        res = client.get(
            f'/v1/catalog?category_ids={entrees.id},{desserts.id}', headers=auth_headers(token)
        )

        assert sorted(dish['name'] for dish in res.get_json()['dishes']) == ['Salade', 'Tarte']

    def test_search_survives_a_typo(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        _create_dish(client, token, name='Banane')
        _create_dish(client, token, name='Blanquette de veau')

        def names(query):
            res = client.get(f'/v1/catalog?q={query}', headers=auth_headers(token))
            return sorted(dish['name'] for dish in res.get_json()['dishes'])

        assert names('bannane') == ['Banane']
        assert names('blanquete veaux') == ['Blanquette de veau']
        assert names('pomme') == []

    def test_short_words_stay_exact(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        _create_dish(client, token, name='Ris de veau')

        res = client.get('/v1/catalog?q=riz', headers=auth_headers(token))

        assert res.get_json()['dishes'] == []


def _second_category(app, restaurant_id, label='Desserts'):
    from app.extensions import db
    from app.models import MenuCategory

    category = MenuCategory(restaurant_id=restaurant_id, label=label, order=1)
    db.session.add(category)
    db.session.commit()
    return category.id


class TestDuplicateNames:
    def test_creating_a_twin_in_the_same_category_is_refused(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        first = _create_dish(client, token, name='Banane').get_json()['dish']

        res = _create_dish(client, token, name='banane')

        assert res.status_code == 409
        assert res.get_json()['dish_id'] == first['id']

    def test_the_same_name_lives_in_another_category(self, app, client):
        rid = make_restaurant(app)
        make_user(app)
        token = get_token(client)
        # Resolved first: the helper would otherwise pick the category added below
        default = _category_for(client, token)
        other = _second_category(app, rid)
        _create_dish(client, token, name='Banane', category_id=default)

        res = _create_dish(client, token, name='Banane', category_id=other)

        assert res.status_code == 201

    def test_renaming_onto_a_twin_is_refused(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        first = _create_dish(client, token, name='Banane').get_json()['dish']
        second = _create_dish(client, token, name='Pomme').get_json()['dish']

        res = client.put(
            f'/v1/catalog/{second["id"]}',
            json={'name': 'Banane'},
            headers=auth_headers(token),
        )

        assert res.status_code == 409
        assert res.get_json()['dish_id'] == first['id']

    def test_moving_onto_a_twin_is_refused(self, app, client):
        rid = make_restaurant(app)
        make_user(app)
        token = get_token(client)
        default = _category_for(client, token)
        other = _second_category(app, rid)
        _create_dish(client, token, name='Banane', category_id=default)
        moving = _create_dish(client, token, name='Banane', category_id=other).get_json()['dish']

        res = client.put(
            f'/v1/catalog/{moving["id"]}',
            json={'category_id': default},
            headers=auth_headers(token),
        )

        assert res.status_code == 409

    def test_a_dish_keeps_its_own_name_on_update(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        dish = _create_dish(client, token, name='Banane').get_json()['dish']

        res = client.put(
            f'/v1/catalog/{dish["id"]}',
            json={'name': 'Banane', 'tag_ids': []},
            headers=auth_headers(token),
        )

        assert res.status_code == 200

    def test_bulk_move_keeps_the_dishes_that_would_collide(self, app, client):
        rid = make_restaurant(app)
        make_user(app)
        token = get_token(client)
        target = _category_for(client, token)
        other = _second_category(app, rid)
        _create_dish(client, token, name='Banane', category_id=target)
        twin = _create_dish(client, token, name='Banane', category_id=other).get_json()['dish']
        free = _create_dish(client, token, name='Poire', category_id=other).get_json()['dish']

        res = client.post(
            '/v1/catalog/bulk/category',
            json={'ids': [twin['id'], free['id']], 'category_id': target},
            headers=auth_headers(token),
        )

        payload = res.get_json()
        assert payload['moved'] == [free['id']]
        assert [kept['id'] for kept in payload['kept']] == [twin['id']]


class TestNovelties:
    def _serve(self, app, client, token, dish_id, day):
        from app.extensions import db
        from app.models import Menu, MenuItem

        menu = Menu.query.filter_by(date=day).first()
        if menu is None:
            settings = client.get('/v1/settings', headers=auth_headers(token)).get_json()
            menu = Menu(restaurant_id=settings['restaurant']['id'], date=day, status='published')
            db.session.add(menu)
            db.session.commit()
        db.session.add(MenuItem(
            menu_id=menu.id, category_id=_category_for(client, token), dish_id=dish_id, order=0
        ))
        db.session.commit()

    def test_only_dishes_first_served_in_the_window(self, app, client):
        import datetime

        from app.services.dish_stats import first_served
        from app.utils.time import paris_today

        rid = make_restaurant(app)
        make_user(app)
        token = get_token(client)
        today = paris_today()
        veteran = _create_dish(client, token, name='Poulet').get_json()['dish']
        newcomer = _create_dish(client, token, name='Curry').get_json()['dish']
        self._serve(app, client, token, veteran['id'], today - datetime.timedelta(days=40))
        self._serve(app, client, token, veteran['id'], today)
        self._serve(app, client, token, newcomer['id'], today)

        found = first_served([rid], today - datetime.timedelta(days=7), today)

        assert list(found) == [newcomer['id']]

    def test_the_filter_needs_a_bounded_period(self, app, client):
        import datetime

        from app.utils.time import paris_today

        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        newcomer = _create_dish(client, token, name='Curry').get_json()['dish']
        _create_dish(client, token, name='Jamais servi')
        self._serve(app, client, token, newcomer['id'], paris_today())

        scoped = client.get('/v1/catalog?new_only=1&period=30d', headers=auth_headers(token))
        unbounded = client.get('/v1/catalog?new_only=1&period=all', headers=auth_headers(token))

        assert [dish['name'] for dish in scoped.get_json()['dishes']] == ['Curry']
        assert len(unbounded.get_json()['dishes']) == 2
