"""Live alerts, computed on demand and never stored.

One set of rules for both dashboards: the scope is the sites the caller may
read, so a site admin sees its own and a director all of his. Beyond one site
each rule folds into a single entry naming the sites it caught, which is what
keeps a thirty-site bell readable.
"""
import os
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from ..extensions import db
from ..models import AuditLog, Menu, Restaurant
from ..models.restaurant import RestaurantServiceHours
from ..utils.time import paris_now
from . import holidays
from .analytics_stats import uniques_per_site, views_per_site, votes_per_site
from .anti_abuse import env_cap
from .service_calendar import closures_by_site, is_open_on


def _threshold(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except ValueError:
        return default


TOMORROW_MENU_HOUR = 16
TRAFFIC_BASELINE_WEEKS = 4
SATISFACTION_DAYS = 7


@dataclass(frozen=True)
class Finding:
    site_id: int
    site_name: str
    detail: str


@dataclass
class Context:
    sites: list
    site_ids: list[int]
    today: date
    hour: int
    time: str
    weekday: int
    prefs: dict
    multi: bool


def _entry(key: str, severity: str, single: str, plural: str, findings: list[Finding],
           context: Context) -> list[dict]:
    """One alert per rule, worded for a single site or for several."""
    if not findings:
        return []
    names = [finding.site_name for finding in findings]
    grouped = context.multi
    return [{
        'key': key,
        'severity': severity,
        'title': (
            plural.format(count=len(findings), s='s' if len(findings) > 1 else '')
            if grouped else single
        ),
        'body': ', '.join(names) if grouped else findings[0].detail,
        'site_ids': [finding.site_id for finding in findings],
        'site_names': names,
    }]


def _serves(context: Context, day: date) -> dict[int, bool]:
    closures = closures_by_site(context.site_ids, day, day)
    return {
        site.id: is_open_on(site, day, closures.get(site.id, []))
        for site in context.sites
    }


def _published_menu_ids(site_ids: list[int], day: date) -> set[int]:
    """Sites whose menu for that day is published and carries at least one dish."""
    rows = (
        db.session.query(Menu.restaurant_id, db.func.count(Menu.id))
        .join(Menu.items)
        .filter(Menu.restaurant_id.in_(site_ids), Menu.date == day, Menu.status == 'published')
        .group_by(Menu.restaurant_id)
        .all()
    )
    return {site_id for site_id, items in rows if items}


# ── Rules ────────────────────────────────────────────────────────────────────

def _menu_today(context: Context) -> list[dict]:
    serves = _serves(context, context.today)
    published = _published_menu_ids(context.site_ids, context.today)
    missing = [
        Finding(site.id, site.name, f"Le menu du {context.today.isoformat()} n'est pas encore publié.")
        for site in context.sites
        if serves.get(site.id) and site.id not in published
    ]
    alerts = _entry(
        f'menu_unpublished:{context.today}', 'warning',
        'Menu non publié', '{count} site{s} sans menu aujourd’hui',
        missing, context,
    )

    if not missing or not context.prefs.get('notify_menu_during_service', True):
        return alerts

    hours = {
        row.restaurant_id: row
        for row in RestaurantServiceHours.query.filter(
            RestaurantServiceHours.restaurant_id.in_([f.site_id for f in missing]),
            RestaurantServiceHours.day_of_week == context.weekday,
        ).all()
    }
    serving_now = [
        finding for finding in missing
        if (row := hours.get(finding.site_id))
        and row.open_time and row.close_time
        and row.open_time <= context.time <= row.close_time
    ]
    return alerts + _entry(
        f'service_active:{context.today}', 'error',
        'Service en cours sans menu publié',
        '{count} site{s} sert sans menu publié',
        [
            Finding(f.site_id, f.site_name,
                    "Le service est actif mais le menu n'est pas visible par vos étudiants.")
            for f in serving_now
        ],
        context,
    )


def _menu_tomorrow(context: Context) -> list[dict]:
    if context.hour < TOMORROW_MENU_HOUR:
        return []
    tomorrow = context.today + timedelta(days=1)
    serves = _serves(context, tomorrow)
    published = _published_menu_ids(context.site_ids, tomorrow)
    return _entry(
        f'menu_tomorrow:{tomorrow}', 'warning',
        'Menu de demain non préparé', '{count} site{s} sans menu demain',
        [
            Finding(site.id, site.name, f"Le menu du {tomorrow.isoformat()} est encore vide.")
            for site in context.sites
            if serves.get(site.id) and site.id not in published
        ],
        context,
    )


def _traffic_drop(context: Context) -> list[dict]:
    yesterday = context.today - timedelta(days=1)
    floor = env_cap('ALERT_MIN_VIEWS', 50)
    ratio = _threshold('ALERT_TRAFFIC_DROP_PCT', 0.5)
    current = views_per_site(context.site_ids, yesterday, yesterday)

    # Same weekday only: a Monday is not comparable to a Sunday on a campus.
    baselines: dict[int, list[int]] = {}
    for week in range(1, TRAFFIC_BASELINE_WEEKS + 1):
        day = yesterday - timedelta(weeks=week)
        counts = views_per_site(context.site_ids, day, day)
        for site_id in context.site_ids:
            baselines.setdefault(site_id, []).append(counts.get(site_id, 0))

    findings = []
    for site in context.sites:
        history = baselines.get(site.id) or []
        average = sum(history) / len(history) if history else 0
        seen = current.get(site.id, 0)
        if average >= floor and seen < average * ratio:
            findings.append(Finding(
                site.id, site.name,
                f'{seen} consultations hier, {round(average)} en moyenne les mêmes jours.',
            ))
    return _entry(
        f'traffic_drop:{yesterday}', 'warning',
        'Fréquentation en baisse', '{count} site{s} en baisse de fréquentation',
        findings, context,
    )


def _low_satisfaction(context: Context) -> list[dict]:
    start = context.today - timedelta(days=SATISFACTION_DAYS - 1)
    floor = env_cap('ALERT_MIN_VOTES', 30)
    threshold = _threshold('ALERT_LOW_SCORE', 1.8)
    totals = votes_per_site(context.site_ids, start, context.today)

    findings = []
    for site in context.sites:
        count, average = totals.get(site.id, (0, 0.0))
        if count >= floor and average < threshold:
            findings.append(Finding(
                site.id, site.name,
                f'{round(average, 2)} sur 3 cette semaine, sur {count} avis.',
            ))
    return _entry(
        f'low_satisfaction:{context.today}', 'warning',
        'Satisfaction en baisse', '{count} site{s} sous le seuil de satisfaction',
        findings, context,
    )


def _vote_anomaly(context: Context) -> list[dict]:
    yesterday = context.today - timedelta(days=1)
    floor = env_cap('ALERT_MIN_VOTES', 30)
    ratio = _threshold('ALERT_VOTE_ANOMALY_RATIO', 1.5)
    totals = votes_per_site(context.site_ids, yesterday, yesterday)
    uniques = uniques_per_site(context.site_ids, yesterday, yesterday)

    findings = []
    for site in context.sites:
        count = totals.get(site.id, (0, 0.0))[0]
        seen = uniques.get(site.id, 0)
        if count >= floor and seen and count > seen * ratio:
            findings.append(Finding(
                site.id, site.name,
                f'{count} votes hier pour {seen} visiteurs uniques.',
            ))
    return _entry(
        f'vote_anomaly:{yesterday}', 'warning',
        'Votes suspects', '{count} site{s} aux votes suspects',
        findings, context,
    )


def _site_inactive(context: Context) -> list[dict]:
    """Only a director can act on this: a site admin would be the silent one."""
    if not context.multi:
        return []
    days = env_cap('ALERT_INACTIVE_DAYS', 7)
    # AuditLog stamps naive UTC, so the cutoff has to be naive UTC too.
    cutoff = datetime.now(UTC).replace(tzinfo=None) - timedelta(days=days)
    rows = (
        db.session.query(AuditLog.restaurant_id, db.func.max(AuditLog.created_at))
        .filter(AuditLog.restaurant_id.in_(context.site_ids))
        .group_by(AuditLog.restaurant_id)
        .all()
    )
    last_seen = {site_id: seen for site_id, seen in rows}
    findings = [
        Finding(site.id, site.name,
                f'Aucune action enregistrée depuis plus de {days} jours.')
        for site in context.sites
        if (seen := last_seen.get(site.id)) is None or seen < cutoff
    ]
    return _entry(
        f'site_inactive:{context.today}', 'warning',
        'Site sans activité', '{count} site{s} sans activité',
        findings, context,
    )


def _holidays(context: Context) -> list[dict]:
    """Not site-scoped: the calendar is national, so one entry per date."""
    days_before = int(context.prefs.get('holiday_alert_days_before', 5))
    horizon = context.today + timedelta(days=days_before)
    feries = holidays.get_jours_feries(context.today.year) or []
    if horizon.year > context.today.year:
        feries += holidays.get_jours_feries(context.today.year + 1) or []

    alerts = []
    for ferie in feries:
        try:
            day = date.fromisoformat(ferie['date'])
        except ValueError:
            continue
        if not context.today <= day <= horizon:
            continue
        delta = (day - context.today).days
        label = 'demain' if delta == 1 else f'dans {delta}j' if delta > 1 else "aujourd'hui"
        alerts.append({
            'key': f'holiday:{ferie["date"]}',
            'severity': 'info',
            'title': f'Jour férié {label}',
            'body': f'{ferie["description"]} — {ferie["date"]}',
            'site_ids': [],
            'site_names': [],
        })
    return alerts


RULES = [
    ('notify_menu_unpublished', _menu_today),
    ('notify_menu_tomorrow', _menu_tomorrow),
    ('notify_traffic_drop', _traffic_drop),
    ('notify_low_satisfaction', _low_satisfaction),
    ('notify_vote_anomaly', _vote_anomaly),
    ('notify_site_inactive', _site_inactive),
    ('notify_holiday_approaching', _holidays),
]


def build_context(user, site_ids: list[int]) -> Context | None:
    sites = (
        Restaurant.query
        .filter(Restaurant.id.in_(site_ids), Restaurant.is_active.is_(True))
        .order_by(Restaurant.name.asc())
        .all()
    )
    if not sites:
        return None
    now = paris_now()
    return Context(
        sites=sites,
        site_ids=[site.id for site in sites],
        today=now.date(),
        hour=now.hour,
        time=now.strftime('%H:%M'),
        weekday=now.weekday(),
        prefs=user.get_notification_preferences(),
        multi=len(sites) > 1,
    )


def live_alerts(user, site_ids: list[int]) -> list[dict]:
    """Active alerts for the sites the caller may read, worst first."""
    context = build_context(user, site_ids)
    if context is None:
        return []

    alerts = []
    for key, rule in RULES:
        if context.prefs.get(key, True):
            alerts.extend(rule(context))

    order = {'error': 0, 'warning': 1, 'info': 2}
    alerts.sort(key=lambda alert: order.get(alert['severity'], 3))
    return alerts
