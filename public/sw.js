/**
 * InvestLiq — service worker (PWA + offline fallback).
 *
 * STRATEJİ:
 *   1) Push notification: /push-handler.js'den import edilir.
 *   2) Fetch için karma cache stratejisi:
 *      - /assets/*  (Vite hashed) → cache-first (içerik değişmez)
 *      - /api/*     → network-first, fallback cache (online ise tazeyi al)
 *      - HTML nav   → network-first, fallback cache (offline'da son ziyaret)
 *      - diğer      → stale-while-revalidate (resim, font, ikon)
 *   3) Cache versiyonu artırılınca activate'te eskileri sil.
 *
 * Ağ koptuğunda kullanıcı son ziyaret ettiği Watchlist/Panel'i görür.
 */

/* global self, importScripts, caches */

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `static-${CACHE_VERSION}`;     // /assets/* hashed
const PAGES_CACHE  = `pages-${CACHE_VERSION}`;       // HTML + same-origin doc
const API_CACHE    = `api-${CACHE_VERSION}`;          // /api/* GET response

const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/favicon.svg',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(PAGES_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => { /* opsiyonel */ })),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // Sadece mevcut CACHE_VERSION ile biten cache'leri tut, diğerlerini sil
    await Promise.all(
      keys
        .filter((k) => !k.endsWith(`-${CACHE_VERSION}`))
        .map((k) => caches.delete(k)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // SW'ın kendi dosyalarına dokunma
  if (url.pathname === '/sw.js' || url.pathname === '/push-handler.js') return;

  // 1) Hashed asset'ler → cache-first
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  // 2) API → network-first
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(req, API_CACHE));
    return;
  }

  // 3) HTML / sayfa navigasyonu → network-first, offline'da son sürüm
  const accept = req.headers.get('accept') || '';
  if (req.mode === 'navigate' || accept.includes('text/html')) {
    event.respondWith(networkFirst(req, PAGES_CACHE));
    return;
  }

  // 4) Diğer (resim, font) → stale-while-revalidate
  event.respondWith(staleWhileRevalidate(req, STATIC_CACHE));
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch {
    return cached || Response.error();
  }
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    // Son çare: ana sayfa cache'i (offline'da hiç olmazsa bir şey görsün)
    const fallback = await cache.match('/');
    if (fallback) return fallback;
    return Response.error();
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const networkPromise = fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => cached || Response.error());
  return cached || networkPromise;
}

// Push notification handler — ayrı dosyadan import (bakım kolaylığı)
try {
  importScripts('/push-handler.js');
} catch (e) {
  console.error('push-handler.js yüklenemedi', e);
}
