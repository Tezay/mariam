from datetime import date, datetime
from zoneinfo import ZoneInfo

PARIS_TZ = ZoneInfo('Europe/Paris')


def paris_today() -> date:
    """Current date in Europe/Paris. Use instead of date.today()."""
    return datetime.now(PARIS_TZ).date()


def paris_now() -> datetime:
    """Current datetime in Europe/Paris. Use for time-of-day comparisons."""
    return datetime.now(PARIS_TZ)


def parse_iso_date(date_str: str | None) -> date | None:
    """Parse a strict ISO date (YYYY-MM-DD); return None if empty or invalid."""
    if not date_str:
        return None
    try:
        return datetime.strptime(date_str, '%Y-%m-%d').date()
    except (ValueError, TypeError):
        return None
