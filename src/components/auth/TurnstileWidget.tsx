import { useEffect, useRef, useState } from 'react';

/**
 * Cloudflare Turnstile widget'i — bot dogrulamasi icin React wrapper.
 *
 * Site key kaynagi (oncelikli):
 *   1. import.meta.env.VITE_TURNSTILE_SITE_KEY (build-time)
 *   2. /api/config/turnstile (runtime, Cloudflare Pages Functions env)
 *
 * Site key public bir degerdir — frontend JS'inde gorunur, gizli degildir.
 */

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      callback?: (token: string) => void;
      'error-callback'?: () => void;
      'expired-callback'?: () => void;
      theme?: 'auto' | 'light' | 'dark';
      size?: 'normal' | 'compact';
      action?: string;
    },
  ) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    __turnstileLoading?: Promise<void>;
    __turnstileSiteKey?: string;
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const BUILD_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

interface Props {
  onToken: (token: string) => void;
  action?: string;
  theme?: 'auto' | 'light' | 'dark';
  size?: 'normal' | 'compact';
}

/** Site key fetcher — build env yoksa /api/config/turnstile'dan al, in-memory cache. */
function loadSiteKey(): Promise<string> {
  if (BUILD_SITE_KEY) return Promise.resolve(BUILD_SITE_KEY);
  if (typeof window === 'undefined') return Promise.resolve('');
  if (window.__turnstileSiteKey) return Promise.resolve(window.__turnstileSiteKey);
  return fetch('/api/config/turnstile')
    .then((r) => (r.ok ? r.json() : { siteKey: '' }))
    .then((data: { siteKey?: string }) => {
      const key = data.siteKey || '';
      if (key && typeof window !== 'undefined') {
        window.__turnstileSiteKey = key;
      }
      return key;
    })
    .catch(() => '');
}

function loadTurnstile(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (window.__turnstileLoading) return window.__turnstileLoading;
  window.__turnstileLoading = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src^="${SCRIPT_SRC.split('?')[0]}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Turnstile script load error')));
      return;
    }
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Turnstile script load error'));
    document.head.appendChild(s);
  });
  return window.__turnstileLoading;
}

export function TurnstileWidget({ onToken, action, theme = 'auto', size = 'normal' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [siteKey, setSiteKey] = useState<string>(BUILD_SITE_KEY || '');

  // Site key fetch — build env yoksa runtime'da backend'ten al
  useEffect(() => {
    let cancelled = false;
    if (!siteKey) {
      loadSiteKey().then((k) => {
        if (!cancelled) setSiteKey(k);
      });
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Site key bulunmazsa parent'a bos token gonder (form gonderebilsin)
  useEffect(() => {
    if (siteKey === '' && BUILD_SITE_KEY === undefined) {
      // Bekleniyor — henuz fetch tamamlanmadi
      return;
    }
    if (!siteKey) {
      onToken('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey]);

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let cancelled = false;

    loadTurnstile()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        try {
          widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey: siteKey,
            theme,
            size,
            action,
            callback: (token) => onToken(token),
            'error-callback': () => setError('Bot dogrulama hatasi — yenile'),
            'expired-callback': () => onToken(''),
          });
        } catch (e) {
          setError((e as Error).message);
        }
      })
      .catch((e: Error) => setError(e.message));

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current); } catch { /* ignore */ }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey]);

  if (!siteKey) return null;

  return (
    <div className="mt-2">
      <div ref={containerRef} className="flex justify-center" />
      {error && (
        <p className="mt-1 text-center text-[11px] text-danger">⚠ {error}</p>
      )}
    </div>
  );
}
