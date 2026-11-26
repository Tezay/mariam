"""Where a site stands in its subscription, and who reads it."""
from datetime import date

import pytest

from app.extensions import db
from app.models import Organization, Restaurant, SubscriptionPeriod
from app.services.subscriptions import Period, standing
from conftest import make_restaurant, make_user, site_path
from tests.auth_support import session_headers

TODAY = date(2027, 6, 15)


def _period(starts_on, ends_on, kind='paid', renewal='undecided', **terms):
    fields = dict(
        tacit_until=None, notice_by=None, quote_ref=None, order_ref=None,
        payer_name=None, payer_siret=None, payer_service_code=None,
    )
    return Period(kind=kind, starts_on=starts_on, ends_on=ends_on, renewal=renewal,
                  **{**fields, **terms})


YEAR = _period(date(2027, 1, 1), date(2027, 12, 31))


class TestStanding:
    def test_no_period_reads_as_nothing_to_show(self):
        assert standing([], TODAY).state == 'none'

    def test_a_period_with_nothing_after_it_is_to_decide(self):
        position = standing([YEAR], TODAY)

        assert (position.state, position.end, position.days_left) == ('active', 'undecided', 199)

    def test_a_period_followed_the_next_day_is_covered(self):
        following = _period(date(2028, 1, 1), date(2028, 12, 31))

        position = standing([following, YEAR], TODAY)

        assert (position.end, position.next) == ('covered', following)

    def test_an_announced_end_reads_as_ending(self):
        assert standing([_period(YEAR.starts_on, YEAR.ends_on, renewal='ending')], TODAY).end == (
            'ending'
        )

    def test_a_tacit_renewal_covers_the_end_and_runs_on_without_a_new_record(self):
        contract = _period(
            date(2026, 9, 1), date(2026, 12, 31), renewal='tacit',
            tacit_until=date(2028, 12, 31), notice_by=date(2026, 9, 30), order_ref='EJ-1',
        )

        position = standing([contract], TODAY)

        assert (position.state, position.end) == ('active', 'covered')
        assert (position.current.starts_on, position.current.ends_on) == (
            date(2027, 1, 1), date(2027, 12, 31)
        )
        assert position.current.renewed_tacitly
        assert position.current.notice_by == date(2027, 9, 30)
        assert position.current.order_ref is None
        assert position.past == (contract,)

    def test_the_last_renewal_year_is_to_decide(self):
        contract = _period(
            date(2026, 1, 1), date(2026, 12, 31), renewal='tacit', tacit_until=date(2027, 12, 31)
        )

        assert standing([contract], TODAY).end == 'undecided'

    def test_renewals_spent_read_as_expired_and_nothing_is_cut(self):
        contract = _period(
            date(2025, 1, 1), date(2025, 12, 31), renewal='tacit', tacit_until=date(2026, 12, 31)
        )

        position = standing([contract], TODAY)

        assert (position.state, position.current) == ('expired', None)

    def test_a_period_to_come_reads_as_upcoming(self):
        trial = _period(date(2027, 1, 1), date(2027, 2, 28), kind='trial')
        paid = _period(date(2027, 9, 1), date(2027, 12, 31))

        position = standing([trial, paid], TODAY)

        assert (position.state, position.next, position.past) == ('upcoming', paid, (trial,))

    def test_a_disabled_site_says_so_and_keeps_its_period(self):
        position = standing([YEAR], TODAY, site_active=False)

        assert (position.state, position.current) == ('disabled', YEAR)


@pytest.fixture()
def site(app):
    site_id = make_restaurant(app)
    db.session.add(SubscriptionPeriod(
        restaurant_id=site_id, kind='paid', starts_on=date(2020, 1, 1),
        ends_on=date(2099, 12, 31), order_ref='EJ-2100045871', payer_siret='12345678900012',
    ))
    db.session.commit()
    return site_id


class TestReading:
    def test_the_admin_of_the_site_reads_its_periods(self, app, client, site):
        res = client.get(f'{site_path(site)}/subscription', headers=session_headers(make_user(app)))

        assert res.status_code == 200
        body = res.get_json()
        assert (body['state'], body['current']['order_ref']) == ('active', 'EJ-2100045871')
        assert body['past'] == []

    def test_an_editor_does_not(self, app, client, site):
        editor = make_user(app, email='editor@mariam.app', role='editor')

        res = client.get(f'{site_path(site)}/subscription', headers=session_headers(editor))

        assert res.status_code == 403

    def test_a_supervisor_reads_every_site_of_its_organization(self, app, client, site):
        organization = db.session.get(Restaurant, site).organization
        other = make_restaurant(app, name='RU Sans abonnement', code='RU_NONE',
                                organization_id=organization.id)
        supervisor = make_user(app, email='sup@mariam.app', role='org_admin',
                               organization_id=organization.id)

        res = client.get(f'/v1/orgs/{organization.slug}/subscriptions',
                         headers=session_headers(supervisor))

        assert res.status_code == 200
        states = {item['site']: item['state'] for item in res.get_json()['items']}
        assert states == {db.session.get(Restaurant, site).slug: 'active',
                          db.session.get(Restaurant, other).slug: 'none'}

    def test_another_organization_reads_as_missing(self, app, client, site):
        elsewhere = Organization(name='Ailleurs', slug='ailleurs')
        db.session.add(elsewhere)
        db.session.commit()
        supervisor = make_user(app, email='sup@mariam.app', role='org_admin',
                               organization_id=elsewhere.id)
        organization = db.session.get(Restaurant, site).organization

        res = client.get(f'/v1/orgs/{organization.slug}/subscriptions',
                         headers=session_headers(supervisor))

        assert res.status_code == 404
