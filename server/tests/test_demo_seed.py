"""`flask seed-demo`: the page of the first demo site, and a second run that adds nothing."""
from app.models import (
    EgalimDeclaration,
    Event,
    ExceptionalClosure,
    ServiceLiveStatus,
)


def _seed(app):
    result = app.test_cli_runner().invoke(args=['seed-demo', '--password', 'demo-password-1'])
    assert result.exit_code == 0, result.output


def _counts():
    return [
        model.query.count()
        for model in (Event, ExceptionalClosure, EgalimDeclaration, ServiceLiveStatus)
    ]


class TestSeedDemo:
    def test_the_first_site_fills_its_whole_page(self, app, client):
        _seed(app)
        path = '/v1/orgs/demo/sites/demo'

        site = client.get(path).get_json()
        assert site['tagline'] and site['quality_commitments'] and site['service_capacity']
        assert {link['kind'] for link in site['links']} == {'website', 'izly'}
        assert client.get(f'{path}/quality').get_json()['declaration'] is not None
        news = client.get(f'{path}/news').get_json()['items']
        assert news[0]['pinned'] and news[0]['date'] is None

    def test_a_second_run_adds_nothing(self, app):
        _seed(app)
        before = _counts()

        _seed(app)

        assert _counts() == before
