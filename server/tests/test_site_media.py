"""A site's logo, cover photo and gallery: sent by its admins, read by anyone."""
import io

import pytest
from PIL import Image

from app.extensions import db
from app.models import AuditLog, Organization, Restaurant, RestaurantPhoto, User
from conftest import auth_headers, get_token, make_restaurant, make_user, site_path

STORE = 'https://images.test/'


def _image(size=(800, 600), fmt='JPEG', mode='RGB', frames=1):
    images = [Image.new(mode, size, (200, 30, 30 * n, 120)[:len(mode)]) for n in range(frames)]
    buffer = io.BytesIO()
    images[0].save(buffer, format=fmt, save_all=frames > 1, append_images=images[1:])
    buffer.seek(0)
    return buffer


def _site(app, client, role='admin'):
    rid = make_restaurant(app)
    make_user(app, email=f'{role}@mariam.app', role=role, restaurant_id=rid)
    return rid, site_path(rid), auth_headers(get_token(client, email=f'{role}@mariam.app'))


def _send(client, url, headers, image=None, name='photo.jpg', method='put', **form):
    return getattr(client, method)(
        url, headers=headers, content_type='multipart/form-data',
        data={'file': (image or _image(), name), **form},
    )


def _stored(bucket, url):
    return Image.open(io.BytesIO(bucket.objects[url.removeprefix(STORE)]))


def _photos(rid, count):
    photos = [
        RestaurantPhoto(
            restaurant_id=rid, storage_key=f'k{n}', url=f'{STORE}k{n}', alt=f'P{n}', order=n
        )
        for n in range(count)
    ]
    db.session.add_all(photos)
    db.session.commit()
    return [photo.id for photo in photos]


def _media_actions():
    return [
        (entry.action, entry.get_details()['kind'])
        for entry in AuditLog.query.order_by(AuditLog.id)
        if entry.action.startswith('site_media')
    ]


class TestLogoAndCover:
    def test_a_logo_is_set_replaced_and_removed(self, app, client, bucket):
        rid, path, headers = _site(app, client)

        first = _send(client, f'{path}/logo', headers).get_json()['logo_url']
        second = _send(client, f'{path}/logo', headers).get_json()['logo_url']
        removed = client.delete(f'{path}/logo', headers=headers)

        assert first.startswith(f'{STORE}sites/{rid}/') and second != first
        assert removed.status_code == 204
        assert client.get(path).get_json()['logo_url'] is None
        assert bucket.deleted == [first.removeprefix(STORE), second.removeprefix(STORE)]
        assert _media_actions() == [
            ('site_media_upload', 'logo'), ('site_media_upload', 'logo'),
            ('site_media_delete', 'logo'),
        ]

    def test_a_transparent_logo_stays_png_within_512_pixels(self, app, client, bucket):
        _, path, headers = _site(app, client)

        site = _send(
            client, f'{path}/logo', headers, _image((1000, 800), 'PNG', 'RGBA'), 'logo.png'
        ).get_json()

        stored = _stored(bucket, site['logo_url'])
        assert (stored.format, stored.size) == ('PNG', (512, 410))

    def test_a_cover_is_brought_within_2400_pixels(self, app, client, bucket):
        _, path, headers = _site(app, client)

        site = _send(client, f'{path}/cover', headers, _image((4800, 3200))).get_json()

        assert _stored(bucket, site['cover_url']).size == (2400, 1600)

    def test_an_animated_cover_keeps_its_first_frame(self, app, client, bucket):
        _, path, headers = _site(app, client)

        site = _send(
            client, f'{path}/cover', headers, _image((3000, 100), 'GIF', 'RGB', frames=2), 'a.gif'
        ).get_json()

        stored = _stored(bucket, site['cover_url'])
        assert (stored.size, getattr(stored, 'is_animated', False)) == ((2400, 80), False)

    def test_removing_what_is_not_there_changes_nothing(self, app, client, bucket):
        _, path, headers = _site(app, client)

        assert client.delete(f'{path}/cover', headers=headers).status_code == 204
        assert _media_actions() == []


