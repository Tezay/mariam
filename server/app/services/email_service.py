"""Outgoing email, over plain SMTP.

The stdlib is enough: a provider SDK would add a dependency and a vendor lock
for one weekly message. Without `SMTP_HOST` every send is a logged no-op, so a
deployment that never configures mail simply has none.

Wording and layout live in `app/templates/emails/`, one folder per language
(`EMAIL_LOCALE`, French by default) over a shared shell; only the figures are
shaped here. No image and no SVG: Gmail, Yahoo and Outlook drop the latter, and
a blocked image would take the whole reading with it.
"""
import os
import smtplib
from datetime import date, timedelta
from email.message import EmailMessage

from flask import current_app, render_template
from itsdangerous import BadSignature, URLSafeSerializer
from jinja2 import TemplateNotFound

from ..models import DishCatalog, Organization, Restaurant, User
from ..utils.time import paris_now, paris_today
from .access import accessible_restaurant_ids
from .alerts import live_alerts
from .analytics_stats import Scope, overview, satisfaction_stats, traffic_stats
from .dish_stats import first_served
from .redis_client import acquire_job_lock

DIGEST_LOCK_TTL = 3600
DEFAULT_LOCALE = 'fr'
UNSUBSCRIBE_SALT = 'digest-unsubscribe'

DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
LEVEL_LABELS = {'1': 'Pas aimé', '2': 'Aimé', '3': 'Adoré'}
LEVEL_COLORS = {'1': '#dc2626', '2': '#f59e0b', '3': '#16a34a'}
PAGE_LABELS = {
    'today': 'Menu du jour',
    'tomorrow': 'Menu de demain',
    'week': 'Semaine',
    'events': 'Événements',
}
TOP_DISHES = 3
WATCHED_SITES = 3


# ── Sending ──────────────────────────────────────────────────────────────────

def is_configured() -> bool:
    return bool(os.environ.get('SMTP_HOST') and os.environ.get('SMTP_SENDER'))


