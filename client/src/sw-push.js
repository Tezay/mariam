/**
 * Production service worker, bundled by scripts/build-sw.mjs, which also
 * injects the precache list. public/sw-push.js is its push-only twin for
 * development.
 */
import { precacheAndRoute } from 'workbox-precaching';

// Active immédiatement et diffuse SW_UPDATED aux pages ouvertes lors d'une mise à jour,
// afin de forcer le rechargement du nouveau bundle JS même sur des clients sans handler dédié.
let isUpdate = false;
self.addEventListener('install', () => {
  if (self.registration.active) isUpdate = true;
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.clients.claim().then(() => {
      if (!isUpdate) return;
      return self.clients
        .matchAll({ type: 'window' })
        .then((clients) => clients.forEach((c) => c.postMessage({ type: 'SW_UPDATED' })));
    })
  );
});

// ========================================
// Manifest dynamique selon le rôle utilisateur
// ========================================
// The React client stores the role in CacheStorage after each sign-in.
self.addEventListener('fetch', (event) => {
  const { pathname } = new URL(event.request.url);
  if (pathname === '/manifest.webmanifest' || pathname === '/site.webmanifest') {
    event.respondWith(resolveDynamicManifest());
  }
});

async function resolveDynamicManifest() {
  try {
    const cache = await caches.open('mariam-config');
    const roleRes = await cache.match('/user-role');
    if (roleRes) {
      const role = await roleRes.text();
      if (role === 'org_admin') {
        return fetch('/manifest-org.webmanifest');
      }
      if (role === 'admin' || role === 'editor') {
        return fetch('/manifest-admin.webmanifest');
      }
    }
  } catch (_) {}
  return fetch('/site.webmanifest');
}

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

  event.waitUntil(self.registration.showNotification(payload.title || 'Mariam', options));
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
