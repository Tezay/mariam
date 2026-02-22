/**
 * MARIAM — Utilitaires Web Push & PWA.
 *
 * Gère côté client :
 * - Détection de plateforme (iOS / Android / Desktop) et du mode PWA
 * - Enregistrement du Service Worker et souscription push (VAPID)
 * - Lecture / écriture des préférences de notification côté serveur
 */
import api from './api';

// ========================================
// Types
// ========================================

export type Platform = 'ios' | 'android' | 'desktop';

export interface NotificationPreferences {
    notify_today_menu: boolean;
    notify_today_menu_time: string; // "HH:MM"
    notify_tomorrow_menu: boolean;
    notify_tomorrow_menu_time: string; // "HH:MM"
    notify_events: boolean;
}

export interface ServerSubscription {
    id: number;
    restaurant_id: number;
    notify_today_menu: boolean;
    notify_today_menu_time: string;
    notify_tomorrow_menu: boolean;
    notify_tomorrow_menu_time: string;
    notify_events: boolean;
    platform: string | null;
    created_at: string | null;
}

export const DEFAULT_PREFERENCES: NotificationPreferences = {
    notify_today_menu: true,
    notify_today_menu_time: '11:00',
    notify_tomorrow_menu: false,
    notify_tomorrow_menu_time: '19:00',
    notify_events: true,
};

// ========================================
// Détection de plateforme
// ========================================

export function detectPlatform(): Platform {
    const ua = navigator.userAgent || '';
    if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
        return 'ios';
    }
    if (/Android/.test(ua)) {
        return 'android';
    }
    return 'desktop';
}

// Vérifie si l'app est exécutée en mode PWA installée (standalone)
export function isPwaInstalled(): boolean {
    return (
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true
    );
}

// Vérifie si le navigateur supporte les notifications push
export function isPushSupported(): boolean {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// Sur iOS : notifications push ne fonctionnent qu'en mode PWA installée
export function requiresPwaForPush(): boolean {
    return detectPlatform() === 'ios' && !isPwaInstalled();
}

// ========================================
// Service Worker - helpers internes
// ========================================

// Timeout par défaut pour l'attente du Service Worker (ms)
const SW_READY_TIMEOUT = 10_000;

// URL du SW minimal push (servi depuis public/)
const PUSH_SW_URL = '/sw-push.js';

// Retourne le ServiceWorkerRegistration existant, s'il possède un SW actif
async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
    if (!('serviceWorker' in navigator)) return null;
    try {
        const reg = await navigator.serviceWorker.getRegistration('/');
        return reg?.active ? reg : null;
    } catch {
        return null;
    }
}

// Observe cycle de vie d'un SW (installing -> activated) et résout à l'activation ou rejette en cas d'erreur ou de timeout
function waitForActivation(
    reg: ServiceWorkerRegistration,
    timeoutMs: number,
): Promise<ServiceWorkerRegistration> {
    // Déjà actif ?
    if (reg.active) return Promise.resolve(reg);

    const sw = reg.installing || reg.waiting;
    if (!sw) {
        return Promise.reject(
            new Error('Aucun Service Worker en cours d\'installation.'),
        );
    }

    // Capture non-null pour les callbacks
    const worker = sw;

    return new Promise<ServiceWorkerRegistration>((resolve, reject) => {
        const timeout = setTimeout(() => {
            worker.removeEventListener('statechange', onStateChange);
            reject(new Error(
                'Le Service Worker met trop de temps à démarrer. ' +
                'Rechargez la page et réessayez.',
            ));
        }, timeoutMs);

        function onStateChange() {
            if (worker.state === 'activated') {
                clearTimeout(timeout);
                worker.removeEventListener('statechange', onStateChange);
                resolve(reg);
            } else if (worker.state === 'redundant') {
                clearTimeout(timeout);
                worker.removeEventListener('statechange', onStateChange);
                reject(new Error(
                    'Le Service Worker n\'a pas pu s\'installer. ' +
                    'Videz le cache du navigateur et rechargez la page.',
                ));
            }
        }

        worker.addEventListener('statechange', onStateChange);

        // Si le SW est `waiting`, forcer l'activation
        if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
    });
}

// S'assure qu'un Service Worker actif est disponible et le retourne
async function awaitReadyRegistration(timeoutMs = SW_READY_TIMEOUT): Promise<ServiceWorkerRegistration> {
    // 1. SW déjà actif -> résolution immédiate
    let reg = await navigator.serviceWorker.getRegistration('/');
    if (reg?.active) return reg;

    // 2. SW en cours d'installation -> attendre
    if (reg && (reg.installing || reg.waiting)) {
        return waitForActivation(reg, timeoutMs);
    }

    // 3. Aucun SW -> enregistrer le SW push minimal
    try {
        reg = await navigator.serviceWorker.register(PUSH_SW_URL, { scope: '/' });
    } catch (err) {
        throw new Error(
            'Impossible d\'enregistrer le Service Worker : ' +
            (err instanceof Error ? err.message : String(err)),
        );
    }

    // Le register() peut résoudre avec un SW déjà actif (mise à jour)
    if (reg.active) return reg;

    return waitForActivation(reg, timeoutMs);
}

// ========================================
// Clé publique VAPID
// ========================================

let vapidPublicKeyCache: string | null = null;

// Récupère la clé VAPID publique depuis le serveur (avec cache)
export async function getVapidPublicKey(): Promise<string> {
    if (vapidPublicKeyCache) return vapidPublicKeyCache;
    const response = await api.get('/public/notifications/vapid-public-key');
    vapidPublicKeyCache = response.data.public_key;
    return vapidPublicKeyCache!;
}

