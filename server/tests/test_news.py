"""A site's news: published for anyone, drafts too for its editors; descriptions sanitised."""
import datetime
import io

import pytest

from app.extensions import db
from app.models import Event, EventImage
from app.services.rich_text import sanitize_html
from app.utils.time import paris_today
from conftest import auth_headers, get_token, make_restaurant, make_user, site_path


def _editor(app, client, role='admin'):
    rid = make_restaurant(app, name='RU News', code='RU_NEWS')
    make_user(app, email=f'{role}@mariam.app', role=role, restaurant_id=rid)
    token = get_token(client, email=f'{role}@mariam.app')
    return rid, f'{site_path(rid)}/news', auth_headers(token)


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
        news_id = _create(client, path, headers, '<p>Menu</p>').get_json()['id']

        client.patch(
            f'{path}/{news_id}',
            json={'description': '<p>Autre</p><img src=x onerror="alert(1)">'},
            headers=headers,
        )

        stored = db.session.get(Event, news_id).description
        assert 'onerror' not in stored
        assert 'Autre' in stored

    def test_a_row_written_before_sanitising_is_cleaned_on_the_way_out(self, app, client):
        _, path, headers = _editor(app, client)
        news_id = _create(client, path, headers, '<p>Menu</p>', status='published').get_json()['id']
        # Straight into the column, as a row predating the write path would be.
        db.session.get(Event, news_id).description = '<p>Menu</p><script>alert(1)</script>'
        db.session.commit()

        assert '<script>' not in client.get(path).get_json()['items'][0]['description']

    def test_a_markdown_description_is_left_alone(self, app, client):
        _, path, headers = _editor(app, client)

        _create(client, path, headers, '**Test**.')

        assert Event.query.filter_by(title='Soirée').one().description == '**Test**.'


class TestRead:
    def _news(self, app, client):
        rid, path, headers = _editor(app, client)
        for title, offset, status, pinned in (
            ('À la une', -10, 'published', True), ('Passé', -3, 'published', False),
            ('Brouillon', 1, 'draft', False), ('Demain', 1, 'published', False),
            ('Plus tard', 9, 'published', False), ('Sans date', None, 'published', False),
        ):
            date = None if offset is None else _day(offset)
            _create(client, path, headers, title=title, date=date, status=status, pinned=pinned)
        return rid, path, headers

    def _titles(self, res):
        return [item['title'] for item in res.get_json()['items']]

    def test_anyone_reads_the_published_ones_pinned_first_then_the_latest(self, app, client):
        _, path, _ = self._news(app, client)

        res = client.get(path)

        assert self._titles(res) == ['À la une', 'Sans date', 'Plus tard', 'Demain', 'Passé']
        assert 'status' not in res.get_json()['items'][0]

    def test_an_editor_reads_the_drafts_first(self, app, client):
        _, path, headers = self._news(app, client)

        assert self._titles(client.get(path, headers=headers)) == [
            'À la une', 'Brouillon', 'Sans date', 'Plus tard', 'Demain', 'Passé',
        ]

    def test_by_date_the_dated_ones_soonest_first_within_the_range(self, app, client):
        _, path, _ = self._news(app, client)

        assert self._titles(client.get(f'{path}?sort=date')) == [
            'À la une', 'Passé', 'Demain', 'Plus tard',
        ]
        assert self._titles(client.get(f'{path}?sort=date&from={_day(0)}&per_page=1')) == ['Demain']

    def test_anyone_reads_six_at_most_and_an_editor_pages_through_all(self, app, client):
        rid, path, headers = _editor(app, client)
        db.session.add_all(
            Event(restaurant_id=rid, title=f'N{n}', status='published') for n in range(10)
        )
        db.session.commit()

        anyone = client.get(f'{path}?per_page=20').get_json()
        last = client.get(f'{path}?per_page=4&page=3', headers=headers)

        assert (len(anyone['items']), anyone['total_count']) == (6, 6)
        assert client.get(f'{path}?page=2').get_json()['items'] == []
        assert (len(last.get_json()['items']), last.get_json()['total_count']) == (2, 10)
        assert 'rel="prev"' in last.headers['Link']

    def test_an_editor_lists_the_drafts_alone(self, app, client):
        _, path, headers = self._news(app, client)

        assert self._titles(client.get(f'{path}?status=draft', headers=headers)) == ['Brouillon']

    def test_a_draft_is_found_by_its_editors_only(self, app, client):
        _, path, headers = _editor(app, client)
        draft = _create(client, path, headers).get_json()['id']

        assert client.get(f'{path}/{draft}').get_json()['code'] == 'news_not_found'
        assert client.get(f'{path}/{draft}', headers=headers).get_json()['visibility'] == 'all'


