/**
 * Production service worker, bundled by scripts/build-sw.mjs, which also
 * injects the precache list. public/sw-push.js is its push-only twin for
 * development.
 */
import { precacheAndRoute } from 'workbox-precaching';

// Takes over at once and, on an update, posts SW_UPDATED so that every open page
// reloads onto the new build.
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

precacheAndRoute(self.__WB_MANIFEST);

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
      url: payload.url || '/',
    },
  };

  event.waitUntil(self.registration.showNotification(payload.title || 'Mariam', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Only a tab already on that page is reused: another may hold unsaved work,
      // a dashboard's edits for one.
      const page = clients.find((client) => new URL(client.url).pathname === target.pathname);
      if (page) return page.focus().then((client) => client.navigate(target.href));
      return self.clients.openWindow(target.href);
    })
  );
});
