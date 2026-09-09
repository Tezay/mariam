"""Menu vote: the guard chain, the one-vote-per-organization rule and its limits."""
from datetime import date, timedelta

import pytest

from app.extensions import db
from app.models import (
    DishCatalog,
    Menu,
    MenuCategory,
    MenuItem,
    MenuVote,
    Organization,
    Restaurant,
    RestaurantServiceHours,
)
from app.services import votes as votes_service
from app.utils.time import paris_today
from conftest import FakeRedis, make_restaurant


def _use_fake_redis(monkeypatch) -> FakeRedis:
    fake = FakeRedis()
    monkeypatch.setattr(votes_service, 'get_redis', lambda: fake)
    return fake


def _dish(restaurant_id: int, category_id: int, name: str) -> DishCatalog:
    dish = DishCatalog(restaurant_id=restaurant_id, category_id=category_id, name=name)
    db.session.add(dish)
    db.session.commit()
    return dish


def _site_with_menu(monkeypatch, slug='vote-org', code='VOTE', dishes=('Bœuf bourguignon',),
                    published=True):
    """An organization, one site, and today's menu in a highlighted category."""
    org = Organization(name=slug, slug=slug)
    db.session.add(org)
    db.session.commit()

    rid = make_restaurant(None, name=code, code=code)
    site = Restaurant.query.get(rid)
    site.organization_id = org.id
    site.slug = code.lower()

    category = MenuCategory(
        restaurant_id=rid, label='Plat du jour', order=0, is_highlighted=True
    )
    db.session.add(category)
    db.session.commit()

    menu = Menu(
        restaurant_id=rid, date=paris_today(), status='published' if published else 'draft'
    )
    db.session.add(menu)
    db.session.commit()

    dish_ids = []
    for order, name in enumerate(dishes):
        dish = _dish(rid, category.id, name)
        db.session.add(
            MenuItem(menu_id=menu.id, category_id=category.id, dish_id=dish.id, order=order)
        )
        dish_ids.append(dish.id)
    db.session.commit()

    # Service from midnight, so the suite does not depend on the hour it runs at;
    # the window has its own test.
    db.session.add(RestaurantServiceHours(
        restaurant_id=rid,
        day_of_week=paris_today().weekday(),
        open_time='00:00',
        close_time='23:59',
    ))
    db.session.commit()

    monkeypatch.setenv('DEFAULT_ORG_SLUG', slug)
    return org.id, rid, menu, dish_ids


def _token(client) -> str:
    return client.post('/v1/public/device').get_json()['device_id']


def _cast(client, slug, token, rating=3, **extra):
    body = {'device_id': token, 'rating': rating, **extra}
    return client.post(f'/v1/public/{slug}/vote', json=body)


def _state(client, slug, token):
    return client.get(f'/v1/public/{slug}/vote?device_id={token}').get_json()


class TestDeviceToken:
    def test_a_forged_token_is_refused(self, app, client, monkeypatch):
        _use_fake_redis(monkeypatch)
        _site_with_menu(monkeypatch)

        res = _cast(client, 'vote', 'did1.' + 'a' * 64 + '.deadbeefdeadbeef')

        assert res.status_code == 403
        assert MenuVote.query.count() == 0

    def test_a_minted_token_round_trips(self, app, client, monkeypatch):
        _use_fake_redis(monkeypatch)
        _site_with_menu(monkeypatch, 'vote-org-2', 'VOTE2')

        token = _token(client)

        assert votes_service.device_body(token) is not None


