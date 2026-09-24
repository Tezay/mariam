"""Event descriptions: what survives the sanitiser on its way to a public page."""
from app.extensions import db
from app.models import Event
from app.services.rich_text import sanitize_html
from app.utils.time import paris_today
from conftest import auth_headers, get_token, make_restaurant, make_user


def _editor(app, client):
    rid = make_restaurant(app, name='RU Events', code='RU_EVT')
    make_user(app, email='editor@mariam.app', role='admin', restaurant_id=rid)
    return rid, get_token(client, email='editor@mariam.app')


def _create(client, token, description):
    return client.post(
        '/v1/events',
        json={
            'title': 'Soirée',
            'description': description,
            'event_date': paris_today().isoformat(),
            'visibility': 'all',
        },
        headers=auth_headers(token),
    )


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


class TestRoutes:
    def test_a_description_is_cleaned_on_creation(self, app, client):
        _, token = _editor(app, client)

        response = _create(client, token, '<p>Menu</p><script>alert(1)</script>')

        assert response.status_code == 201
        stored = Event.query.filter_by(title='Soirée').one().description
        assert stored == '<p>Menu</p>'

    def test_a_description_is_cleaned_on_update(self, app, client):
        _, token = _editor(app, client)
        event_id = _create(client, token, '<p>Menu</p>').get_json()['event']['id']

        client.put(
            f'/v1/events/{event_id}',
            json={'description': '<p>Autre</p><img src=x onerror="alert(1)">'},
            headers=auth_headers(token),
        )

        stored = Event.query.get(event_id).description
        assert 'onerror' not in stored
        assert 'Autre' in stored

    def test_a_row_written_before_sanitising_is_cleaned_on_the_way_out(self, app, client):
        rid, token = _editor(app, client)
        event_id = _create(client, token, '<p>Menu</p>').get_json()['event']['id']
        # Straight into the column, as a row predating the write path would be.
        Event.query.get(event_id).description = '<p>Menu</p><script>alert(1)</script>'
        Event.query.get(event_id).status = 'published'
        db.session.commit()

        body = client.get(f'/v1/events?restaurant_id={rid}').get_json()

        assert '<script>' not in body['events'][0]['description']

    def test_a_markdown_description_is_left_alone(self, app, client):
        _, token = _editor(app, client)

        _create(client, token, '**Test**.')

        assert Event.query.filter_by(title='Soirée').one().description == '**Test**.'
