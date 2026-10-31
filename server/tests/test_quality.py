"""The quality of a site's products: its yearly EGalim figures, and what its menus served."""
import json
from datetime import timedelta

import pytest

from app.extensions import db
from app.models import (
    AuditLog,
    DishCatalog,
    Menu,
    MenuCategory,
    MenuItem,
    Restaurant,
    User,
)
from app.models.taxonomy import (
    Certification,
    CertificationCategory,
    DietaryTag,
    DietaryTagCategory,
)
from app.utils.time import paris_today
from conftest import auth_headers, get_token, make_restaurant, make_user, site_path

THIS_YEAR = paris_today().year


def _site(app, client, role='admin'):
    rid = make_restaurant(app)
    make_user(app, email=f'{role}@mariam.app', role=role, restaurant_id=rid)
    return rid, site_path(rid), auth_headers(get_token(client, email=f'{role}@mariam.app'))


def _declare(client, path, headers, year=THIS_YEAR - 1, **shares):
    body = {'sustainable_share': 38.3, 'organic_share': 17.2} | shares
    return client.put(f'{path}/egalim-declarations/{year}', json=body, headers=headers)


class TestDeclarations:
    def test_a_year_is_declared_replaced_then_removed(self, app, client):
        _, path, headers = _site(app, client)

        created = _declare(client, path, headers, territorial_share=12.5)
        replaced = _declare(client, path, headers, sustainable_share=40)
        listed = client.get(f'{path}/egalim-declarations').get_json()['items']
        removed = client.delete(f'{path}/egalim-declarations/{THIS_YEAR - 1}', headers=headers)
        again = client.delete(f'{path}/egalim-declarations/{THIS_YEAR - 1}', headers=headers)

        assert created.status_code == 201
        assert created.get_json() == {
            'year': THIS_YEAR - 1,
            'sustainable_share': 38.3, 'organic_share': 17.2, 'territorial_share': 12.5,
        }
        assert replaced.status_code == 200
        assert listed == [{
            'year': THIS_YEAR - 1,
            'sustainable_share': 40.0, 'organic_share': 17.2, 'territorial_share': None,
        }]
        assert removed.status_code == 204
        assert again.get_json()['code'] == 'egalim_declaration_not_found'

    def test_the_latest_year_comes_first(self, app, client):
        _, path, headers = _site(app, client)
        _declare(client, path, headers, year=THIS_YEAR - 2)
        _declare(client, path, headers, year=THIS_YEAR - 1)

        items = client.get(f'{path}/egalim-declarations').get_json()['items']

        assert [item['year'] for item in items] == [THIS_YEAR - 1, THIS_YEAR - 2]

    @pytest.mark.parametrize('shares', [
        {'organic_share': 40},
        {'sustainable_share': 100.1},
        {'organic_share': 12.25},
        {'territorial_share': -1},
        {'sustainable_share': 1e30},
    ])
    def test_a_share_out_of_its_rule_is_refused(self, app, client, shares):
        _, path, headers = _site(app, client)

        assert _declare(client, path, headers, **shares).status_code == 422

    @pytest.mark.parametrize('year', [2018, THIS_YEAR + 1])
    def test_a_year_out_of_egalim_is_refused(self, app, client, year):
        _, path, headers = _site(app, client)

        res = _declare(client, path, headers, year=year)

        assert res.get_json()['code'] == 'egalim_year_invalid'

    def test_only_the_sites_admin_declares(self, app, client):
        rid, path, headers = _site(app, client, role='editor')
        supervisor = make_user(app, email='dir@mariam.app', role='org_admin', restaurant_id=None)
        organization_id = db.session.get(Restaurant, rid).organization_id
        db.session.get(User, supervisor).organization_id = organization_id
        db.session.commit()
        supervisor_headers = auth_headers(get_token(client, email='dir@mariam.app'))

        assert _declare(client, path, headers).get_json()['code'] == 'admin_required'
        assert (
            _declare(client, path, supervisor_headers).get_json()['code'] == 'supervisor_read_only'
        )

    def test_another_site_is_not_found(self, app, client):
        _, _, headers = _site(app, client)
        other = make_restaurant(app, name='RU Autre', code='RU_AUTRE')

        assert _declare(client, site_path(other), headers).get_json()['code'] == 'site_not_found'

    def test_each_change_is_audited(self, app, client):
        _, path, headers = _site(app, client)
        _declare(client, path, headers)
        client.delete(f'{path}/egalim-declarations/{THIS_YEAR - 1}', headers=headers)

        entries = (
            AuditLog.query.filter(AuditLog.action.like('egalim_%')).order_by(AuditLog.id).all()
        )

        assert [entry.action for entry in entries] == [
            'egalim_declaration_update', 'egalim_declaration_delete',
        ]
        assert json.loads(entries[0].details)['organic_share'] == 17.2