class TestCasting:
    def test_a_vote_is_recorded_then_edited_by_the_same_device(self, app, client, monkeypatch):
        _use_fake_redis(monkeypatch)
        _, rid, _, _ = _site_with_menu(monkeypatch, 'vote-org-3', 'VOTE3')
        token = _token(client)

        created = _cast(client, 'vote3', token, rating=3)
        updated = _cast(client, 'vote3', token, rating=1)

        assert created.get_json()['status'] == 'created'
        assert updated.get_json()['status'] == 'updated'
        assert MenuVote.query.filter_by(restaurant_id=rid).count() == 1
        assert MenuVote.query.filter_by(restaurant_id=rid).one().rating == 1

    def test_a_dish_outside_the_highlighted_category_is_refused(self, app, client, monkeypatch):
        _use_fake_redis(monkeypatch)
        _, rid, _, _ = _site_with_menu(monkeypatch, 'vote-org-4', 'VOTE4')
        other = MenuCategory(restaurant_id=rid, label='Dessert', order=1)
        db.session.add(other)
        db.session.commit()
        stray = _dish(rid, other.id, 'Tarte')
        token = _token(client)

        res = _cast(client, 'vote4', token, dish_ids=[stray.id])

        assert res.status_code == 400
        assert MenuVote.query.count() == 0

    def test_a_draft_menu_cannot_be_rated(self, app, client, monkeypatch):
        _use_fake_redis(monkeypatch)
        _site_with_menu(monkeypatch, 'vote-org-5', 'VOTE5', published=False)
        token = _token(client)

        assert _cast(client, 'vote5', token).status_code == 409

    def test_the_window_opens_with_the_service(self, app, client, monkeypatch):
        """A meal is rated once served, never before."""
        _use_fake_redis(monkeypatch)
        _, rid, _, _ = _site_with_menu(monkeypatch, 'vote-org-6', 'VOTE6')
        token = _token(client)
        hours = RestaurantServiceHours.query.filter_by(restaurant_id=rid).one()
        hours.open_time = '23:59'
        db.session.commit()

        assert _cast(client, 'vote6', token).status_code == 409
        assert _state(client, 'vote6', token)['voting_open'] is False

    def test_a_day_without_service_hours_cannot_be_rated(self, app, client, monkeypatch):
        _use_fake_redis(monkeypatch)
        _, rid, _, _ = _site_with_menu(monkeypatch, 'vote-org-6b', 'VOTE6B')
        token = _token(client)
        RestaurantServiceHours.query.filter_by(restaurant_id=rid).delete()
        db.session.commit()

        assert _cast(client, 'vote6b', token).status_code == 409


class TestOneVotePerOrganization:
    def test_voting_on_another_site_moves_the_vote(self, app, client, monkeypatch):
        """A student eats once, wherever they eat."""
        _use_fake_redis(monkeypatch)
        org_id, first_rid, _, _ = _site_with_menu(monkeypatch, 'vote-org-7', 'VOTE7')

        second_rid = make_restaurant(None, name='VOTE7B', code='VOTE7B')
        second = Restaurant.query.get(second_rid)
        second.organization_id = org_id
        second.slug = 'vote7b'
        category = MenuCategory(
            restaurant_id=second_rid, label='Plat du jour', order=0, is_highlighted=True
        )
        db.session.add(category)
        db.session.commit()
        db.session.add_all([
            Menu(restaurant_id=second_rid, date=paris_today(), status='published'),
            RestaurantServiceHours(
                restaurant_id=second_rid,
                day_of_week=paris_today().weekday(),
                open_time='00:00',
                close_time='23:59',
            ),
        ])
        db.session.commit()

        token = _token(client)
        _cast(client, 'vote7', token, rating=3)
        moved = _cast(client, 'vote7b', token, rating=1)

        assert moved.get_json()['status'] == 'updated'
        assert MenuVote.query.count() == 1
        vote = MenuVote.query.one()
        assert vote.restaurant_id == second_rid
        assert vote.rating == 1


