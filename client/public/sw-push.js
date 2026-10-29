/**
 * Push-only service worker for development, registered by push.ts.
 *
 * Production ships the worker built from src/sw-push.js, which carries these
 * handlers plus the precache.
 */

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

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
      url: payload.url || '/',
    },
  };

  event.waitUntil(self.registration.showNotification(payload.title || 'Mariam', options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var data = event.notification.data;
  var target = new URL((data && data.url) || '/', self.location.origin);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clients) {
      // Only a tab already on that page is reused: another may hold unsaved work,
      // a dashboard's edits for one.
      for (var i = 0; i < clients.length; i++) {
        if (new URL(clients[i].url).pathname === target.pathname) {
          return clients[i].focus().then(function (client) {
            return client.navigate(target.href);
          });
        }
      }
      return self.clients.openWindow(target.href);
    })
  );
});
