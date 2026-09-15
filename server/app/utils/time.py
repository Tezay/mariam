from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

PARIS_TZ = ZoneInfo('Europe/Paris')


def paris_today() -> date:
    """Current date in Europe/Paris. Use instead of date.today()."""
    return datetime.now(PARIS_TZ).date()


def paris_now() -> datetime:
    """Current datetime in Europe/Paris. Use for time-of-day comparisons."""
    return datetime.now(PARIS_TZ)


def utc_naive_to_paris(value: datetime) -> datetime:
    """Stamp a naive-UTC column (datetime.utcnow) as Paris time before comparing it."""
    return value.replace(tzinfo=UTC).astimezone(PARIS_TZ)


WEEKDAYS_FR = ('lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche')
MONTHS_FR = (
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
)


def weekday_fr(value: date) -> str:
    """French weekday name, lowercase."""
    return WEEKDAYS_FR[value.weekday()]


def format_date_fr(value: date, *, weekday: bool = False, year: bool = True) -> str:
    """French date for user-facing text: 'mardi 1er septembre 2026'.

    Spelled out rather than left to strftime: %A and %B follow the C locale,
    which the runtime image does not carry, and would answer in English.
    """
    day = '1er' if value.day == 1 else str(value.day)
    parts = [day, MONTHS_FR[value.month - 1]]
    if year:
        parts.append(str(value.year))
    if weekday:
        parts.insert(0, weekday_fr(value))
    return ' '.join(parts)


def parse_iso_date(date_str: str | None) -> date | None:
    """Parse a strict ISO date (YYYY-MM-DD); return None if empty or invalid."""
    if not date_str:
        return None
    try:
        return datetime.strptime(date_str, '%Y-%m-%d').date()
    except (ValueError, TypeError):
        return None
