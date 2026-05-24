import { useEffect, useRef, useState } from 'react';

/**
 * Cloudflare Turnstile widget'ı — bot doğrulaması için React wrapper.
 *
 * VITE_TURNSTILE_SITE_KEY env yoksa widget render olmaz; parent component
 * `onToken('')` ile çağrılarak form gönderimi engellenmez (backend de skip eder).
 * Production'da env set edilince otomatik aktif olur.
 *
 * Kullanım:
 *   <TurnstileWidget onToken={(t) => setTurnstileToken(t)} />
 *   ...
 *   body: JSON.stringify({ ...form, turnstileToken })
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
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

interface Props {
  onToken: (token: string) => void;
  action?: string;
  theme?: 'auto' | 'light' | 'dark';
  size?: 'normal' | 'compact';
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

export function TurnstileWidget({ onToken, action, theme = 'dark', size = 'normal' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Site key yapılandırılmamışsa widget tamamen devre dışı — parent'a "skip" sinyali ver.
  useEffect(() => {
    if (!SITE_KEY) {
      onToken('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!SITE_KEY || !containerRef.current) return;
    let cancelled = false;

    loadTurnstile()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        try {
          widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey: SITE_KEY,
            theme,
            size,
            action,
            callback: (token) => onToken(token),
            'error-callback': () => setError('Bot doğrulama hatası — yenile'),
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
  }, []);

  if (!SITE_KEY) return null;

  return (
    <div className="mt-2">
      <div ref={containerRef} className="flex justify-center" />
      {error && (
        <p className="mt-1 text-center text-[11px] text-danger">⚠ {error}</p>
      )}
    </div>
  );
}
