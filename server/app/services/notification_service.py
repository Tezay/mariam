"""
MARIAM - Service de notifications push.

Gère l'envoi des notifications Web Push via VAPID :
- Menu du jour (notification quotidienne planifiée)
- Menu du lendemain (notification la veille au soir)
- Événements à venir (notification à la publication)
"""
import os
import json
import logging
from datetime import date, time, datetime, timedelta

from pywebpush import webpush, WebPushException

logger = logging.getLogger(__name__)


# ========================================
# Configuration VAPID
# ========================================
def get_vapid_claims():
    """Retourne les paramètres VAPID pour pywebpush."""
    return {
        'private_key': os.environ.get('VAPID_PRIVATE_KEY', ''),
        'claims': {
            'sub': f"mailto:{os.environ.get('VAPID_CONTACT_EMAIL', 'contact@mariam.app')}"
        }
    }


def get_vapid_public_key():
    """Retourne la clé publique VAPID (exposée côté client)."""
    return os.environ.get('VAPID_PUBLIC_KEY', '')


# ========================================
# Envoi de notifications
# ========================================
def send_push_notification(subscription_info: dict, payload: dict) -> bool:
    """
    Envoie une notification push à un abonné.

    Args:
        subscription_info: dict avec endpoint + keys (p256dh, auth)
        payload: dict du contenu de la notification (title, body, icon, url, etc.)

    Returns:
        True si envoyé avec succès, False sinon.
    """
    vapid = get_vapid_claims()

    if not vapid['private_key']:
        logger.warning("VAPID_PRIVATE_KEY non configurée — notification ignorée")
        return False

    # En-têtes Web Push (RFC 8030) :
    #   Urgency: high  → FCM/APNs livre immédiatement, même en mode Doze (Android).
    #   Topic           → le push service remplace un message en attente de même topic
    #                     (évite les doublons si le device est hors-ligne).
    topic = payload.get('tag', '')
    push_headers: dict[str, str | int | float] = {'Urgency': 'high'}
    if topic:
        # Topic : max 32 chars, base64url alphabet (a-z A-Z 0-9 - _)
        push_headers['Topic'] = topic[:32]

    try:
        resp = webpush(
            subscription_info=subscription_info,
            data=json.dumps(payload, ensure_ascii=False),
            vapid_private_key=vapid['private_key'],
            vapid_claims=vapid['claims'],
            timeout=10,
            ttl=86400,
            headers=push_headers,
        )
        logger.debug(
            "Push envoyé (HTTP %s) → %s",
            resp.status_code,
            subscription_info.get('endpoint', '')[:80],
        )
        return True

    except WebPushException as e:
        status_code = e.response.status_code if e.response is not None else None

        if status_code in (404, 410):
            # Endpoint expiré ou révoqué — supprimer la souscription
            logger.info(f"Endpoint expiré (HTTP {status_code}), suppression : {subscription_info.get('endpoint', '')[:80]}...")
            _remove_expired_subscription(subscription_info['endpoint'])
            return False

        logger.error(f"Erreur Web Push (HTTP {status_code}) : {e}")
        return False

    except Exception as e:
        logger.error(f"Erreur inattendue lors de l'envoi push : {e}")
        return False


def _remove_expired_subscription(endpoint: str):
    """Supprime une souscription dont l'endpoint est expiré."""
    from ..models.push_subscription import PushSubscription
    from ..extensions import db

    sub = PushSubscription.query.filter_by(endpoint=endpoint).first()
    if sub:
        db.session.delete(sub)
        db.session.commit()
        logger.info(f"Souscription {sub.id} supprimée (endpoint expiré)")


# ========================================
# Construction des payloads de notification
# ========================================

def _format_menu_body(menu_items: list[dict]) -> str | None:
    """
    Construit le corps de la notification à partir des items du menu.
    Retourne None si la liste est vide (= pas de notification à envoyer).
    """
    if not menu_items:
        return None

    # Un item par catégorie, dans l'ordre d'apparition
    seen: dict[str, str] = {}
    for item in menu_items:
        cat = item.get('category', '')
        if cat not in seen:
            seen[cat] = item.get('name', '')

    lines = [f"• {name}" for name in seen.values() if name]
    return '\n'.join(lines) if lines else None