class TestGallery:
    def test_photos_are_added_in_order_and_read_by_anyone(self, app, client, bucket):
        _, path, headers = _site(app, client)

        for alt in ('La salle', 'La terrasse'):
            _send(client, f'{path}/photos', headers, method='post', alt=alt)

        public = client.get(path).get_json()['photos']
        assert [(photo['alt'], photo['order']) for photo in public] == [
            ('La salle', 0), ('La terrasse', 1),
        ]
        member = client.get(path, headers=headers).get_json()['photos']
        assert 'id' not in public[0]
        assert all('id' in photo for photo in member)

    def test_a_photo_without_its_text_is_refused(self, app, client, bucket):
        _, path, headers = _site(app, client)

        res = _send(client, f'{path}/photos', headers, method='post', alt='   ')

        assert res.status_code == 422
        assert [issue['pointer'] for issue in res.get_json()['errors']] == ['/alt']
        assert RestaurantPhoto.query.count() == 0 and bucket.objects == {}

    def test_a_photo_is_brought_within_2000_pixels(self, app, client, bucket):
        _, path, headers = _site(app, client)

        photo = _send(
            client, f'{path}/photos', headers, _image((3000, 4000)), method='post', alt='Vue'
        ).get_json()

        assert _stored(bucket, photo['url']).size == (1500, 2000)

    def test_a_ninth_photo_is_refused(self, app, client, bucket):
        rid, path, headers = _site(app, client)
        _photos(rid, 8)

        res = _send(client, f'{path}/photos', headers, method='post', alt='De trop')

        assert res.get_json()['code'] == 'site_photo_limit'
        assert bucket.objects == {}

    def test_its_text_changes_and_it_is_removed(self, app, client, bucket):
        rid, path, headers = _site(app, client)
        [photo_id] = _photos(rid, 1)
        url = f'{path}/photos/{photo_id}'

        renamed = client.patch(url, json={'alt': ' La  salle '}, headers=headers)
        blank = client.patch(url, json={'alt': ''}, headers=headers)
        removed = client.delete(url, headers=headers)

        assert renamed.get_json()['alt'] == 'La salle'
        assert blank.status_code == 422
        assert removed.status_code == 204
        assert RestaurantPhoto.query.count() == 0 and bucket.deleted == ['k0']
        assert _media_actions() == [('site_media_update', 'photo'), ('site_media_delete', 'photo')]

    def test_a_new_photo_comes_after_the_others(self, app, client, bucket):
        rid, path, headers = _site(app, client)
        first, _ = _photos(rid, 2)
        client.delete(f'{path}/photos/{first}', headers=headers)

        photo = _send(client, f'{path}/photos', headers, method='post', alt='Nouvelle').get_json()

        assert photo['order'] == 2

    def test_the_order_is_a_full_permutation(self, app, client):
        rid, path, headers = _site(app, client)
        first, second, third = _photos(rid, 3)
        url = f'{path}/photos/order'

        partial = client.put(url, json={'photo_ids': [third, first]}, headers=headers)
        res = client.put(url, json={'photo_ids': [third, first, second]}, headers=headers)

        assert partial.get_json()['code'] == 'image_order_invalid'
        assert [photo['id'] for photo in res.get_json()['items']] == [third, first, second]
        public = client.get(path).get_json()['photos']
        assert [photo['alt'] for photo in public] == ['P2', 'P0', 'P1']


class TestWhoChangesThem:
    def test_an_editor_is_refused(self, app, client, bucket):
        _, path, headers = _site(app, client, role='editor')

        res = _send(client, f'{path}/logo', headers)

        assert res.get_json()['code'] == 'admin_required'
        assert bucket.objects == {}

    def test_a_supervisor_reads_them_but_never_changes_them(self, app, client, bucket):
        org = Organization(name='Crous', slug='crous-media')
        db.session.add(org)
        db.session.commit()
        rid = make_restaurant(None, name='RU Media', code='RU_MEDIA', organization_id=org.id)
        supervisor = db.session.get(
            User, make_user(None, email='sup@mariam.app', role='org_admin', restaurant_id=None)
        )
        supervisor.organization_id = org.id
        db.session.commit()
        headers = auth_headers(get_token(client, email='sup@mariam.app'))

        res = _send(client, f'{site_path(rid)}/cover', headers)

        assert res.get_json()['code'] == 'supervisor_read_only'
        assert client.get(site_path(rid), headers=headers).status_code == 200
        assert bucket.objects == {}

    def test_another_sites_photo_is_out_of_reach(self, app, client, bucket):
        _, path, headers = _site(app, client)
        elsewhere = make_restaurant(None, name='Ailleurs', code='RU_ELSE')
        [photo_id] = _photos(elsewhere, 1)

        res = client.delete(f'{path}/photos/{photo_id}', headers=headers)

        assert res.get_json()['code'] == 'site_photo_not_found'
        assert db.session.get(RestaurantPhoto, photo_id) is not None

    def test_another_organizations_site_is_out_of_reach(self, app, client, bucket):
        _, _, headers = _site(app, client)
        org = Organization(name='Autre', slug='autre-org')
        db.session.add(org)
        db.session.commit()
        other = make_restaurant(None, name='RU Autre', code='RU_OTHER', organization_id=org.id)

        res = _send(client, f'{site_path(other)}/logo', headers)

        assert res.get_json()['code'] == 'site_not_found'
        assert db.session.get(Restaurant, other).logo_url is None


@pytest.mark.parametrize('route', ['logo', 'cover'])
def test_without_storage_nothing_is_sent(app, client, route):
    _, path, headers = _site(app, client)

    assert _send(client, f'{path}/{route}', headers).get_json()['code'] == 'storage_unavailable'