def _taxonomy():
    db.session.add(DietaryTagCategory(id='kitchen', name='Cuisine'))
    db.session.add(CertificationCategory(id='official', name='Officiels'))
    for tag in ('homemade', 'local_product', 'seasonal', 'vegetarian', 'vegan'):
        db.session.add(
            DietaryTag(id=tag, label=tag, icon='leaf', color='green', category_id='kitchen')
        )
    for order, label in enumerate(('ab', 'label_rouge', 'msc')):
        db.session.add(Certification(
            id=label, name=label.upper(), official_name=label, issuer='Organisme',
            scheme_type='public', jurisdiction='france', guarantee='Garantie',
            logo_filename=f'{label}.svg', category_id='official', sort_order=order,
        ))
    db.session.commit()


def _category(rid, label, highlighted=False, parent=None):
    category = MenuCategory(
        restaurant_id=rid, label=label, order=0, is_highlighted=highlighted, parent_id=parent
    )
    db.session.add(category)
    db.session.commit()
    return category.id


def _dish(rid, name, tags=(), labels=()):
    dish = DishCatalog(restaurant_id=rid, name=name)
    dish.tags = DietaryTag.query.filter(DietaryTag.id.in_(tags)).all()
    dish.certifications = Certification.query.filter(Certification.id.in_(labels)).all()
    db.session.add(dish)
    db.session.commit()
    return dish.id


def _served(rid, days_ago, dishes, status='published'):
    menu = Menu(restaurant_id=rid, date=paris_today() - timedelta(days=days_ago), status=status)
    db.session.add(menu)
    db.session.flush()
    for category_id, dish_id in dishes:
        db.session.add(MenuItem(menu_id=menu.id, category_id=category_id, dish_id=dish_id))
    db.session.commit()


class TestQuality:
    def test_each_serving_counts_and_vegetarian_is_among_mains(self, app, client):
        rid, path, _ = _site(app, client)
        _taxonomy()
        starter, main = _category(rid, 'Entrées'), _category(rid, 'Plats', highlighted=True)
        soup = _dish(rid, 'Soupe', tags=('vegan', 'seasonal', 'homemade'))
        chicken = _dish(rid, 'Poulet', tags=('local_product',), labels=('label_rouge',))
        quiche = _dish(rid, 'Quiche', tags=('vegetarian',), labels=('ab',))
        _served(rid, 0, [(starter, soup), (main, chicken)])
        _served(rid, 1, [(starter, soup), (main, quiche)])

        assert client.get(f'{path}/quality').get_json()['menus'] == {
            'days': 30, 'labelled': 50, 'homemade': 50, 'local': 25, 'seasonal': 50,
            'vegetarian': 50,
        }

    def test_only_the_published_menus_of_the_last_30_days_count(self, app, client):
        rid, path, _ = _site(app, client)
        _taxonomy()
        main = _category(rid, 'Plats', highlighted=True)
        local = _dish(rid, 'Truite', tags=('local_product',))
        other = _dish(rid, 'Pâtes')
        _served(rid, 29, [(main, other)])
        _served(rid, 30, [(main, local)])
        _served(rid, 2, [(main, local)], status='draft')
        elsewhere = make_restaurant(app, name='RU Autre', code='RU_AUTRE')
        trout = _dish(elsewhere, 'Truite', tags=('local_product',))
        _served(elsewhere, 0, [(_category(elsewhere, 'Plats', highlighted=True), trout)])

        assert client.get(f'{path}/quality').get_json()['menus']['local'] == 0

    def test_a_subcategory_of_a_highlighted_one_holds_mains(self, app, client):
        rid, path, _ = _site(app, client)
        _taxonomy()
        meats = _category(rid, 'Viandes', parent=_category(rid, 'Plat principal', highlighted=True))
        sides = _category(rid, 'Garnitures')
        _served(rid, 0, [
            (meats, _dish(rid, 'Poulet')),
            (meats, _dish(rid, 'Lentilles', tags=('vegetarian',))),
            (sides, _dish(rid, 'Riz', tags=('vegan',))),
        ])

        assert client.get(f'{path}/quality').get_json()['menus']['vegetarian'] == 50

    def test_without_a_main_dish_vegetarian_is_unknown(self, app, client):
        rid, path, _ = _site(app, client)
        _taxonomy()
        _served(rid, 0, [(_category(rid, 'Entrées'), _dish(rid, 'Soupe', tags=('vegan',)))])

        assert client.get(f'{path}/quality').get_json()['menus']['vegetarian'] is None

    def test_the_labels_are_those_served_in_their_order(self, app, client):
        rid, path, _ = _site(app, client)
        _taxonomy()
        main = _category(rid, 'Plats', highlighted=True)
        _dish(rid, 'Jamais servi', labels=('msc',))
        _served(rid, 0, [
            (main, _dish(rid, 'Poulet', labels=('label_rouge',))),
            (main, _dish(rid, 'Lentilles', labels=('ab',))),
        ])

        labels = client.get(f'{path}/quality').get_json()['labels']

        assert [label['id'] for label in labels] == ['ab', 'label_rouge']

    def test_it_gives_the_latest_declaration_and_no_menus_without_one(self, app, client):
        _, path, headers = _site(app, client)
        _declare(client, path, headers, year=THIS_YEAR - 2, sustainable_share=30)
        _declare(client, path, headers, year=THIS_YEAR - 1)

        quality = client.get(f'{path}/quality').get_json()

        assert quality['declaration']['year'] == THIS_YEAR - 1
        assert quality['menus'] is None
        assert quality['labels'] == []
