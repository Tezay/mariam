"""The dates whose published menus an anonymous caller may read."""
from datetime import date, timedelta

# A site's own settings, until it changes them; the bounds of what it may set.
DAYS_AHEAD, DAYS_AHEAD_MAX = 7, 28
DAYS_BACK, DAYS_BACK_MAX = 30, 90
# Bounds one request, whatever the caller may see.
MAX_RANGE_DAYS = 62


def visible_range(restaurant, today: date) -> tuple[date, date]:
    return (
        today - timedelta(days=restaurant.menu_days_back),
        today + timedelta(days=restaurant.menu_days_ahead),
    )
