/**
 * Hafif event telemetri — Premium dönüşüm ve UX ölçümü için.
 *
 * Tasarım:
 *   - Tüm event'ler batch'lenir (3sn pencere + 10 event max) → tek HTTP isteği
 *   - Beforeunload'da queue flush edilir (kullanıcı kaçarken son veri kaybolmaz)
 *   - Backend (Cloudflare Pages Function): /api/telemetry/event POST → D1
 *   - Production'da default açık, ?notrack=1 ile devre dışı bırakılabilir
 *
 * Anonim: kullanıcı id yok, sadece session id (tarayıcı oturumu boyunca aynı).
 * Toplama amaçlı veri — kişisel veri toplanmaz (KVKK uyumlu).
 */

interface TelemetryEvent {
  /** Event adı — örn. "watchlist.add", "screener.query" */
  name: string;
  /** Opsiyonel özellikler (örn. { symbol: "GARAN" }, { resultCount: 12 }) */
  props?: Record<string, string | number | boolean | null>;
  /** Client-side timestamp (ms) */
  ts: number;
  /** Session id (sayfa oturumu boyunca sabit) */
  sid: string;
  /** Sayfa pathname */
  path: string;
}

const QUEUE_FLUSH_INTERVAL_MS = 3000;
const QUEUE_MAX_SIZE = 10;
const SESSION_STORAGE_KEY = 'fa.tel.sid';
const ENDPOINT = '/api/telemetry/event';

let sessionId: string | null = null;
let queue: TelemetryEvent[] = [];
let flushTimer: number | null = null;
let initialized = false;
let enabled = true;

function genSessionId(): string {
  // 12 char random — UUID gerek yok, anonim tracking için yeterli
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function getSessionId(): string {
  if (sessionId) return sessionId;
  try {
    const existing = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) {
      sessionId = existing;
      return existing;
    }
    const next = genSessionId();
    sessionStorage.setItem(SESSION_STORAGE_KEY, next);
    sessionId = next;
    return next;
  } catch {
    sessionId = genSessionId();
    return sessionId;
  }
}

async function flush() {
  if (queue.length === 0) return;
  const events = queue.slice();
  queue = [];
  try {
    // sendBeacon: sayfa unload sırasında bile gönderir, blocking değil
    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      const blob = new Blob([JSON.stringify({ events })], { type: 'application/json' });
      const ok = navigator.sendBeacon(ENDPOINT, blob);
      if (ok) return;
    }
    // Fallback: regular fetch
    await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
      keepalive: true,
    });
  } catch {
    // Telemetri başarısızsa sessizce git; kullanıcıya görünmesin
  }
}

function scheduleFlush() {
  if (flushTimer != null) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    flush();
  }, QUEUE_FLUSH_INTERVAL_MS);
}

/**
 * Tek seferlik init — main.tsx'te çağrılır.
 * URL'de ?notrack=1 varsa veya localStorage'da fa.tel.optout=1 ise devre dışı.
 */
export function initTelemetry() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('notrack') === '1') { enabled = false; return; }
    if (localStorage.getItem('fa.tel.optout') === '1') { enabled = false; return; }
  } catch { /* */ }

  // Sayfa kapanırken kalanları gönder
  window.addEventListener('beforeunload', () => flush());
  // Visibility hidden'da da flush — mobil'de tab kapanmadan göndermek için
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

/**
 * Event gönder. Queue'ya eklenir; 3sn / 10 event max batch'lenir.
 *
 * Örnek:
 *   track('watchlist.add', { symbol: 'GARAN' });
 *   track('screener.query', { len: query.length, results: 12 });
 *   track('premium.upgradeClick', { tier: 'pro' });
 */
export function track(name: string, props?: TelemetryEvent['props']) {
  if (!enabled || typeof window === 'undefined') return;
  const event: TelemetryEvent = {
    name,
    props,
    ts: Date.now(),
    sid: getSessionId(),
    path: window.location.pathname,
  };
  queue.push(event);
  if (queue.length >= QUEUE_MAX_SIZE) {
    if (flushTimer != null) { window.clearTimeout(flushTimer); flushTimer = null; }
    flush();
  } else {
    scheduleFlush();
  }
}

/** Kullanıcı telemetri'yi kapatmak isterse — Ayarlar'dan çağrılır. */
export function setTelemetryOptOut(optOut: boolean) {
  try {
    if (optOut) localStorage.setItem('fa.tel.optout', '1');
    else localStorage.removeItem('fa.tel.optout');
  } catch { /* */ }
  enabled = !optOut;
}

export function isTelemetryEnabled(): boolean {
  return enabled;
}
