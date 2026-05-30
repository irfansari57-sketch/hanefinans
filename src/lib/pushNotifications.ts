/**
 * Push notification yardımcıları — Service Worker tabanlı.
 *
 * Faz 1: SW notification (sekme arka plandayken bildirim gösterir).
 *   - askPermission(): kullanıcıdan izin iste
 *   - showSwNotification(): AlertWatcher tarafından çağrılır, SW.postMessage
 *     ile bildirim göstertir (sekme arka plandayken da çalışır).
 *
 * Faz 2 (ileride): Server push (Web Push API + VAPID).
 *   - subscribePush(): backend'e subscription kaydet
 *   - unsubscribePush(): subscription'ı sil
 *
 *   VAPID public key VITE_PUSH_VAPID_PUBLIC_KEY env'inde tutulur, server
 *   tarafı (Cloudflare Worker) VAPID private key'i kendi secret'ında tutar.
 */

const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env;
// VITE_VAPID_PUBLIC_KEY tercih edilir; eski VITE_PUSH_VAPID_PUBLIC_KEY backward-compat.
const VAPID_PUBLIC_KEY = (env.VITE_VAPID_PUBLIC_KEY ?? env.VITE_PUSH_VAPID_PUBLIC_KEY ?? '').trim();

export type NotifSupport = 'supported' | 'no-sw' | 'no-notif' | 'no-push';

/** Tarayıcı desteğini özetle. */
export function checkSupport(): NotifSupport {
  if (typeof window === 'undefined') return 'no-sw';
  if (!('serviceWorker' in navigator)) return 'no-sw';
  if (typeof Notification === 'undefined') return 'no-notif';
  if (!('PushManager' in window)) return 'no-push';
  return 'supported';
}

/** Notification iznini iste. Default → 'default'. */
export async function askPermission(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

/** Mevcut Notification izni. */
export function getPermission(): NotificationPermission | 'unsupported' {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

/** Aktif SW registration'ı al. */
async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return (await navigator.serviceWorker.ready) ?? null;
  } catch {
    return null;
  }
}

interface ShowNotifInput {
  title: string;
  body: string;
  /** Tıklayınca yönlenecek URL. */
  url?: string;
  /** Aynı tag → eskisi üzerine yazılır. */
  tag?: string;
}

/**
 * SW üzerinden bildirim göster. Notification API yerine bunu kullanırsak
 * sekme arka plandayken de daha güvenilir çalışır (browser cooperation).
 *
 * Notification izni yoksa veya SW yoksa sessizce false döner.
 */
export async function showSwNotification(input: ShowNotifInput): Promise<boolean> {
  if (getPermission() !== 'granted') return false;
  const reg = await getRegistration();
  if (!reg) return false;
  try {
    // postMessage ile push-handler.js'deki message listener tetiklenir
    if (reg.active) {
      reg.active.postMessage({
        type: 'SHOW_NOTIFICATION',
        title: input.title,
        body: input.body,
        url: input.url ?? '/',
        tag: input.tag,
      });
      return true;
    }
    // SW pasifse doğrudan showNotification çağır
    await reg.showNotification(input.title, {
      body: input.body,
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: input.tag,
      data: { url: input.url ?? '/' },
    });
    return true;
  } catch {
    return false;
  }
}

// ============= Faz 2 hazırlık (şu an aktif değil) =============

/** VAPID public key tanımlı mı (push subscription'a hazır mı). */
export function isPushBackendConfigured(): boolean {
  return VAPID_PUBLIC_KEY.length > 0;
}

/** Base64URL → Uint8Array (Web Push subscription için). */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

/** Push subscription'ı oluştur (Faz 2 — backend hazır olduğunda kullanılır). */
export async function subscribePush(): Promise<PushSubscription | null> {
  if (!isPushBackendConfigured()) return null;
  const reg = await getRegistration();
  if (!reg) return null;
  try {
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    });
    return sub;
  } catch {
    return null;
  }
}

/** Mevcut push subscription'ı al (varsa). */
export async function getExistingSubscription(): Promise<PushSubscription | null> {
  const reg = await getRegistration();
  if (!reg) return null;
  try {
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/** Push subscription'ı sil. */
export async function unsubscribePush(): Promise<boolean> {
  const sub = await getExistingSubscription();
  if (!sub) return true;
  try {
    return await sub.unsubscribe();
  } catch {
    return false;
  }
}

// ============= Backend bağlantısı (server-driven push) =============

interface SubscribeResult {
  ok: boolean;
  error?: string;
}

/**
 * Subscription'ı backend'e kaydet. Çağırmadan önce subscribePush() ile
 * browser subscription'ı oluşturulmuş olmalı.
 */
export async function registerSubscription(sub: PushSubscription): Promise<SubscribeResult> {
  try {
    const json = sub.toJSON() as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, error: 'Subscription objesi eksik' };
    }
    const r = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: json.keys,
        userAgent: navigator.userAgent,
      }),
    });
    const data = await r.json().catch(() => ({ ok: false })) as SubscribeResult;
    return data;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Backend'den subscription'ı sil. */
export async function removeSubscriptionFromServer(endpoint: string): Promise<boolean> {
  try {
    const r = await fetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ endpoint }),
    });
    const data = await r.json().catch(() => ({ ok: false })) as { ok: boolean };
    return data.ok;
  } catch {
    return false;
  }
}

/** Tek-shot: browser subscribe + server'a kaydet. */
export async function subscribeAndRegister(): Promise<SubscribeResult> {
  if (!isPushBackendConfigured()) {
    return { ok: false, error: 'VAPID public key tanımlı değil (VITE_VAPID_PUBLIC_KEY env eksik)' };
  }
  const browserSub = await subscribePush();
  if (!browserSub) {
    return { ok: false, error: 'Tarayıcı push aboneliği oluşturamadı' };
  }
  return registerSubscription(browserSub);
}

/** Tek-shot: server unsubscribe + browser unsubscribe. */
export async function unsubscribeAll(): Promise<boolean> {
  const sub = await getExistingSubscription();
  if (sub) {
    await removeSubscriptionFromServer(sub.endpoint).catch(() => null);
    await unsubscribePush().catch(() => null);
  }
  return true;
}

interface TestPushResult {
  ok: boolean;
  sent?: number;
  failed?: number;
  expired?: number;
  total?: number;
  error?: string;
}

/** Server'dan kendine test bildirim gönder. */
export async function sendTestPushFromServer(): Promise<TestPushResult> {
  try {
    const r = await fetch('/api/push/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({}),
    });
    return await r.json() as TestPushResult;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
