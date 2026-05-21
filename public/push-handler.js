/**
 * Service Worker push handler — VitePWA üretilen SW'a workbox.importScripts ile
 * enjekte edilir. Web Push event'lerini dinler, notification gösterir.
 *
 * Payload formatı (JSON):
 * {
 *   "title": "AKBNK alarm tetiklendi",
 *   "body": "≥ 70₺ • Mevcut: 71.20₺",
 *   "url": "/stock/AKBNK",
 *   "tag": "alert-123"
 * }
 *
 * `self` burada ServiceWorkerGlobalScope'tur.
 */

/* global self, clients */

self.addEventListener('push', (event) => {
  let data = {};
  try {
    if (event.data) data = event.data.json();
  } catch (e) {
    // Plain text fallback
    try { data = { title: 'Hane Finans', body: event.data ? event.data.text() : '' }; }
    catch (e2) { data = { title: 'Hane Finans', body: '' }; }
  }

  const title = data.title || 'Hane Finans';
  const body = data.body || '';
  const url = data.url || '/';
  const tag = data.tag || undefined;

  const options = {
    body: body,
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: tag,
    data: { url: url },
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Açık bir pencere varsa onu odakla + URL'e yönlendir
      for (const client of windowClients) {
        if ('focus' in client) {
          try {
            client.focus();
            if ('navigate' in client) client.navigate(url);
            return;
          } catch (e) { /* ignore */ }
        }
      }
      // Açık pencere yoksa yenisini aç
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    }),
  );
});

/**
 * Frontend tarafından SW.controller.postMessage({type:'SHOW_NOTIFICATION', ...})
 * geldiğinde gösterilir — server push olmadan, sekme açıkken AlertWatcher
 * tetiklediğinde bildirim göstermek için kullanılır.
 */
self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'SHOW_NOTIFICATION') return;
  const { title, body, url, tag } = event.data;
  const options = {
    body: body || '',
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: tag || undefined,
    data: { url: url || '/' },
    requireInteraction: false,
  };
  event.waitUntil(self.registration.showNotification(title || 'Hane Finans', options));
});
