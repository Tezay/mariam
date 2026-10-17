"""The dates whose published menus an anonymous caller may read."""
from datetime import date, timedelta

DAYS_AHEAD = 7
DAYS_BACK = 30
# Bounds one request, whatever the caller may see.
MAX_RANGE_DAYS = 62


def visible_range(today: date) -> tuple[date, date]:
    return today - timedelta(days=DAYS_BACK), today + timedelta(days=DAYS_AHEAD)
