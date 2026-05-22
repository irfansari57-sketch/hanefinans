/**
 * Merkezi HTTP helper — projedeki tüm `fetch` çağrıları bunu kullanır.
 *
 * Özellikler:
 *  - AbortController + timeout (default 12s)
 *  - Tipli JSON parse (`request<T>`)
 *  - Otomatik retry (default 1; sadece 5xx ve network hataları)
 *  - Anlamlı hata sınıfı (`HttpError`) — status + url + body alanlı
 *  - signal forwarding — TanStack Query `signal`'iyle entegre çalışır
 *
 * Tasarım kararı: Helper hiçbir state tutmaz; cache ve dedup TanStack Query'de.
 */

export class HttpError extends Error {
  readonly status: number;
  readonly url: string;
  readonly bodyText?: string;
  constructor(message: string, opts: { status: number; url: string; bodyText?: string }) {
    super(message);
    this.name = 'HttpError';
    this.status = opts.status;
    this.url = opts.url;
    this.bodyText = opts.bodyText;
  }
}

export interface RequestOptions extends Omit<RequestInit, 'signal'> {
  /** Milliseconds before abort (default 12000). 0 → no timeout. */
  timeoutMs?: number;
  /** Retry sayısı; sadece 5xx + network için (default 1). */
  retries?: number;
  /** Üst katmandan gelen AbortSignal — TanStack Query `signal`'i. */
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT = 12_000;
const DEFAULT_RETRIES = 1;

function joinSignals(...signals: (AbortSignal | undefined | null)[]): AbortSignal {
  const controller = new AbortController();
  const filtered = signals.filter((s): s is AbortSignal => !!s);
  if (filtered.some((s) => s.aborted)) controller.abort();
  for (const s of filtered) {
    s.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return controller.signal;
}

async function doFetchOnce(input: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const timeoutCtrl = new AbortController();
  const timer =
    timeoutMs > 0
      ? setTimeout(() => timeoutCtrl.abort(new DOMException('timeout', 'TimeoutError')), timeoutMs)
      : null;
  try {
    const signal = joinSignals(init.signal as AbortSignal | undefined, timeoutCtrl.signal);
    return await fetch(input, { ...init, signal });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Düşük seviye request — Response döner, tüketici body'yi kendi parse eder.
 * Çoğunlukla `request<T>()` veya `requestText()` tercih edilmeli.
 */
export async function rawRequest(input: string, options: RequestOptions = {}): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT, retries = DEFAULT_RETRIES, signal, ...init } = options;
  let lastErr: unknown = null;
  const attempts = Math.max(1, retries + 1);
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await doFetchOnce(input, { ...init, signal }, timeoutMs);
      // 5xx → retry. 4xx → fail immediately.
      if (res.status >= 500 && i < attempts - 1) {
        lastErr = new HttpError(`HTTP ${res.status}`, { status: res.status, url: input });
        continue;
      }
      if (!res.ok) {
        const bodyText = await res.text().catch(() => undefined);
        throw new HttpError(`HTTP ${res.status} ${res.statusText}`, {
          status: res.status,
          url: input,
          bodyText,
        });
      }
      return res;
    } catch (err) {
      // AbortError (timeout veya kullanıcı iptali) — retry etme
      const name = (err as Error)?.name;
      if (name === 'AbortError' || name === 'TimeoutError') throw err;
      lastErr = err;
      if (i === attempts - 1) throw err;
    }
  }
  throw lastErr ?? new Error('unknown fetch error');
}

/**
 * JSON GET — en sık kullanılan. Body verirken `request('/url', { method: 'POST', body: ... })`.
 *
 * Hata fırlatır (HttpError veya AbortError). Try/catch ile sarmalayın veya
 * `safeRequest()` kullanın.
 */
export async function request<T = unknown>(input: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await rawRequest(input, { ...options, headers });
  // 204 No Content
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Plain text response (örn. HTML, CSV). */
export async function requestText(input: string, options: RequestOptions = {}): Promise<string> {
  const res = await rawRequest(input, options);
  return res.text();
}

/**
 * Hata fırlatmayan varyant — `{ ok, data, error }` döner.
 * UI katmanında "veri yoksa null" stratejisi için faydalı.
 */
export interface SafeResult<T> {
  ok: boolean;
  data?: T;
  error?: HttpError | Error;
}

export async function safeRequest<T>(input: string, options: RequestOptions = {}): Promise<SafeResult<T>> {
  try {
    const data = await request<T>(input, options);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err as HttpError | Error };
  }
}

/** Basit query string builder. undefined/null değerleri otomatik atar. */
export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}