class TestAbuseGuards:
    def test_a_fingerprint_cannot_be_reused_by_another_device(self, app, client, monkeypatch):
        _use_fake_redis(monkeypatch)
        _site_with_menu(monkeypatch, 'vote-org-8', 'VOTE8')
        first = _token(client)
        second = _token(client)

        assert _cast(client, 'vote8', first, fingerprint='abc123').status_code == 200
        blocked = _cast(client, 'vote8', second, fingerprint='abc123')

        assert blocked.status_code == 409
        assert MenuVote.query.count() == 1

    def test_the_same_device_may_edit_with_its_own_fingerprint(self, app, client, monkeypatch):
        _use_fake_redis(monkeypatch)
        _site_with_menu(monkeypatch, 'vote-org-9', 'VOTE9')
        token = _token(client)

        _cast(client, 'vote9', token, rating=3, fingerprint='abc123')
        again = _cast(client, 'vote9', token, rating=2, fingerprint='abc123')

        assert again.status_code == 200
        assert MenuVote.query.one().rating == 2

    def test_one_address_is_capped_for_the_day(self, app, client, monkeypatch):
        _use_fake_redis(monkeypatch)
        _site_with_menu(monkeypatch, 'vote-org-10', 'VOTE10')
        monkeypatch.setenv('VOTE_IP_DAILY_CAP', '1')

        assert _cast(client, 'vote10', _token(client)).status_code == 200
        assert _cast(client, 'vote10', _token(client)).status_code == 429

    def test_editing_never_spends_the_shared_budget(self, app, client, monkeypatch):
        """One student's changes of mind must not lock the rest of the campus out."""
        _use_fake_redis(monkeypatch)
        _site_with_menu(monkeypatch, 'vote-org-25', 'VOTE25')
        monkeypatch.setenv('VOTE_IP_DAILY_CAP', '1')
        mine = _token(client)

        assert _cast(client, 'vote25', mine, rating=3).status_code == 200
        for rating in (1, 2, 3, 1):
            assert _cast(client, 'vote25', mine, rating=rating).status_code == 200

        # The single unit was spent by the creation, not by the four edits.
        assert _cast(client, 'vote25', _token(client)).status_code == 429
        assert MenuVote.query.count() == 1
        assert MenuVote.query.one().rating == 1

    def test_a_drifting_fingerprint_never_blocks_its_own_edit(self, app, client, monkeypatch):
        _use_fake_redis(monkeypatch)
        _site_with_menu(monkeypatch, 'vote-org-26', 'VOTE26')
        token = _token(client)
        other = _token(client)

        _cast(client, 'vote26', token, rating=3, fingerprint='stable')
        # Another device holds that fingerprint, yet the owner may still edit.
        _cast(client, 'vote26', other, rating=2, fingerprint='drifted')

        assert _cast(client, 'vote26', token, rating=1, fingerprint='drifted').status_code == 200
        assert MenuVote.query.filter_by(device_id=votes_service.device_body(token)).one().rating == 1

    def test_minting_is_throttled_per_address(self, app, client, monkeypatch):
        _use_fake_redis(monkeypatch)
        _site_with_menu(monkeypatch, 'vote-org-11', 'VOTE11')
        monkeypatch.setenv('VOTE_DEVICE_MINT_PER_HOUR', '1')

        assert client.post('/v1/public/device').status_code == 200
        assert client.post('/v1/public/device').status_code == 429

    def test_votes_survive_a_redis_outage(self, app, client, monkeypatch):
        """Availability wins: the unique constraint is the last guard."""
        monkeypatch.setattr(votes_service, 'get_redis', lambda: None)
        _site_with_menu(monkeypatch, 'vote-org-12', 'VOTE12')

        res = _cast(client, 'vote12', votes_service.mint_device_id(), fingerprint='abc123')

        assert res.status_code == 200
        assert MenuVote.query.count() == 1


class TestState:
    def test_the_widget_sees_only_its_own_vote(self, app, client, monkeypatch):
        _use_fake_redis(monkeypatch)
        _site_with_menu(monkeypatch, 'vote-org-13', 'VOTE13', dishes=('Bœuf', 'Poisson'))
        mine = _token(client)
        other = _token(client)
        _cast(client, 'vote13', other, rating=1)

        payload = _state(client, 'vote13', mine)

        assert payload['vote'] is None
        assert payload['voting_open'] is True
        names = {dish['name'] for group in payload['dish_groups'] for dish in group['dishes']}
        assert names == {'Bœuf', 'Poisson'}

    def test_no_aggregate_is_exposed(self, app, client, monkeypatch):
        _use_fake_redis(monkeypatch)
        _site_with_menu(monkeypatch, 'vote-org-14', 'VOTE14')
        token = _token(client)
        _cast(client, 'vote14', token)

        payload = _state(client, 'vote14', token)

        assert set(payload) == {'vote', 'dish_groups', 'voting_open', 'icon_preset'}
        assert set(payload['vote']) == {'rating', 'dish_ids', 'restaurant_id', 'updated_at'}


