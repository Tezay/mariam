"""
Tests des routes publiques de menu (sans JWT).
Vérifie que les menus publiés sont visibles et les brouillons invisibles.
"""
import datetime
from app.extensions import db
from conftest import make_restaurant, make_user, get_token, auth_headers


def _make_menu(restaurant_id, date_str, published=False):
    """Crée un menu en base pour la date donnée (doit être appelé dans un app context)."""
    from app.models import Menu
    menu = Menu(
        restaurant_id=restaurant_id,
        date=datetime.date.fromisoformat(date_str),
        status='published' if published else 'draft',
    )
    db.session.add(menu)
    db.session.commit()
    return menu.id


def _today_iso():
    from app.utils.time import paris_today
    return paris_today().isoformat()


class TestPublicMenuToday:
    def test_no_menu_returns_gracefully(self, app, client):
        make_restaurant(app)
        res = client.get('/v1/menus/today')
        assert res.status_code == 200

    def test_published_menu_is_visible(self, app, client):
        rid = make_restaurant(app)
        today = _today_iso()
        _make_menu(rid, today, published=True)
        res = client.get('/v1/menus/today')
        assert res.status_code == 200
        data = res.get_json()
        assert data.get('menu') is not None

    def test_draft_menu_not_visible(self, app, client):
        rid = make_restaurant(app)
        today = _today_iso()
        _make_menu(rid, today, published=False)
        res = client.get('/v1/menus/today')
        assert res.status_code == 200
        data = res.get_json()
        assert data.get('menu') is None


class TestPublicMenuWeek:
    def test_week_returns_list_or_dict(self, app, client):
        make_restaurant(app)
        res = client.get('/v1/menus/week')
        assert res.status_code == 200
        data = res.get_json()
        assert isinstance(data, (list, dict))
