/**
 * MARIAM — Service Worker (injectManifest via vite-plugin-pwa / Workbox).
 *
 * Gère :
 * - Le précache des assets statiques (Workbox injectManifest)
 * - La réception des messages push (événement `push`)
 * - Le clic sur les notifications (événement `notificationclick`)
 */
import { precacheAndRoute } from 'workbox-precaching';

// ========================================
// Activation immédiate
// ========================================
// Permet au SW de prendre le contrôle dès l'installation sans rester bloqué en état "waiting"
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// ========================================
// Précache des assets statiques (injecté par Workbox au build)
// ========================================
precacheAndRoute(self.__WB_MANIFEST);

// ========================================
// Réception des notifications push
// ========================================
self.addEventListener('push', (event) => {
    if (!event.data) return;

    let payload;
    try {
        payload = event.data.json();
    } catch {
        payload = {
            title: 'Mariam',
            body: event.data.text(),
        };
    }

    const options = {
        body: payload.body || '',
        icon: payload.icon || '/web-app-manifest-192x192.png',
        badge: payload.badge || '/favicon-96x96.png',
        tag: payload.tag || 'mariam-notification',
        renotify: true,
        data: {
            url: payload.url || '/menu',
        },
    };

    event.waitUntil(
        self.registration.showNotification(payload.title || 'Mariam', options)
    );
});

// ========================================
// Clic sur une notification
// ========================================
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const targetUrl = event.notification.data?.url || '/menu';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
            // Si un onglet MARIAM est déjà ouvert, le focus
            for (const client of clients) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    client.navigate(targetUrl);
                    return client.focus();
                }
            }
            // Sinon, ouvrir un nouvel onglet
            return self.clients.openWindow(targetUrl);
        })
    );
});
