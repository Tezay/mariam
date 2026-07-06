"""
Tests de l'import CSV : upload, confirmation, création des plats au catalogue.
"""
import datetime
import io

from conftest import auth_headers, get_token, make_category, make_restaurant, make_user


def _upload_csv(client, token, content='Plat principal\nPoulet rôti, Riz pilaf\n'):
    return client.post(
        '/v1/imports/menus/upload',
        data={'file': (io.BytesIO(content.encode('utf-8')), 'menus.csv')},
        content_type='multipart/form-data',
        headers=auth_headers(token),
    )


class TestCsvImport:
    def test_upload_requires_editor(self, app, client):
        make_restaurant(app)
        make_user(app, email='reader@mariam.app', role='reader')
        token = get_token(client, email='reader@mariam.app')
        assert _upload_csv(client, token).status_code == 403

    def test_upload_parses_columns(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        res = _upload_csv(client, token)
        assert res.status_code == 200
        data = res.get_json()
        assert data['columns'] == ['Plat principal']
        assert data['row_count'] == 1
        assert data['file_id']

    def test_confirm_creates_menu_and_catalog_dishes(self, app, client):
        restaurant_id = make_restaurant(app)
        make_user(app)
        token = get_token(client)
        category_id = make_category(app, restaurant_id)

        file_id = _upload_csv(client, token).get_json()['file_id']
        today = datetime.date.today().isoformat()

        res = client.post('/v1/imports/menus/confirm', json={
            'file_id': file_id,
            'column_mapping': [
                {'csv_column': 'Plat principal', 'target_field': 'category',
                 'category_id': category_id},
            ],
            'date_config': {'mode': 'start_date', 'start_date': today,
                            'skip_weekends': False, 'auto_detect_tags': False},
            'duplicate_action': 'replace',
        }, headers=auth_headers(token))
        assert res.status_code == 200, res.get_json()
        assert res.get_json()['imported_count'] == 1

        # Le menu importé contient les deux items, liés à des plats du catalogue
        menu = client.get(f'/v1/menus/by-date/{today}',
                          headers=auth_headers(token)).get_json()['menu']
        assert menu is not None
        items = menu['items']
        assert len(items) == 2
        assert all(item['dish_id'] for item in items)
        names = {item['dish']['name'] for item in items}
        assert names == {'Poulet rôti', 'Riz pilaf'}

        # Les plats existent au catalogue
        dishes = client.get('/v1/catalog', headers=auth_headers(token)).get_json()['dishes']
        assert {d['name'] for d in dishes} == {'Poulet rôti', 'Riz pilaf'}

    def test_reimport_reuses_catalog_dishes(self, app, client):
        """Réimporter les mêmes plats ne crée pas de doublons au catalogue."""
        restaurant_id = make_restaurant(app)
        make_user(app)
        token = get_token(client)
        category_id = make_category(app, restaurant_id)
        today = datetime.date.today().isoformat()

        for _ in range(2):
            file_id = _upload_csv(client, token).get_json()['file_id']
            res = client.post('/v1/imports/menus/confirm', json={
                'file_id': file_id,
                'column_mapping': [
                    {'csv_column': 'Plat principal', 'target_field': 'category',
                     'category_id': category_id},
                ],
                'date_config': {'mode': 'start_date', 'start_date': today,
                                'skip_weekends': False, 'auto_detect_tags': False},
                'duplicate_action': 'replace',
            }, headers=auth_headers(token))
            assert res.status_code == 200

        dishes = client.get('/v1/catalog', headers=auth_headers(token)).get_json()['dishes']
        assert len(dishes) == 2


# ============================================================
# Import du catalogue de plats (liste)
# ============================================================

def _upload_catalog(client, token, content, filename='plats.csv'):
    return client.post(
        '/v1/imports/catalog/upload',
        data={'file': (io.BytesIO(content.encode('utf-8')), filename)},
        content_type='multipart/form-data',
        headers=auth_headers(token),
    )


def _seed_vegetarian_tag(app):
    """Crée un tag 'vegetarian' avec un mot-clé pour tester l'auto-détection."""
    from app.extensions import db
    from app.models.taxonomy import DietaryTag, DietaryTagCategory, DietaryTagKeyword
    db.session.add(DietaryTagCategory(id='regime', name='Régime'))
    db.session.add(DietaryTag(id='vegetarian', label='Végétarien', icon='leaf',
                              color='#22c55e', category_id='regime'))
    db.session.add(DietaryTagKeyword(tag_id='vegetarian', keyword='végétarien'))
    db.session.commit()


class TestCatalogImportUpload:
    def test_upload_requires_editor(self, app, client):
        make_restaurant(app)
        make_user(app, email='reader@mariam.app', role='reader')
        token = get_token(client, email='reader@mariam.app')
        res = _upload_catalog(client, token, 'Nom du plat\nPoulet rôti\n')
        assert res.status_code == 403

    def test_upload_parses_and_suggests_name_column(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        res = _upload_catalog(client, token, 'Nom du plat;Tags\nPoulet rôti;épicé\n')
        assert res.status_code == 200
        data = res.get_json()
        assert data['columns'] == ['Nom du plat', 'Tags']
        assert data['suggested_name_column'] == 'Nom du plat'
        assert data['row_count'] == 1
        assert data['file_id']


class TestCatalogImportPreview:
    def test_category_required(self, app, client):
        make_restaurant(app)
        make_user(app)
        token = get_token(client)
        file_id = _upload_catalog(client, token, 'Nom\nPoulet rôti\n').get_json()['file_id']
        res = client.post('/v1/imports/catalog/preview', json={
            'file_id': file_id, 'name_column': 'Nom',
        }, headers=auth_headers(token))
        assert res.status_code == 422  # category_id manquant

    def test_preview_flags_existing_duplicate(self, app, client):
        restaurant_id = make_restaurant(app)
        make_user(app)
        token = get_token(client)
        category_id = make_category(app, restaurant_id)
        # Un plat existe déjà dans la catégorie
        client.post('/v1/catalog', json={'name': 'Poulet rôti', 'category_id': category_id},
                    headers=auth_headers(token))
        file_id = _upload_catalog(client, token, 'Nom\nPoulet rôti\nRiz pilaf\n').get_json()['file_id']
        res = client.post('/v1/imports/catalog/preview', json={
            'file_id': file_id, 'name_column': 'Nom', 'category_id': category_id,
        }, headers=auth_headers(token))
        assert res.status_code == 200
        data = res.get_json()
        assert data['total'] == 2
        assert data['new_count'] == 1
        assert data['duplicate_count'] == 1
        dup = next(d for d in data['dishes'] if d['name'] == 'Poulet rôti')
        assert dup['is_duplicate'] is True

    def test_preview_flags_intra_file_duplicate(self, app, client):
        restaurant_id = make_restaurant(app)
        make_user(app)
        token = get_token(client)
        category_id = make_category(app, restaurant_id)
        file_id = _upload_catalog(client, token, 'Nom\nPoulet rôti\npoulet roti\n').get_json()['file_id']
        res = client.post('/v1/imports/catalog/preview', json={
            'file_id': file_id, 'name_column': 'Nom', 'category_id': category_id,
        }, headers=auth_headers(token))
        # « poulet roti » est un doublon normalisé de « Poulet rôti »
        assert res.get_json()['new_count'] == 1

    def test_preview_auto_detects_tags_from_name(self, app, client):
        restaurant_id = make_restaurant(app)
        make_user(app)
        _seed_vegetarian_tag(app)
        token = get_token(client)
        category_id = make_category(app, restaurant_id)
        file_id = _upload_catalog(client, token, 'Nom\nLasagnes végétarien\n').get_json()['file_id']
        res = client.post('/v1/imports/catalog/preview', json={
            'file_id': file_id, 'name_column': 'Nom', 'category_id': category_id,
            'auto_detect_tags': True,
        }, headers=auth_headers(token))
        assert 'vegetarian' in res.get_json()['dishes'][0]['tags']

    def test_preview_scans_tag_column(self, app, client):
        restaurant_id = make_restaurant(app)
        make_user(app)
        _seed_vegetarian_tag(app)
        token = get_token(client)
        category_id = make_category(app, restaurant_id)
        file_id = _upload_catalog(client, token, 'Nom;Régime\nLasagnes;végétarien\n').get_json()['file_id']
        res = client.post('/v1/imports/catalog/preview', json={
            'file_id': file_id, 'name_column': 'Nom', 'tag_columns': ['Régime'], 'category_id': category_id,
            'auto_detect_tags': False,
        }, headers=auth_headers(token))
        assert 'vegetarian' in res.get_json()['dishes'][0]['tags']


class TestCatalogImportConfirm:
    def test_confirm_creates_dishes(self, app, client):
        restaurant_id = make_restaurant(app)
        make_user(app)
        token = get_token(client)
        category_id = make_category(app, restaurant_id)
        file_id = _upload_catalog(client, token, 'Nom\nPoulet rôti\nRiz pilaf\n').get_json()['file_id']
        res = client.post('/v1/imports/catalog/confirm', json={
            'file_id': file_id, 'name_column': 'Nom', 'category_id': category_id,
        }, headers=auth_headers(token))
        assert res.status_code == 200
        assert res.get_json() == {'created_count': 2, 'skipped_count': 0}
        dishes = client.get('/v1/catalog', headers=auth_headers(token)).get_json()['dishes']
        assert {d['name'] for d in dishes} == {'Poulet rôti', 'Riz pilaf'}
        assert all(d['category_id'] == category_id for d in dishes)

    def test_confirm_skips_duplicates_and_is_idempotent(self, app, client):
        restaurant_id = make_restaurant(app)
        make_user(app)
        token = get_token(client)
        category_id = make_category(app, restaurant_id)
        content = 'Nom\nPoulet rôti\nRiz pilaf\n'

        first = _upload_catalog(client, token, content).get_json()['file_id']
        client.post('/v1/imports/catalog/confirm', json={
            'file_id': first, 'name_column': 'Nom', 'category_id': category_id,
        }, headers=auth_headers(token))

        # Ré-import du même fichier → tout est doublon
        second = _upload_catalog(client, token, content).get_json()['file_id']
        res = client.post('/v1/imports/catalog/confirm', json={
            'file_id': second, 'name_column': 'Nom', 'category_id': category_id,
        }, headers=auth_headers(token))
        assert res.get_json() == {'created_count': 0, 'skipped_count': 2}
        dishes = client.get('/v1/catalog', headers=auth_headers(token)).get_json()['dishes']
        assert len(dishes) == 2

    def test_confirm_attaches_detected_tags(self, app, client):
        restaurant_id = make_restaurant(app)
        make_user(app)
        _seed_vegetarian_tag(app)
        token = get_token(client)
        category_id = make_category(app, restaurant_id)
        file_id = _upload_catalog(client, token, 'Nom\nLasagnes végétarien\n').get_json()['file_id']
        client.post('/v1/imports/catalog/confirm', json={
            'file_id': file_id, 'name_column': 'Nom', 'category_id': category_id,
        }, headers=auth_headers(token))
        dish = client.get('/v1/catalog', headers=auth_headers(token)).get_json()['dishes'][0]
        assert [t['id'] for t in dish['tags']] == ['vegetarian']

    def test_confirm_writes_audit_log(self, app, client):
        restaurant_id = make_restaurant(app)
        make_user(app)
        token = get_token(client)
        category_id = make_category(app, restaurant_id)
        file_id = _upload_catalog(client, token, 'Nom\nPoulet rôti\n').get_json()['file_id']
        client.post('/v1/imports/catalog/confirm', json={
            'file_id': file_id, 'name_column': 'Nom', 'category_id': category_id,
        }, headers=auth_headers(token))
        from app.models import AuditLog
        assert AuditLog.query.filter_by(action='catalog_import').count() == 1


class TestCatalogImportTenantIsolation:
    def test_cannot_import_into_other_restaurant_category(self, app, client):
        rid_a = make_restaurant(app, name='RU A', code='RU_A')
        rid_b = make_restaurant(app, name='RU B', code='RU_B')
        make_user(app, email='a@mariam.app', restaurant_id=rid_a)
        make_user(app, email='b@mariam.app', restaurant_id=rid_b)
        category_a = make_category(app, rid_a)
        token_b = get_token(client, email='b@mariam.app')
        file_id = _upload_catalog(client, token_b, 'Nom\nPoulet rôti\n').get_json()['file_id']
        # B tente d'importer dans une catégorie de A
        res = client.post('/v1/imports/catalog/confirm', json={
            'file_id': file_id, 'name_column': 'Nom', 'category_id': category_a,
        }, headers=auth_headers(token_b))
        assert res.status_code == 400  # catégorie introuvable pour ce restaurant
