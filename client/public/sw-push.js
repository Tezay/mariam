/**
 * MARIAM — Service Worker minimal pour les notifications push.
 *
 * Ce fichier est servi statiquement depuis public/ et enregistré
 * directement par push.ts en mode développement.
 *
 * En production, le Service Worker Workbox (généré par vite-plugin-pwa
 * via injectManifest depuis src/sw-push.js) inclut ces mêmes handlers
 * ainsi que la gestion du cache statique.
 */

// ========================================
// Activation immédiate
// ========================================
self.addEventListener('install', function () {
    self.skipWaiting();
});

self.addEventListener('activate', function (event) {
    event.waitUntil(self.clients.claim());
});

// ========================================
// Réception des notifications push
// ========================================
self.addEventListener('push', function (event) {
    if (!event.data) return;

    var payload;
    try {
        payload = event.data.json();
    } catch (e) {
        payload = {
            title: 'Mariam',
            body: event.data.text(),
        };
    }

    var options = {
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
self.addEventListener('notificationclick', function (event) {
    event.notification.close();

    var targetUrl = event.notification.data && event.notification.data.url
        ? event.notification.data.url
        : '/menu';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clients) {
            for (var i = 0; i < clients.length; i++) {
                var client = clients[i];
                if (client.url.indexOf(self.location.origin) !== -1 && 'focus' in client) {
                    client.navigate(targetUrl);
                    return client.focus();
                }
            }
            return self.clients.openWindow(targetUrl);
        })
    );
});