def build_today_menu_payload(menu_items: list[dict]) -> dict | None:
    """
    Construit le payload pour la notification du menu du jour.
    Retourne None si aucun menu n'est défini (pas de notification).
    """
    body = _format_menu_body(menu_items)
    if body is None:
        return None

    return {
        'title': '\U0001F37D\uFE0F Menu du jour',
        'body': body,
        'icon': '/web-app-manifest-192x192.png',
        'badge': '/favicon-96x96.png',
        'url': '/menu',
        'tag': f"menu-today-{date.today().isoformat()}",
    }


def build_tomorrow_menu_payload(menu_items: list[dict]) -> dict | None:
    """
    Construit le payload pour la notification du menu du lendemain.
    Retourne None si aucun menu n'est défini (pas de notification).
    """
    body = _format_menu_body(menu_items)
    if body is None:
        return None

    tomorrow = date.today() + timedelta(days=1)
    day_names = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
    day_name = day_names[tomorrow.weekday()]

    return {
        'title': f'\U0001F37D\uFE0F Menu de demain ({day_name})',
        'body': body,
        'icon': '/web-app-manifest-192x192.png',
        'badge': '/favicon-96x96.png',
        'url': '/menu',
        'tag': f"menu-tomorrow-{tomorrow.isoformat()}",
    }


def build_event_payload(event_title: str, event_date: str, reminder: str = '') -> dict:
    """
    Construit le payload pour la notification d'un événement.

    Args:
        reminder: 'tomorrow', '7days' ou '' pour choisir le préfixe du body.
    """
    if reminder == 'tomorrow':
        body = f"Demain \u2014 {event_date}"
    elif reminder == '7days':
        body = f"Dans une semaine \u2014 {event_date}"
    else:
        body = f"\U0001F4C5 {event_date}"

    return {
        'title': event_title,
        'body': body,
        'icon': '/web-app-manifest-192x192.png',
        'badge': '/favicon-96x96.png',
        'url': '/menu',
        'tag': f"event-{event_title[:20]}-{reminder or event_date}",
    }


# ========================================
# Tâche planifiée : vérification et envoi
# ========================================
def check_and_send_notifications(app):
    """
    Tâche exécutée toutes les minutes par APScheduler.
    Vérifie les souscriptions dont l'heure correspond et envoie les notifications.

    Utilise un verrou Redis (ou fallback sans verrou en dev) pour éviter
    les envois en double si plusieurs instances du backend tournent.
    """
    with app.app_context():
        from ..models.push_subscription import PushSubscription
        from ..models.menu import Menu
        from ..models.restaurant import Restaurant
        from ..extensions import db

        now = datetime.utcnow()
        current_time = time(now.hour, now.minute)
        today = date.today()
        tomorrow = today + timedelta(days=1)

        # Acquérir un verrou Redis pour cette minute (évite les doublons multi-instance)
        lock_key = f"mariam:notif_lock:{now.strftime('%Y%m%d%H%M')}"
        if not _acquire_lock(lock_key, ttl=55):
            return

        sent_count = 0

        try:
            # ===== Menu du jour =====
            today_subs = PushSubscription.query.filter(
                PushSubscription.notify_today_menu == True,
                PushSubscription.notify_today_menu_time == current_time,
            ).all()

            if today_subs:
                # Regrouper par restaurant pour n'exécuter qu'une requête menu par RU
                by_restaurant = {}
                for sub in today_subs:
                    by_restaurant.setdefault(sub.restaurant_id, []).append(sub)

                for restaurant_id, subs in by_restaurant.items():
                    restaurant = Restaurant.query.get(restaurant_id)
                    if not restaurant:
                        continue

                    menu = Menu.query.filter_by(
                        restaurant_id=restaurant_id,
                        date=today,
                        status='published'
                    ).first()

                    items = [item.to_dict() for item in menu.items] if menu else []
                    payload = build_today_menu_payload(items)

                    if payload is not None:
                        for sub in subs:
                            if send_push_notification(sub.get_subscription_info(), payload):
                                sub.last_notified_at = now
                                sent_count += 1

                db.session.commit()

            # ===== Menu du lendemain =====
            tomorrow_subs = PushSubscription.query.filter(
                PushSubscription.notify_tomorrow_menu == True,
                PushSubscription.notify_tomorrow_menu_time == current_time,
            ).all()

            if tomorrow_subs:
                by_restaurant = {}
                for sub in tomorrow_subs:
                    by_restaurant.setdefault(sub.restaurant_id, []).append(sub)

                for restaurant_id, subs in by_restaurant.items():
                    restaurant = Restaurant.query.get(restaurant_id)
                    if not restaurant:
                        continue

                    menu = Menu.query.filter_by(
                        restaurant_id=restaurant_id,
                        date=tomorrow,
                        status='published'
                    ).first()

                    items = [item.to_dict() for item in menu.items] if menu else []
                    payload = build_tomorrow_menu_payload(items)

                    if payload is not None:
                        for sub in subs:
                            if send_push_notification(sub.get_subscription_info(), payload):
                                sub.last_notified_at = now
                                sent_count += 1

                db.session.commit()

            # ===== Événements à venir (J-7 et J-1) =====
            # Vérifié une seule fois par jour (première exécution de la journée).
            sent_count = _check_event_notifications(db, now, sent_count)

        except Exception as e:
            logger.error(f"Erreur dans check_and_send_notifications : {e}")
            db.session.rollback()

        if sent_count > 0:
            logger.info(f"✅ {sent_count} notification(s) push envoyée(s)")


