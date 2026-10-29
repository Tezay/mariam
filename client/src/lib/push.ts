import { isAxiosError } from 'axios';
import { detectPlatform } from './app-install';
import type { SiteRef } from './api/client';
import { getApiErrorMessage } from './api/errors';
import {
  pushSubscriptionsApi,
  type NotificationPreferences,
  type ServerSubscription,
} from './api/push-subscriptions';

export type { NotificationPreferences } from './api/push-subscriptions';

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  notify_today_menu: true,
  notify_today_menu_time: '11:00',
  notify_tomorrow_menu: false,
  notify_tomorrow_menu_time: '19:00',
  notify_events: true,
};

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// The worker activates once its precache is downloaded: on a first visit, a slow
// connection takes a while.
const SW_READY_TIMEOUT = 30_000;

const PUSH_SW_URL = '/sw-push.js';

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    return reg?.active ? reg : null;
  } catch {
    return null;
  }
}

function waitForActivation(
  reg: ServiceWorkerRegistration,
  timeoutMs: number
): Promise<ServiceWorkerRegistration> {
  if (reg.active) return Promise.resolve(reg);

  const sw = reg.installing || reg.waiting;
  if (!sw) {
    return Promise.reject(new Error("Aucun Service Worker en cours d'installation."));
  }

  // The callbacks lose the narrowing.
  const worker = sw;

  return new Promise<ServiceWorkerRegistration>((resolve, reject) => {
    const timeout = setTimeout(() => {
      worker.removeEventListener('statechange', onStateChange);
      reject(
        new Error(
          'Le Service Worker met trop de temps à démarrer. ' + 'Rechargez la page et réessayez.'
        )
      );
    }, timeoutMs);

    function onStateChange() {
      if (worker.state === 'activated') {
        clearTimeout(timeout);
        worker.removeEventListener('statechange', onStateChange);
        resolve(reg);
      } else if (worker.state === 'redundant') {
        clearTimeout(timeout);
        worker.removeEventListener('statechange', onStateChange);
        reject(
          new Error(
            "Le Service Worker n'a pas pu s'installer. " +
              'Videz le cache du navigateur et rechargez la page.'
          )
        );
      }
    }

    worker.addEventListener('statechange', onStateChange);

    if (reg.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  });
}

async function awaitReadyRegistration(
  timeoutMs = SW_READY_TIMEOUT
): Promise<ServiceWorkerRegistration> {
  let reg = await navigator.serviceWorker.getRegistration('/');
  if (reg?.active) return reg;

  if (reg && (reg.installing || reg.waiting)) {
    return waitForActivation(reg, timeoutMs);
  }

  try {
    reg = await navigator.serviceWorker.register(PUSH_SW_URL, { scope: '/' });
  } catch (err) {
    throw new Error(
      "Impossible d'enregistrer le Service Worker : " +
        (err instanceof Error ? err.message : String(err))
    );
  }

  // On an update, register() resolves with the active worker.
  if (reg.active) return reg;

  return waitForActivation(reg, timeoutMs);
}

let vapidPublicKeyCache: string | null = null;

async function getVapidPublicKey(): Promise<string> {
  vapidPublicKeyCache ??= await pushSubscriptionsApi.publicKey();
  return vapidPublicKeyCache;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function humanizePushSubscribeError(err: unknown, permissionWasGranted: boolean): string {
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError' && permissionWasGranted) {
      return "L'enregistrement push a échoué. Vérifiez que votre navigateur est à jour.";
    }

    if (err.name === 'NotAllowedError') {
      return 'Vous avez refusé les notifications. Vous pouvez les réactiver dans les paramètres de votre navigateur.';
    }

    if (err.name === 'AbortError' || err.name === 'InvalidStateError') {
      return "Échec de l'enregistrement push. Rechargez la page et réessayez.";
    }
  }

  return err instanceof Error ? err.message : "Erreur inconnue lors de l'enregistrement push.";
}

function failureMessage(err: unknown): string {
  if (isAxiosError(err)) {
    return getApiErrorMessage(
      err,
      'Le service est momentanément indisponible. Réessayez dans un instant.'
    );
  }
  return err instanceof Error ? err.message : 'Erreur inconnue';
}

async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const reg = await getRegistration();
  if (!reg) return null;
  try {
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export async function subscribeToPush(
  preferences: NotificationPreferences,
  site: SiteRef
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!isPushSupported()) {
      return {
        success: false,
        error: 'Votre navigateur ne supporte pas les notifications push.',
      };
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return {
        success: false,
        error:
          'Vous avez refusé les notifications. Vous pouvez les réactiver dans les paramètres de votre navigateur.',
      };
    }

    const vapidKey = await getVapidPublicKey();

    const registration = await awaitReadyRegistration();

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

    const { keys } = subscription.toJSON();
    await pushSubscriptionsApi.put(site, {
      endpoint: subscription.endpoint,
      keys: { p256dh: keys?.p256dh ?? '', auth: keys?.auth ?? '' },
      platform: detectPlatform(),
      ...preferences,
    });

    return { success: true };
  } catch (err: unknown) {
    console.error('Push subscription failed:', err);
    return { success: false, error: failureMessage(err) };
  }
}

export async function unsubscribeFromPush(
  site: SiteRef
): Promise<{ success: boolean; error?: string }> {
  try {
    const subscription = await getExistingSubscription();
    if (!subscription) {
      return { success: true };
    }

    await pushSubscriptionsApi.remove(site, subscription.endpoint);

    await subscription.unsubscribe();

    return { success: true };
  } catch (err: unknown) {
    console.error('Push unsubscription failed:', err);
    return { success: false, error: failureMessage(err) };
  }
}

export async function updatePreferences(
  preferences: NotificationPreferences,
  site: SiteRef
): Promise<{ success: boolean; error?: string }> {
  try {
    const subscription = await getExistingSubscription();
    if (!subscription) {
      return { success: false, error: 'Aucune souscription active.' };
    }

    await pushSubscriptionsApi.update(site, subscription.endpoint, preferences);

    return { success: true };
  } catch (err: unknown) {
    console.error('Saving the notification preferences failed:', err);
    return { success: false, error: failureMessage(err) };
  }
}

/** `null` when this browser does not follow the site. */
export async function getServerPreferences(site: SiteRef): Promise<ServerSubscription | null> {
  try {
    const subscription = await getExistingSubscription();
    if (!subscription) return null;
    return await pushSubscriptionsApi.get(site, subscription.endpoint);
  } catch {
    return null;
  }
}

export async function sendTestNotification(
  site: SiteRef
): Promise<{ success: boolean; error?: string }> {
  try {
    const subscription = await getExistingSubscription();
    if (!subscription) {
      return { success: false, error: 'Aucune souscription active.' };
    }

    await pushSubscriptionsApi.sendTest(site, subscription.endpoint);

    return { success: true };
  } catch (err: unknown) {
    console.error('Sending the test notification failed:', err);
    return { success: false, error: failureMessage(err) };
  }
}
