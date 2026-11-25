"""`flask site`: opening a site, reading its state, turning it off and on."""
import pytest

from app.extensions import db
from app.models import AuditLog, MenuCategory, Organization, Restaurant
from conftest import make_restaurant, make_user


def _run(app, *args):
    return app.test_cli_runner().invoke(args=['site', *args])


@pytest.fixture()
def org(app):
    organization = Organization(name='Crous', slug='crous')
    db.session.add(organization)
    db.session.commit()
    return organization


def _create_site(app, slug, name='Restaurant Nord'):
    return _run(app, 'create', '--org', 'crous', '--name', name, '--slug', slug)


class TestCreate:
    def test_a_site_is_created_in_its_organization_with_the_default_categories(self, app, org):
        result = _create_site(app, 'Nord')

        assert result.exit_code == 0
        site = Restaurant.query.one()
        assert (site.organization_id, site.slug, site.name) == (org.id, 'nord', 'Restaurant Nord')
        assert MenuCategory.query.filter_by(restaurant_id=site.id).count() > 0
        assert AuditLog.query.filter_by(restaurant_id=site.id).one().action == 'site_create'

    @pytest.mark.parametrize('slug', ['admin', 'tv', '2026'])
    def test_a_reserved_or_malformed_slug_is_refused(self, app, org, slug):
        result = _create_site(app, slug)

        assert result.exit_code != 0
        assert Restaurant.query.count() == 0

    def test_a_slug_taken_in_the_organization_is_refused(self, app, org):
        _create_site(app, 'nord')
        result = _create_site(app, 'nord', name='Autre')

        assert result.exit_code != 0
        assert Restaurant.query.count() == 1


class TestState:
    def test_disable_then_enable_is_recorded_each_time(self, app, org):
        rid = make_restaurant(app, code='NORD', organization_id=org.id)

        assert _run(app, 'disable', 'nord', '--org', 'crous').exit_code == 0
        assert db.session.get(Restaurant, rid).is_active is False
        assert _run(app, 'enable', 'nord', '--org', 'crous').exit_code == 0
        assert db.session.get(Restaurant, rid).is_active is True

        actions = [entry.action for entry in AuditLog.query.order_by(AuditLog.id)]
        assert actions == ['site_disable', 'site_enable']

    def test_disabling_a_disabled_site_records_nothing(self, app, org):
        rid = make_restaurant(app, code='NORD', organization_id=org.id)
        db.session.get(Restaurant, rid).is_active = False
        db.session.commit()

        result = _run(app, 'disable', str(rid))

        assert result.exit_code == 0
        assert 'Already disabled' in result.output
        assert AuditLog.query.count() == 0

    def test_a_slug_two_organizations_share_needs_its_organization(self, app, org):
        other = Organization(name='Autre', slug='autre')
        db.session.add(other)
        db.session.commit()
        make_restaurant(app, code='NORD', organization_id=org.id)
        namesake = make_restaurant(app, name='RU Nord bis', code='NORD_BIS', organization_id=other.id)
        db.session.get(Restaurant, namesake).slug = 'nord'
        db.session.commit()

        result = _run(app, 'disable', 'nord')

        assert result.exit_code != 0
        assert '--org' in result.output


class TestRead:
    def test_list_hides_disabled_sites_unless_asked(self, app, org):
        rid = make_restaurant(app, code='GONE', organization_id=org.id)
        db.session.get(Restaurant, rid).is_active = False
        db.session.commit()

        assert 'crous/gone' not in _run(app, 'list').output
        assert 'crous/gone' in _run(app, 'list', '--all').output

    def test_show_counts_the_accounts_by_role(self, app, org):
        rid = make_restaurant(app, code='NORD', organization_id=org.id)
        make_user(app, email='admin@mariam.app', restaurant_id=rid)
        make_user(app, email='editor@mariam.app', role='editor', restaurant_id=rid)

        result = _run(app, 'show', 'nord')

        assert result.exit_code == 0
        assert 'admin x1, editor x1' in result.output
        assert 'crous/nord' in result.output