class TestVotableCategories:
    def test_the_default_is_the_first_subcategory_of_the_highlighted_one(
        self, app, client, monkeypatch
    ):
        _use_fake_redis(monkeypatch)
        _, rid, menu, _ = _site_with_menu(monkeypatch, 'vote-org-16', 'VOTE16')
        highlighted = MenuCategory.query.filter_by(restaurant_id=rid, is_highlighted=True).one()
        child = MenuCategory(
            restaurant_id=rid, parent_id=highlighted.id, label='Viandes', order=0
        )
        later = MenuCategory(
            restaurant_id=rid, parent_id=highlighted.id, label='Poissons', order=1
        )
        db.session.add_all([child, later])
        db.session.commit()
        for order, (category, name) in enumerate(((child, 'Rôti'), (later, 'Merlan'))):
            dish = _dish(rid, category.id, name)
            db.session.add(MenuItem(
                menu_id=menu.id, category_id=category.id, dish_id=dish.id, order=order + 10
            ))
        db.session.commit()

        payload = _state(client, 'vote16', _token(client))

        assert [group['label'] for group in payload['dish_groups']] == ['Viandes']

    def test_an_unset_site_resolves_to_the_first_highlighted_subcategory(
        self, app, client, monkeypatch
    ):
        _use_fake_redis(monkeypatch)
        _, rid, _, _ = _site_with_menu(monkeypatch, 'vote-org-20', 'VOTE20')
        highlighted = MenuCategory.query.filter_by(restaurant_id=rid, is_highlighted=True).one()
        first = MenuCategory(restaurant_id=rid, parent_id=highlighted.id, label='Viandes', order=0)
        db.session.add_all([
            first,
            MenuCategory(restaurant_id=rid, parent_id=highlighted.id, label='Poissons', order=1),
        ])
        db.session.commit()

        site = Restaurant.query.get(rid)

        assert site.vote_category_ids is None
        assert site.get_votable_category_ids() == [first.id]

    def test_a_dish_dropped_from_the_settings_is_refused(self, app, client, monkeypatch):
        """The widget filters its own stale ids; the server never takes them on trust."""
        _use_fake_redis(monkeypatch)
        _, rid, _, dish_ids = _site_with_menu(monkeypatch, 'vote-org-21', 'VOTE21')
        token = _token(client)
        assert _cast(client, 'vote21', token, dish_ids=dish_ids[:1]).status_code == 200

        Restaurant.query.get(rid).vote_category_ids = []
        db.session.commit()

        assert _state(client, 'vote21', token)['dish_groups'] == []
        assert _cast(client, 'vote21', token, dish_ids=dish_ids[:1]).status_code == 400
        assert _cast(client, 'vote21', token, rating=1).status_code == 200

    def test_several_categories_offer_one_dish_each(self, app, client, monkeypatch):
        _use_fake_redis(monkeypatch)
        _, rid, menu, _ = _site_with_menu(monkeypatch, 'vote-org-17', 'VOTE17')
        dessert = MenuCategory(restaurant_id=rid, label='Dessert', order=5)
        db.session.add(dessert)
        db.session.commit()
        tart = _dish(rid, dessert.id, 'Tarte')
        db.session.add(MenuItem(
            menu_id=menu.id, category_id=dessert.id, dish_id=tart.id, order=9
        ))
        main = MenuCategory.query.filter_by(restaurant_id=rid, is_highlighted=True).one()
        Restaurant.query.get(rid).vote_category_ids = [main.id, dessert.id]
        db.session.commit()
        token = _token(client)

        payload = _state(client, 'vote17', token)
        main_dish = payload['dish_groups'][0]['dishes'][0]['id']
        res = _cast(client, 'vote17', token, dish_ids=[main_dish, tart.id])

        assert len(payload['dish_groups']) == 2
        assert res.status_code == 200
        assert sorted(MenuVote.query.one().to_dict()['dish_ids']) == sorted([main_dish, tart.id])

    def test_two_dishes_from_one_category_are_refused(self, app, client, monkeypatch):
        _use_fake_redis(monkeypatch)
        _, rid, _, dish_ids = _site_with_menu(
            monkeypatch, 'vote-org-18', 'VOTE18', dishes=('Bœuf', 'Poisson')
        )

        res = _cast(client, 'vote18', _token(client), dish_ids=dish_ids)

        assert res.status_code == 400
        assert MenuVote.query.count() == 0

    def test_a_site_can_turn_the_vote_off(self, app, client, monkeypatch):
        _use_fake_redis(monkeypatch)
        _, rid, _, _ = _site_with_menu(monkeypatch, 'vote-org-19', 'VOTE19')
        Restaurant.query.get(rid).vote_enabled = False
        db.session.commit()
        token = _token(client)

        assert _cast(client, 'vote19', token).status_code == 409
        assert _state(client, 'vote19', token)['voting_open'] is False

    def test_a_site_outside_an_organization_takes_no_vote(self, app, client, monkeypatch):
        """Uniqueness is scoped to the organization, so such a site has no scope.

        Driven through the service, not the route: the public resolver finds a
        site by its organization, so it never reaches one without.
        """
        _use_fake_redis(monkeypatch)
        _, rid, _, _ = _site_with_menu(monkeypatch, 'vote-org-22', 'VOTE22')
        site = Restaurant.query.get(rid)
        site.organization_id = None
        db.session.commit()

        with pytest.raises(votes_service.VoteError) as raised:
            votes_service.validate_and_record_vote(
                site, votes_service.mint_device_id(), 3, [], None, '10.0.0.1'
            )
        assert raised.value.status == 409