class TestWrite:
    @pytest.mark.parametrize('fields', [{'color': 'bleu'}, {'title': '   '}])
    def test_a_value_out_of_its_rule_is_refused(self, app, client, fields):
        _, path, headers = _editor(app, client)
        assert _create(client, path, headers, **fields).status_code == 422

    def test_a_new_item_gives_its_address(self, app, client):
        _, path, headers = _editor(app, client)

        res = _create(client, path, headers)

        assert client.get(res.headers['Location'], headers=headers).get_json() == res.get_json()

    def test_a_copy_is_a_draft_a_week_later_or_stays_undated(self, app, client):
        _, path, headers = _editor(app, client)
        dated = _create(client, path, headers, status='published', pinned=True).get_json()['id']
        undated = _create(client, path, headers, date=None).get_json()['id']

        copy = client.post(f'{path}/{dated}/duplicate', json={}, headers=headers).get_json()
        undated_copy = client.post(f'{path}/{undated}/duplicate', json={}, headers=headers)

        assert (copy['title'], copy['status'], copy['date'], copy['pinned']) == (
            'Soirée (copie)', 'draft', _day(7), False,
        )
        assert undated_copy.get_json()['date'] is None

    def test_publishing_tells_when_and_taking_back_forgets_it(self, app, client):
        _, path, headers = _editor(app, client)
        news_id = _create(client, path, headers).get_json()['id']

        published = client.post(f'{path}/{news_id}/publish', headers=headers).get_json()
        again = client.post(f'{path}/{news_id}/publish', headers=headers).get_json()
        taken_back = client.post(f'{path}/{news_id}/unpublish', headers=headers).get_json()
        refused = client.post(f'{path}/{news_id}/unpublish', headers=headers).get_json()

        assert published['published_at'] is not None
        assert again['published_at'] == published['published_at']
        assert taken_back['published_at'] is None
        assert refused['code'] == 'news_not_published'

    def test_images_reorder_only_by_a_full_permutation(self, app, client):
        _, path, headers = _editor(app, client)
        news_id = _create(client, path, headers).get_json()['id']
        images = [EventImage(event_id=news_id, storage_key=f'k{n}', url=f'https://img/{n}', order=n)
                  for n in range(2)]
        db.session.add_all(images)
        db.session.commit()
        first, second = (image.id for image in images)
        url = f'{path}/{news_id}/images/order'

        assert client.put(url, json={'image_ids': [second]}, headers=headers).status_code == 422
        res = client.put(url, json={'image_ids': [second, first]}, headers=headers)
        assert [image['id'] for image in res.get_json()['items']] == [second, first]

    def test_an_image_needs_the_storage(self, app, client):
        _, path, headers = _editor(app, client)
        news_id = _create(client, path, headers).get_json()['id']

        res = client.post(f'{path}/{news_id}/images', data={'file': (io.BytesIO(b'x'), 'a.jpg')},
                          headers=headers, content_type='multipart/form-data')

        assert res.get_json()['code'] == 'storage_unavailable'

    def test_an_inactive_item_reads_as_deleted(self, app, client):
        _, path, headers = _editor(app, client)
        news_id = _create(client, path, headers, status='published').get_json()['id']
        db.session.get(Event, news_id).is_active = False
        db.session.commit()

        assert client.get(path, headers=headers).get_json()['items'] == []
        assert client.patch(f'{path}/{news_id}', json={'title': 'X'}, headers=headers).status_code == 404
