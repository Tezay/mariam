"""`flask create-org` — which subdomain an organization may take."""
import pytest

from app.models import Organization


def _create(app, slug):
    return app.test_cli_runner().invoke(args=['create-org', '--name', 'Org', '--slug', slug])


class TestCreateOrg:
    @pytest.mark.parametrize('slug', ['mail', 'www', 'status', 'notifications', '2026', '---'])
    def test_a_reserved_or_malformed_slug_is_refused(self, app, slug):
        result = _create(app, slug)

        assert 'Invalid or reserved slug' in result.output
        assert Organization.query.count() == 0

    def test_a_free_slug_names_the_organization(self, app):
        result = _create(app, 'Crous-Creteil')

        assert result.exit_code == 0
        assert Organization.query.one().slug == 'crous-creteil'
