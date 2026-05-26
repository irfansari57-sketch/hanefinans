/**
 * Hane Finans — minimal service worker (PWA install için).
 * Push notification handler'ı /push-handler.js'den import eder.
 * Cache strategy yok — sadece offline/install kabiliyeti aktif.
 */

/* global self, importScripts */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Push notification handler — ayrı dosyadan import (bakım kolaylığı)
try {
  importScripts('/push-handler.js');
} catch (e) {
  // push-handler.js yüklenemezse SW yine de çalışır
  console.error('push-handler.js yüklenemedi', e);
}