// Convertit la clé VAPID Base64-URL en Uint8Array pour PushManager.subscribe()
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray as Uint8Array<ArrayBuffer>;
}

// ========================================
// Messages d'erreur pour pushManager.subscribe()
// ========================================

// Transforme les DOMException techniques de pushManager.subscribe() en messages utilisateur compréhensibles
function humanizePushSubscribeError(err: unknown, permissionWasGranted: boolean): string {
    if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError' && permissionWasGranted) {
            return 'L\'enregistrement push a échoué. Vérifiez que votre navigateur est à jour.';
        }

        if (err.name === 'NotAllowedError') {
            return 'Vous avez refusé les notifications. Vous pouvez les réactiver dans les paramètres de votre navigateur.';
        }

        if (err.name === 'AbortError' || err.name === 'InvalidStateError') {
            return 'Échec de l\'enregistrement push. Rechargez la page et réessayez.';
        }
    }

    return err instanceof Error ? err.message : 'Erreur inconnue lors de l\'enregistrement push.';
}

// ========================================
// Souscription push
// ========================================

// Récupère la souscription push active du navigateur (ou null)
export async function getExistingSubscription(): Promise<PushSubscription | null> {
    if (!isPushSupported()) return null;
    const reg = await getRegistration();
    if (!reg) return null;
    try {
        return await reg.pushManager.getSubscription();
    } catch {
        return null;
    }
}

// Souscrit aux notifications push
// Demande la permission, crée la souscription PushManager, et l'enregistre côté serveur
export async function subscribeToPush(
    preferences: NotificationPreferences,
    restaurantId?: number,
): Promise<{ success: boolean; error?: string }> {
    try {
        // 1. Vérifier le support
        if (!isPushSupported()) {
            return { success: false, error: 'Votre navigateur ne supporte pas les notifications push.' };
        }

        // 2. Demander la permission
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            return {
                success: false,
                error: 'Vous avez refusé les notifications. Vous pouvez les réactiver dans les paramètres de votre navigateur.',
            };
        }

        // 3. Récupérer la clé VAPID
        const vapidKey = await getVapidPublicKey();

        // 4. Attendre le Service Worker (avec timeout)
        const registration = await awaitReadyRegistration();

        // 5. S'abonner au PushManager
        let subscription: PushSubscription;
        try {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidKey),
            });
        } catch (pushErr) {
            console.error('pushManager.subscribe() failed:', pushErr);
            return { success: false, error: humanizePushSubscribeError(pushErr, true) };
        }

        // 6. Envoyer au serveur
        const subscriptionJSON = subscription.toJSON();
        await api.post('/public/notifications/subscribe', {
            endpoint: subscriptionJSON.endpoint,
            keys: subscriptionJSON.keys,
            preferences,
            platform: detectPlatform(),
            restaurant_id: restaurantId,
        });

        return { success: true };
    } catch (err: unknown) {
        console.error('Erreur lors de la souscription push :', err);
        const message = err instanceof Error ? err.message : 'Erreur inconnue';
        return { success: false, error: message };
    }
}

// Se désabonne des notifications push (navigateur + serveur)
export async function unsubscribeFromPush(): Promise<{ success: boolean; error?: string }> {
    try {
        const subscription = await getExistingSubscription();
        if (!subscription) {
            return { success: true }; // Déjà désabonné
        }

        // Supprimer côté serveur
        await api.delete('/public/notifications/unsubscribe', {
            data: { endpoint: subscription.endpoint },
        });

        // Supprimer côté navigateur
        await subscription.unsubscribe();

        return { success: true };
    } catch (err: unknown) {
        console.error('Erreur lors du désabonnement push :', err);
        const message = err instanceof Error ? err.message : 'Erreur inconnue';
        return { success: false, error: message };
    }
}

// Met à jour les préférences de notification côté serveur 
export async function updatePreferences(
    preferences: NotificationPreferences,
): Promise<{ success: boolean; error?: string }> {
    try {
        const subscription = await getExistingSubscription();
        if (!subscription) {
            return { success: false, error: 'Aucune souscription active.' };
        }

        await api.put('/public/notifications/preferences', {
            endpoint: subscription.endpoint,
            preferences,
        });

        return { success: true };
    } catch (err: unknown) {
        console.error('Erreur lors de la mise à jour des préférences :', err);
        const message = err instanceof Error ? err.message : 'Erreur inconnue';
        return { success: false, error: message };
    }
}

// Récupère les préférences de notification depuis le serveur
export async function getServerPreferences(): Promise<ServerSubscription | null> {
    try {
        const subscription = await getExistingSubscription();
        if (!subscription) return null;

        const response = await api.get('/public/notifications/preferences', {
            params: { endpoint: subscription.endpoint },
        });
        return response.data.subscription;
    } catch {
        return null;
    }
}

// Envoie une notification de test
export async function sendTestNotification(): Promise<{ success: boolean; error?: string }> {
    try {
        const subscription = await getExistingSubscription();
        if (!subscription) {
            return { success: false, error: 'Aucune souscription active.' };
        }

        const subscriptionJSON = subscription.toJSON();
        await api.post('/public/notifications/test', {
            endpoint: subscriptionJSON.endpoint,
            keys: subscriptionJSON.keys,
        });

        return { success: true };
    } catch (err: unknown) {
        console.error('Erreur lors de l\'envoi de la notification test :', err);
        const message = err instanceof Error ? err.message : 'Erreur inconnue';
        return { success: false, error: message };
    }
}
