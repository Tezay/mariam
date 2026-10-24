"""A site's events: published for anyone, drafts too for its editors; descriptions sanitised."""
import datetime
import io

from app.extensions import db
from app.models import Event, EventImage
from app.services.rich_text import sanitize_html
from app.utils.time import paris_today
from conftest import auth_headers, get_token, make_restaurant, make_user, site_path


def _editor(app, client, role='admin'):
    rid = make_restaurant(app, name='RU Events', code='RU_EVT')
    make_user(app, email=f'{role}@mariam.app', role=role, restaurant_id=rid)
    token = get_token(client, email=f'{role}@mariam.app')
    return rid, f'{site_path(rid)}/events', auth_headers(token)


def _create(client, path, headers, description='', **fields):
    return client.post(
        path,
        json={'title': 'Soirée', 'description': description, 'date': _day(), **fields},
        headers=headers,
    )


def _day(offset=0):
    return (paris_today() + datetime.timedelta(days=offset)).isoformat()


class TestSanitizer:
    def test_formatting_the_editor_produces_survives(self):
        html = '<p><strong>Bon appétit</strong></p><ul><li><p>Entrée</p></li></ul>'
        assert sanitize_html(html) == html

    def test_a_script_is_removed(self):
        assert '<script>' not in sanitize_html('<p>Hi</p><script>alert(1)</script>')

    def test_a_javascript_link_loses_its_target(self):
        cleaned = sanitize_html('<a href="javascript:alert(1)">clic</a>')
        assert 'javascript:' not in cleaned

    def test_an_event_handler_is_removed(self):
        assert 'onerror' not in sanitize_html('<p onerror="alert(1)">Hi</p>')

    def test_nothing_is_invented_for_an_empty_description(self):
        assert sanitize_html(None) is None
        assert sanitize_html('') == ''


class TestSanitising:
    def test_a_description_is_cleaned_on_creation(self, app, client):
        _, path, headers = _editor(app, client)

        response = _create(client, path, headers, '<p>Menu</p><script>alert(1)</script>')

        assert response.status_code == 201
        assert Event.query.filter_by(title='Soirée').one().description == '<p>Menu</p>'

    def test_a_description_is_cleaned_on_update(self, app, client):
        _, path, headers = _editor(app, client)
        event_id = _create(client, path, headers, '<p>Menu</p>').get_json()['id']

        client.patch(
            f'{path}/{event_id}',
            json={'description': '<p>Autre</p><img src=x onerror="alert(1)">'},
            headers=headers,
        )

        stored = db.session.get(Event, event_id).description
        assert 'onerror' not in stored
        assert 'Autre' in stored

    def test_a_row_written_before_sanitising_is_cleaned_on_the_way_out(self, app, client):
        _, path, headers = _editor(app, client)
        event_id = _create(client, path, headers, '<p>Menu</p>', status='published').get_json()['id']
        # Straight into the column, as a row predating the write path would be.
        db.session.get(Event, event_id).description = '<p>Menu</p><script>alert(1)</script>'
        db.session.commit()

        assert '<script>' not in client.get(path).get_json()['items'][0]['description']

    def test_a_markdown_description_is_left_alone(self, app, client):
        _, path, headers = _editor(app, client)

        _create(client, path, headers, '**Test**.')

        assert Event.query.filter_by(title='Soirée').one().description == '**Test**.'


class TestRead:
    def _events(self, app, client):
        rid, path, headers = _editor(app, client)
        for title, offset, status in (
            ('Passé', -3, 'published'), ('Brouillon', 1, 'draft'),
            ('Demain', 1, 'published'), ('Plus tard', 9, 'published'),
        ):
            _create(client, path, headers, title=title, date=_day(offset), status=status)
        return rid, path, headers

    def _titles(self, res):
        return [event['title'] for event in res.get_json()['items']]

    def test_anyone_reads_the_published_ones_from_today(self, app, client):
        _, path, _ = self._events(app, client)

        assert self._titles(client.get(path)) == ['Demain', 'Plus tard']
        assert self._titles(client.get(f'{path}?from={_day(-5)}&limit=1')) == ['Demain']
        assert 'status' not in client.get(path).get_json()['items'][0]

    def test_an_editor_reads_drafts_and_the_past_in_any_range(self, app, client):
        _, path, headers = self._events(app, client)

        everything = client.get(path, headers=headers)
        past = client.get(f'{path}?to={_day(-1)}', headers=headers)

        assert self._titles(everything) == ['Passé', 'Brouillon', 'Demain', 'Plus tard']
        assert self._titles(past) == ['Passé']
        assert everything.get_json()['items'][1]['status'] == 'draft'

    def test_a_draft_is_found_by_its_editors_only(self, app, client):
        _, path, headers = _editor(app, client)
        draft = _create(client, path, headers).get_json()['id']

        assert client.get(f'{path}/{draft}').get_json()['code'] == 'event_not_found'
        assert client.get(f'{path}/{draft}', headers=headers).get_json()['visibility'] == 'all'


class TestWrite:
    def test_a_colour_is_hexadecimal(self, app, client):
        _, path, headers = _editor(app, client)
        assert _create(client, path, headers, color='bleu').status_code == 422

    def test_a_new_event_gives_its_address(self, app, client):
        _, path, headers = _editor(app, client)

        res = _create(client, path, headers)

        assert client.get(res.headers['Location'], headers=headers).get_json() == res.get_json()

    def test_a_copy_is_a_draft_a_week_later(self, app, client):
        _, path, headers = _editor(app, client)
        event_id = _create(client, path, headers, status='published').get_json()['id']

        copy = client.post(f'{path}/{event_id}/duplicate', json={}, headers=headers).get_json()

        assert (copy['title'], copy['status'], copy['date']) == ('Soirée (copie)', 'draft', _day(7))

    def test_a_draft_cannot_be_unpublished(self, app, client):
        _, path, headers = _editor(app, client)
        event_id = _create(client, path, headers).get_json()['id']

        res = client.post(f'{path}/{event_id}/unpublish', headers=headers)

        assert res.get_json()['code'] == 'event_not_published'

    def test_images_reorder_only_by_a_full_permutation(self, app, client):
        _, path, headers = _editor(app, client)
        event_id = _create(client, path, headers).get_json()['id']
        images = [EventImage(event_id=event_id, storage_key=f'k{n}', url=f'https://img/{n}', order=n)
                  for n in range(2)]
        db.session.add_all(images)
        db.session.commit()
        first, second = (image.id for image in images)
        url = f'{path}/{event_id}/images/order'

        assert client.put(url, json={'image_ids': [second]}, headers=headers).status_code == 422
        res = client.put(url, json={'image_ids': [second, first]}, headers=headers)
        assert [image['id'] for image in res.get_json()['items']] == [second, first]

    def test_an_image_needs_the_storage(self, app, client):
        _, path, headers = _editor(app, client)
        event_id = _create(client, path, headers).get_json()['id']

        res = client.post(f'{path}/{event_id}/images', data={'file': (io.BytesIO(b'x'), 'a.jpg')},
                          headers=headers, content_type='multipart/form-data')

        assert res.get_json()['code'] == 'storage_unavailable'

    def test_an_inactive_event_reads_as_deleted(self, app, client):
        _, path, headers = _editor(app, client)
        event_id = _create(client, path, headers, status='published').get_json()['id']
        db.session.get(Event, event_id).is_active = False
        db.session.commit()

        assert client.get(path, headers=headers).get_json()['items'] == []
        assert client.patch(f'{path}/{event_id}', json={'title': 'X'}, headers=headers).status_code == 404
