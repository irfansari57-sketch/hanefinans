/**
 * Sentry sarmalayıcısı — `VITE_SENTRY_DSN` env değişkeni ayarlanmamışsa
 * tüm fonksiyonlar no-op davranır. Bu sayede:
 *   - Dev build veya self-host'da Sentry kapalı tutulabilir
 *   - Production'a DSN deploy edilince otomatik aktive olur
 *   - SDK initial bundle'a girmez (dinamik import)
 */

type CaptureFn = (err: unknown, context?: Record<string, unknown>) => void;
type MessageFn = (msg: string, level?: 'info' | 'warning' | 'error') => void;

let captureExceptionImpl: CaptureFn | null = null;
let captureMessageImpl: MessageFn | null = null;
let initialized = false;

/**
 * Sentry SDK'yı dinamik olarak yükle ve init et.
 * Sadece `VITE_SENTRY_DSN` set ise SDK indirilir; aksi halde hiçbir şey olmaz.
 * Idempotent — birden fazla çağrı ikinciden sonra no-op olur.
 */
export async function initSentry(): Promise<void> {
  if (initialized) return;
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;

  try {
    const Sentry = await import('@sentry/react');
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      release: (import.meta.env.VITE_APP_VERSION as string | undefined) ?? 'dev',
      // Performans örnekleme — production'da %10 ile başla, ihtiyaca göre ayarla
      tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
      // Replay devre dışı (boyut + gizlilik)
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      // İstemediğimiz default integrations'ı kapat (bundle küçültme)
      integrations: (defaults) => defaults.filter((i) => i.name !== 'Replay' && i.name !== 'ReplayCanvas'),
      // Bilinen gürültü hatalarını filtrele
      ignoreErrors: [
        // Chunk yükleme — router'da zaten retry yapıyoruz
        /Failed to fetch dynamically imported module/,
        /Importing a module script failed/,
        // 3rd-party browser extension'ları
        /chrome-extension/,
        /moz-extension/,
        // Network kesintileri
        /NetworkError/,
        /Load failed/,
      ],
      beforeSend(event) {
        // Production değilse Sentry'ye göndermek yerine konsola yaz
        if (!import.meta.env.PROD) {
          // eslint-disable-next-line no-console
          console.warn('[Sentry beforeSend non-prod]', event);
          return null;
        }
        return event;
      },
    });

    captureExceptionImpl = (err, context) => {
      Sentry.captureException(err, context ? { extra: context } : undefined);
    };
    captureMessageImpl = (msg, level = 'info') => {
      Sentry.captureMessage(msg, level);
    };
    initialized = true;
    // eslint-disable-next-line no-console
    console.info('[Sentry] aktif —', dsn.slice(0, 30) + '…');
  } catch (e) {
    // SDK yüklenemediyse sessizce devam — uygulama Sentry'siz çalışsın
    // eslint-disable-next-line no-console
    console.warn('[Sentry] başlatılamadı:', e);
  }
}

/**
 * Hata yakala — Sentry varsa oraya gönder, yoksa dev'de konsola yaz.
 * Production'da DSN yoksa tamamen sessiz.
 */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (captureExceptionImpl) {
    captureExceptionImpl(err, context);
    return;
  }
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.error('[captureException]', err, context);
  }
}

/**
 * Bilgi/uyarı mesajı yakala.
 */
export function captureMessage(msg: string, level: 'info' | 'warning' | 'error' = 'info'): void {
  if (captureMessageImpl) {
    captureMessageImpl(msg, level);
    return;
  }
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console[level === 'error' ? 'error' : level === 'warning' ? 'warn' : 'log'](`[captureMessage:${level}]`, msg);
  }
}

/** Test/debug için — Sentry init durumunu döndür. */
export function isSentryReady(): boolean {
  return initialized;
}
