"""`flask create-org` and `create-site`: what an instance is set up with."""
import pytest

from app.extensions import db
from app.models import MenuCategory, Organization, Restaurant


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


def _create_site(app, slug, name='Restaurant Nord'):
    return app.test_cli_runner().invoke(
        args=['create-site', '--org', 'crous', '--name', name, '--slug', slug]
    )


class TestCreateSite:
    @pytest.fixture(autouse=True)
    def org(self, app):
        org = Organization(name='Crous', slug='crous')
        db.session.add(org)
        db.session.commit()
        return org

    def test_a_site_is_created_in_its_organization_with_the_default_categories(self, app, org):
        result = _create_site(app, 'Nord')

        assert result.exit_code == 0
        site = Restaurant.query.one()
        assert (site.organization_id, site.slug, site.name) == (org.id, 'nord', 'Restaurant Nord')
        assert MenuCategory.query.filter_by(restaurant_id=site.id).count() > 0

    @pytest.mark.parametrize('slug', ['admin', 'tv', '2026'])
    def test_a_reserved_or_malformed_slug_is_refused(self, app, slug):
        result = _create_site(app, slug)

        assert result.exit_code != 0
        assert Restaurant.query.count() == 0

    def test_a_slug_taken_in_the_organization_is_refused(self, app):
        _create_site(app, 'nord')
        result = _create_site(app, 'nord', name='Autre')

        assert result.exit_code != 0
        assert Restaurant.query.count() == 1