class TestIconPreset:
    def test_the_vote_records_the_preset_its_author_saw(self, app, client, monkeypatch):
        """Comparing two presets must not mean comparing two weeks of menus."""
        _use_fake_redis(monkeypatch)
        _, rid, _, _ = _site_with_menu(monkeypatch, 'vote-org-22', 'VOTE22')
        Restaurant.query.get(rid).vote_icon_preset = 'faces'
        db.session.commit()
        token = _token(client)

        assert _state(client, 'vote22', token)['icon_preset'] == 'faces'
        _cast(client, 'vote22', token)

        assert MenuVote.query.one().icon_preset == 'faces'

    def test_switching_the_preset_restamps_an_edited_vote(self, app, client, monkeypatch):
        _use_fake_redis(monkeypatch)
        _, rid, _, _ = _site_with_menu(monkeypatch, 'vote-org-23', 'VOTE23')
        token = _token(client)
        _cast(client, 'vote23', token, rating=3)

        Restaurant.query.get(rid).vote_icon_preset = 'stars'
        db.session.commit()
        _cast(client, 'vote23', token, rating=1)

        assert MenuVote.query.one().icon_preset == 'stars'

    def test_an_unknown_preset_is_ignored_by_the_settings(self, app, client, monkeypatch):
        _use_fake_redis(monkeypatch)
        _, rid, _, _ = _site_with_menu(monkeypatch, 'vote-org-24', 'VOTE24')
        site = Restaurant.query.get(rid)
        site.vote_icon_preset = 'faces'
        db.session.commit()

        from app.models import VOTE_ICON_PRESETS
        assert 'kittens' not in VOTE_ICON_PRESETS
        assert site.get_config()['vote_icon_preset'] == 'faces'


class TestDeviceTokenLifetime:
    def test_the_token_is_stripped_once_the_day_is_over(self, app, client, monkeypatch):
        """A vote that can no longer be edited keeps nothing pointing at a device."""
        from app.services.votes import forget_device_ids

        _use_fake_redis(monkeypatch)
        _, rid, menu, _ = _site_with_menu(monkeypatch, 'vote-org-27', 'VOTE27')
        token = _token(client)
        _cast(client, 'vote27', token)
        db.session.add(MenuVote(
            organization_id=Restaurant.query.get(rid).organization_id,
            restaurant_id=rid,
            menu_id=menu.id,
            date=paris_today() - timedelta(days=3),
            device_id='b' * 64,
            rating=2,
        ))
        db.session.commit()

        cleared = forget_device_ids(app)

        assert cleared == 1
        assert MenuVote.query.filter_by(date=paris_today()).one().device_id is not None
        old = MenuVote.query.filter(MenuVote.date < paris_today()).one()
        assert old.device_id is None
        assert old.rating == 2

    def test_stripped_votes_never_collide(self, app, client, monkeypatch):
        """NULLs are distinct, so the daily uniqueness holds on the rows that matter."""
        from app.services.votes import forget_device_ids

        _use_fake_redis(monkeypatch)
        _, rid, menu, _ = _site_with_menu(monkeypatch, 'vote-org-28', 'VOTE28')
        org_id = Restaurant.query.get(rid).organization_id
        yesterday = paris_today() - timedelta(days=2)
        for index in range(3):
            db.session.add(MenuVote(
                organization_id=org_id,
                restaurant_id=rid,
                menu_id=menu.id,
                date=yesterday,
                device_id=f'{index}' * 64,
                rating=2,
            ))
        db.session.commit()

        assert forget_device_ids(app) == 3
        assert MenuVote.query.filter_by(date=yesterday, device_id=None).count() == 3


class TestRetention:
    def test_the_purge_drops_votes_past_the_window(self, app, client, monkeypatch):
        from app.services import telemetry

        _use_fake_redis(monkeypatch)
        _, rid, menu, _ = _site_with_menu(monkeypatch, 'vote-org-15', 'VOTE15')
        db.session.add(MenuVote(
            organization_id=Restaurant.query.get(rid).organization_id,
            restaurant_id=rid,
            menu_id=menu.id,
            date=date(2020, 1, 1),
            device_id='a' * 64,
            rating=2,
        ))
        db.session.commit()

        telemetry.purge_telemetry(app)

        assert MenuVote.query.count() == 0