def send_email(to: str, subject: str, text: str, html: str | None = None,
               unsubscribe_url: str | None = None) -> bool:
    """True when the message left the process; False on any failure."""
    if not is_configured():
        current_app.logger.info('SMTP not configured, email to %s not sent', to)
        return False

    message = EmailMessage()
    message['From'] = os.environ['SMTP_SENDER']
    message['To'] = to
    message['Subject'] = subject
    if unsubscribe_url:
        # RFC 8058: lets the mail client draw its own one-click unsubscribe.
        message['List-Unsubscribe'] = f'<{unsubscribe_url}>'
        message['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click'
    message.set_content(text)
    if html:
        message.add_alternative(html, subtype='html')

    try:
        with smtplib.SMTP(os.environ['SMTP_HOST'], int(os.environ.get('SMTP_PORT', 587))) as server:
            if os.environ.get('SMTP_TLS', '1') == '1':
                server.starttls()
            username = os.environ.get('SMTP_USERNAME')
            if username:
                server.login(username, os.environ.get('SMTP_PASSWORD', ''))
            server.send_message(message)
        return True
    except Exception:
        current_app.logger.exception('Email to %s failed', to)
        return False


def render_email(name: str, **context) -> dict:
    """Subject, plain text and HTML of one template, in the configured language."""
    locale = os.environ.get('EMAIL_LOCALE', DEFAULT_LOCALE)

    def render(suffix: str) -> str:
        try:
            return render_template(f'emails/{locale}/{name}.{suffix}', locale=locale, **context)
        except TemplateNotFound:
            return render_template(
                f'emails/{DEFAULT_LOCALE}/{name}.{suffix}', locale=DEFAULT_LOCALE, **context
            )

    return {
        'subject': render('subject.txt').strip(),
        'text': render('txt').strip() + '\n',
        'html': render('html'),
    }


# ── Unsubscribe ──────────────────────────────────────────────────────────────

def _serializer() -> URLSafeSerializer:
    return URLSafeSerializer(current_app.config['SECRET_KEY'], salt=UNSUBSCRIBE_SALT)


def unsubscribe_token(user_id: int) -> str:
    return _serializer().dumps(user_id)


def user_from_token(token: str) -> User | None:
    try:
        return User.query.get(int(_serializer().loads(token)))
    except (BadSignature, TypeError, ValueError):
        return None


def unsubscribe_url(user_id: int) -> str:
    return f'{_base_url()}/api/v1/public/unsubscribe/{unsubscribe_token(user_id)}'


# ── Weekly digest ────────────────────────────────────────────────────────────

def last_week(today: date | None = None) -> tuple[date, date]:
    """Monday to Sunday of the week that just ended, in Paris."""
    today = today or paris_today()
    end = today - timedelta(days=today.weekday() + 1)
    return end - timedelta(days=6), end


def _scope_for(site_ids: list[int], start: date, end: date) -> Scope:
    span = (end - start).days + 1
    previous_end = start - timedelta(days=1)
    return Scope(
        site_ids=sorted(site_ids),
        start=start,
        end=end,
        prev_start=previous_end - timedelta(days=span - 1),
        prev_end=previous_end,
    )


def _base_url() -> str:
    return os.environ.get('FRONTEND_URL', 'http://localhost:5173').split(',')[0].strip()


def _number(value) -> str:
    return '0' if not value else f'{round(value):,}'.replace(',', ' ')


def _decimal(value, digits: int = 2) -> str:
    return f'{value:.{digits}f}'.replace('.', ',')


def _percent(value) -> str:
    return '0 %' if value is None else f'{value * 100:.0f} %'


def _change(metric: dict, kind: str) -> dict:
    """How the figure moved against the week before, and whether that reads well."""
    delta = metric.get('delta')
    if not delta:
        return {'label': '', 'tone': 'flat'}
    tone = 'up' if delta > 0 else 'down'
    if kind == 'points':
        return {'label': f'{delta * 100:+.0f} pts', 'tone': tone}
    if kind == 'score':
        return {'label': f'{delta:+.2f}'.replace('.', ','), 'tone': tone}
    percent = metric.get('delta_pct')
    return {'label': f'{percent:+.0f} %' if percent else '', 'tone': tone}


def _lead_time(hours) -> str:
    """Same reading as the dashboard: a negative delay means published late."""
    if not hours:
        return 'non mesuré'
    return f'{abs(round(hours))} heures {"avant" if hours > 0 else "après"} le service'


def _metric_blocks(kpis: dict) -> dict:
    score = kpis['satisfaction'].get('value')
    return {
        'satisfaction': {
            'value': _decimal(score) if score is not None else 'sans avis',
            'unit': ' / 3' if score is not None else '',
            'change': _change(kpis['satisfaction'], 'score'),
        },
        'traffic': {
            'views': _number(kpis['views'].get('value')),
            'change': _change(kpis['views'], 'percent'),
        },
        'publication': {
            'value': _percent(kpis['publication_rate'].get('value')).replace(' %', ''),
            'unit': ' %',
            'change': _change(kpis['publication_rate'], 'points'),
        },
    }


def _dish_lines(dishes: list[dict], limit: int = TOP_DISHES) -> list[dict]:
    return [
        {'name': dish['name'], 'detail': f'{_decimal(dish["score"])} / 3 ({dish["votes"]} avis)'}
        for dish in dishes[:limit]
    ]


def _new_dish_lines(site_ids: list[int], start: date, end: date, scored: dict) -> list[dict]:
    newcomers = first_served(site_ids, start, end)
    if not newcomers:
        return []
    dishes = DishCatalog.query.filter(DishCatalog.id.in_(newcomers)).all()
    # Sites of one organization each hold their own row for the same dish name.
    by_name: dict[str, dict] = {}
    for dish in sorted(dishes, key=lambda item: item.name):
        rating = scored.get(dish.id)
        current = by_name.get(dish.name)
        if current is None or (rating and not current['rating']):
            by_name[dish.name] = {'name': dish.name, 'rating': rating}
    return [
        {
            'name': entry['name'],
            'detail': (
                f'{_decimal(entry["rating"]["score"])} / 3 ({entry["rating"]["votes"]} avis)'
                if entry['rating'] else 'pas encore d’avis'
            ),
        }
        for entry in list(by_name.values())[:TOP_DISHES]
    ]


def _headline(alerts: list[dict], kpis: dict) -> str:
    """What the subject leads with, so two weeks never read alike."""
    urgent = next((alert for alert in alerts if alert['severity'] in ('error', 'warning')), None)
    if urgent:
        return urgent['title'].lower()
    score = kpis['satisfaction'].get('value')
    if score is not None:
        return f'satisfaction {_decimal(score)} / 3'
    views = kpis['views'].get('value')
    return f'{_number(views)} consultations' if views else 'rien à signaler'


def _site_blocks(data: dict, satisfaction: dict, traffic: dict) -> dict:
    summary = satisfaction['summary']
    counted = sum(summary['distribution'].values()) or 1
    levels = [
        {
            'label': LEVEL_LABELS[level],
            'value': f'{count * 100 // counted} %',
            'percent': count * 100 // counted,
            'color': LEVEL_COLORS[level],
        }
        for level, count in sorted(summary['distribution'].items(), reverse=True)
    ] if summary['votes'] else []

    busiest = max((row['views'] or 0 for row in traffic['series']), default=0) or 1
    days = [
        {
            'label': DAY_LABELS[date.fromisoformat(row['date']).weekday()],
            'value': _number(row['views']),
            'percent': round((row['views'] or 0) / busiest * 100),
            'color': '#093EAA',
        }
        for row in traffic['series']
    ]

    peak = max(traffic['hour_profile'], key=lambda row: row['views'], default=None)
    pages = [row for row in traffic['by_page_kind'] if row['page_kind'] in PAGE_LABELS]
    top_page = max(pages, key=lambda row: row['views'], default=None)
    kpis = data['kpis']
    lead_time = kpis['avg_lead_time_hours'].get('value')

    return {
        'distribution': levels,
        'days': days,
        'satisfaction_extra': {
            'votes': summary['votes'],
            'participation': _percent(summary['participation_rate']),
        },
        'traffic_extra': {
            'uniques': _number(traffic['totals']['unique_visitors']),
            'peak': (
                f'{peak["hour"]:02d}h à {(peak["hour"] + 1) % 24:02d}h'
                if peak and peak['views'] else 'pas de pic marqué'
            ),
            'top_page': (
                f'{PAGE_LABELS[top_page["page_kind"]]}, {_number(top_page["views"])} vues'
                if top_page and top_page['views'] else 'aucune consultation'
            ),
        },
        'publication_extra': {
            'punctuality': _percent(kpis['punctuality_rate'].get('value')),
            'lead_time': _lead_time(lead_time),
            'photos': _percent(kpis['completeness'].get('photo_rate')),
        },
    }


def _org_blocks(data: dict) -> dict:
    sites = data['sites']
    rated = sorted(
        (site for site in sites if site.get('score') is not None),
        key=lambda site: site['score'],
        reverse=True,
    )

    def line(site):
        return {
            'name': site['name'],
            'detail': (
                f'{_decimal(site["score"])} / 3 '
                f'({_percent(site["publication_rate"])} publié)'
            ),
        }

    leaders = [line(site) for site in rated[:WATCHED_SITES]]
    laggards = (
        [line(site) for site in reversed(rated[-WATCHED_SITES:])]
        if len(rated) > WATCHED_SITES * 2 else []
    )

    watch = [
        f'{site["name"]} : {_percent(site["publication_rate"])} des jours publiés'
        for site in sorted(sites, key=lambda row: row['publication_rate'] or 0)
        if (site['publication_rate'] or 0) < 1
    ][:WATCHED_SITES]
    watch += [
        f'{site["name"]} : satisfaction {_decimal(site["score"])} / 3'
        for site in rated
        if site['score'] < 2
    ][:WATCHED_SITES]

    total = len(sites) or 1
    collecting = sum(1 for site in sites if (site.get('votes') or 0) > 0)
    complete = sum(1 for site in sites if (site.get('publication_rate') or 0) >= 1)
    return {
        'leaders': leaders,
        'laggards': laggards,
        'watch': watch,
        'coverage': [
            {
                'label': 'Sites collectant des avis',
                'value': f'{collecting} sur {len(sites)}',
                'percent': collecting * 100 // total,
                'color': '#093EAA',
            },
            {
                'label': 'Sites publiant chaque jour',
                'value': f'{complete} sur {len(sites)}',
                'percent': complete * 100 // total,
                'color': '#16a34a',
            },
        ],
    }


def build_digest(user, site_ids: list[int], start: date, end: date) -> dict:
    """Subject, plain text and HTML of one recipient's weekly summary."""
    scope = _scope_for(site_ids, start, end)
    data = overview(scope)
    satisfaction = satisfaction_stats(scope)
    alerts = live_alerts(user, site_ids)
    multi = len(site_ids) > 1
    metrics = _metric_blocks(data['kpis'])

    scored = {dish['dish_id']: dish for dish in satisfaction['top_dishes']}
    common = {
        'start': start.strftime('%d/%m'),
        'end': end.strftime('%d/%m'),
        'site_count': len(site_ids),
        'headline': _headline(alerts, data['kpis']),
        'top_dishes': _dish_lines(satisfaction['top_dishes']),
        'flop_dishes': _dish_lines(satisfaction['flop_dishes'], limit=1),
        'new_dishes': _new_dish_lines(site_ids, start, end, scored),
        'alerts': [f'{alert["title"]} : {alert["body"]}' for alert in alerts],
        'url': _base_url() + ('/org' if multi else '/admin/stats'),
        'settings_url': _base_url() + ('/org/account' if multi else '/admin/settings'),
        'unsubscribe_url': unsubscribe_url(user.id),
        'send_day': WEEKDAYS[min(6, max(0, user.get_notification_preferences().get('digest_day', 0)))],
    }

    if multi:
        organization = Organization.query.get(user.organization_id)
        return render_email(
            'weekly_digest_org',
            org_name=organization.name if organization else 'Votre organisation',
            **common,
            **metrics,
            **_org_blocks(data),
        )

    site = Restaurant.query.get(site_ids[0])
    blocks = _site_blocks(data, satisfaction, traffic_stats(scope))
    return render_email(
        'weekly_digest_site',
        site_name=site.name if site else 'Votre restaurant',
        **common,
        distribution=blocks['distribution'],
        days=blocks['days'],
        satisfaction={**metrics['satisfaction'], **blocks['satisfaction_extra']},
        traffic={**metrics['traffic'], **blocks['traffic_extra']},
        publication={**metrics['publication'], **blocks['publication_extra']},
    )


def digest_recipients(weekday: int | None = None, hour: int | None = None) -> list[User]:
    """Subscribers, optionally only those expecting the email in this very hour."""
    users = User.query.filter(
        User.is_active.is_(True), User.role.in_(('admin', 'org_admin'))
    ).all()
    recipients = []
    for user in users:
        prefs = user.get_notification_preferences()
        if not user.email or not prefs.get('weekly_digest'):
            continue
        if weekday is not None and prefs.get('digest_day', 0) != weekday:
            continue
        if hour is not None and prefs.get('digest_hour', 8) != hour:
            continue
        recipients.append(user)
    return recipients


def send_weekly_digest(app) -> int:
    """Send to the subscribers whose slot is the current hour, in Paris.

    The job runs hourly and each recipient is claimed for the week, so a
    restart inside the hour cannot send the same summary twice.
    """
    with app.app_context():
        if not is_configured():
            app.logger.info('SMTP not configured, weekly digest skipped')
            return 0

        now = paris_now()
        start, end = last_week()
        week = f'{start.isocalendar().year}-{start.isocalendar().week}'

        sent = 0
        for user in digest_recipients(now.weekday(), now.hour):
            if not acquire_job_lock(f'digest_lock:{user.id}:{week}', DIGEST_LOCK_TTL):
                continue
            site_ids = sorted(accessible_restaurant_ids(user))
            if not site_ids:
                continue
            digest = build_digest(user, site_ids, start, end)
            if send_email(
                user.email, digest['subject'], digest['text'], digest['html'],
                unsubscribe_url=unsubscribe_url(user.id),
            ):
                sent += 1
        app.logger.info('Weekly digest sent to %s recipients', sent)
        return sent
