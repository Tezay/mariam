"""Public and school holidays, from the official calendars."""
from app.services import holidays
from conftest import auth_headers, get_token, make_restaurant, make_user


def test_the_public_holidays_of_a_year(client, monkeypatch):
    monkeypatch.setattr(
        holidays, 'get_jours_feries', lambda year: [{'date': f'{year}-01-01', 'description': "Jour de l'An"}]
    )

    res = client.get('/v1/holidays/2026')

    assert res.get_json() == {'items': [{'date': '2026-01-01', 'description': "Jour de l'An"}]}


def test_a_year_out_of_range_or_a_silent_calendar(client, monkeypatch):
    monkeypatch.setattr(holidays, 'get_jours_feries', lambda year: None)

    assert client.get('/v1/holidays/1999').get_json()['code'] == 'year_out_of_range'
    assert client.get('/v1/holidays/2026').get_json()['code'] == 'holidays_unavailable'


def test_the_school_holidays_of_a_zone(app, client, monkeypatch):
    make_restaurant(app)
    make_user(app)
    asked = []

    def fake(year, zone):
        asked.append(zone)
        return [{'start_date': '2026-10-17', 'end_date': '2026-11-02', 'description': 'Toussaint'}]

    monkeypatch.setattr(holidays, 'get_school_holidays', fake)
    headers = auth_headers(get_token(client))

    res = client.get('/v1/school-holidays/2026?zone=C', headers=headers)

    assert res.get_json()['items'][0]['description'] == 'Toussaint'
    assert asked == ['C']
    assert client.get('/v1/school-holidays/2026?zone=D', headers=headers).status_code == 422
