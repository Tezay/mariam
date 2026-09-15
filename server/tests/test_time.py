"""French dates, written out because the runtime image carries no locale."""
from datetime import date

from app.utils.time import format_date_fr, weekday_fr


class TestFormatDateFr:
    def test_the_first_of_a_month_is_ordinal(self):
        assert format_date_fr(date(2026, 9, 1)) == '1er septembre 2026'

    def test_every_other_day_is_cardinal(self):
        assert format_date_fr(date(2026, 9, 15)) == '15 septembre 2026'

    def test_the_weekday_leads_when_asked(self):
        assert format_date_fr(date(2026, 9, 15), weekday=True) == 'mardi 15 septembre 2026'

    def test_the_year_can_be_dropped(self):
        assert format_date_fr(date(2026, 9, 15), weekday=True, year=False) == 'mardi 15 septembre'

    def test_accented_months_come_out_accented(self):
        assert format_date_fr(date(2026, 8, 3), year=False) == '3 août'
        assert format_date_fr(date(2026, 12, 24), year=False) == '24 décembre'

    def test_weekdays_follow_the_iso_week(self):
        assert weekday_fr(date(2026, 9, 14)) == 'lundi'
        assert weekday_fr(date(2026, 9, 20)) == 'dimanche'