def _check_event_notifications(db, now, sent_count: int) -> int:
    """
    Vérifie les événements publiés nécessitant une notification (J-7 ou J-1).
    Envoie aux abonnés ayant activé notify_events.
    Retourne le nouveau sent_count.
    """
    from ..models.push_subscription import PushSubscription
    from ..models.event import Event

    today = date.today()
    target_7d = today + timedelta(days=7)
    target_1d = today + timedelta(days=1)

    day_names = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

    # Événements publiés à J-7 ou J-1
    events = Event.query.filter(
        Event.status == 'published',
        Event.is_active == True,
        Event.event_date.in_([target_7d, target_1d]),
    ).all()

    for event in events:
        # Déterminer quel rappel envoyer
        is_7d = (event.event_date == target_7d) and not event.notified_7d
        is_1d = (event.event_date == target_1d) and not event.notified_1d

        if not is_7d and not is_1d:
            continue

        date_str = day_names[event.event_date.weekday()] + ' ' + event.event_date.strftime('%d/%m')

        if is_1d:
            payload = build_event_payload(event.title, date_str, reminder='tomorrow')
        else:
            payload = build_event_payload(event.title, date_str, reminder='7days')

        subs = PushSubscription.query.filter(
            PushSubscription.restaurant_id == event.restaurant_id,
            PushSubscription.notify_events == True,
        ).all()

        event_sent = 0
        for sub in subs:
            if send_push_notification(sub.get_subscription_info(), payload):
                sub.last_notified_at = now
                event_sent += 1

        # Marquer comme envoyé
        if is_7d:
            event.notified_7d = True
        if is_1d:
            event.notified_1d = True

        sent_count += event_sent
        if event_sent:
            logger.info(f"\U0001F4C5 Événement '{event.title}' ({'tomorrow' if is_1d else '7days'}) : {event_sent} notification(s)")

    db.session.commit()
    return sent_count


# ========================================
# Verrou Redis (anti-doublon multi-instance)
# ========================================
def _acquire_lock(lock_key: str, ttl: int = 55) -> bool:
    """
    Tente d'acquérir un verrou Redis pour éviter les exécutions concurrentes.
    Retourne True si le verrou est acquis, False sinon.
    En développement (sans Redis), retourne toujours True.
    """
    redis_url = os.environ.get('REDIS_URL', '')

    if not redis_url or redis_url == 'memory://':
        # Pas de Redis — mode dev, pas de verrou nécessaire
        return True

    try:
        import redis
        r = redis.from_url(redis_url)
        # SET NX (set if not exists) avec TTL
        acquired = r.set(lock_key, '1', nx=True, ex=ttl)
        return bool(acquired)
    except Exception as e:
        logger.warning(f"Impossible d'acquérir le verrou Redis : {e}")
        # En cas d'erreur Redis, on continue quand même pour éviter de bloquer les notifications
        return True
