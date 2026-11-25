"""`flask org`: the organizations an instance serves."""
import pytest

from app.models import AuditLog, Organization


def _create(app, slug):
    return app.test_cli_runner().invoke(args=['org', 'create', '--name', 'Org', '--slug', slug])


class TestCreateOrg:
    @pytest.mark.parametrize('slug', ['mail', 'www', 'status', 'notifications', '2026', '---'])
    def test_a_reserved_or_malformed_slug_is_refused(self, app, slug):
        result = _create(app, slug)

        assert result.exit_code != 0
        assert 'Invalid or reserved slug' in result.output
        assert Organization.query.count() == 0

    def test_a_free_slug_names_the_organization(self, app):
        result = _create(app, 'Crous-Creteil')

        assert result.exit_code == 0
        organization = Organization.query.one()
        assert organization.slug == 'crous-creteil'
        assert AuditLog.query.filter_by(organization_id=organization.id).one().action == 'org_create'

    def test_a_taken_slug_leaves_the_organization_as_it_was(self, app):
        _create(app, 'example')
        result = _create(app, 'example')

        assert result.exit_code == 0
        assert Organization.query.count() == 1
