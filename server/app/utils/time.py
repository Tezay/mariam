from datetime import datetime, date
from zoneinfo import ZoneInfo

PARIS_TZ = ZoneInfo('Europe/Paris')


def paris_today() -> date:
    """Current date in Europe/Paris. Use instead of date.today()."""
    return datetime.now(PARIS_TZ).date()


def paris_now() -> datetime:
    """Current datetime in Europe/Paris. Use for time-of-day comparisons."""
    return datetime.now(PARIS_TZ)
