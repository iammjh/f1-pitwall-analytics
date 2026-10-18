// Pitwall Analytics service worker.
// Installability and push notifications only. No app data is cached: standings, telemetry and
// alerts are live and per-user, so every request goes to the network.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // Intentionally no caching; the browser handles every request normally.
});

self.addEventListener('push', (event) => {
  let data = { title: 'Pitwall Analytics', body: '', url: '/dashboard' };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    // Keep the defaults for a payload that is not JSON.
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/192',
      badge: '/icons/192',
      tag: 'race-start',
      data: { url: data.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/dashboard';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const open = clients.find((client) => 'focus' in client);
      if (open) {
        open.navigate(url);
        return open.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
