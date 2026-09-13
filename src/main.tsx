import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { router } from './app/router';
import { initDb } from './data/db';
import { queryClient } from './lib/queryClient';
import { initSentry } from './lib/sentry';
import { initTheme } from './store/theme';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { HelmetProvider } from 'react-helmet-async';
import './index.css';

// Theme'i ilk render'dan once <html>'e uygula — FOUC engelle
initTheme();

// Sentry'yi olabildiğince erken init et
initSentry();

// Build version guard — stale chunk hatalarini onceden onle.
// index.html'deki `<meta name="build-version">` her build farkli. Onceki ziyaret
// farkli bir build-version kaydettiyse SW cache'i eski chunk'lari servis etmeye
// devam edebilir → mismatch tespit edince SW zorla update + cache purge + reload.
(function guardBuildVersion() {
  try {
    const meta = document.querySelector('meta[name="build-version"]');
    const current = meta?.getAttribute('content') ?? '';
    if (!current || current.includes('%')) return; // dev/preview: placeholder replace olmamis
    const prev = localStorage.getItem('iq.buildVersion');
    if (prev && prev !== current) {
      // Mismatch: yeni build deploy edilmis, eski SW hala eski chunk'lari serveliyor.
      // SW registrations'i unregister + cache purge → reload sonrasi fresh HTML gelir.
      localStorage.setItem('iq.buildVersion', current); // guncel kaydet ki tekrar loop'a girmesin
      (async () => {
        try {
          if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map((r) => r.unregister()));
          }
          if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          }
        } catch { /* ignore */ }
        // Cache-bypass ile reload — CDN'den fresh index.html cek
        window.location.replace(window.location.pathname + '?_v=' + current);
      })();
      return;
    }
    localStorage.setItem('iq.buildVersion', current);
  } catch { /* ignore */ }
})();

// PWA service worker register — installable app olabilmek için
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('SW register failed', err);
    });
  });
}

// PWA install singleton — beforeinstallprompt event'ini app seviyesinde yakala
import('./lib/pwaInstall').then((m) => m.initPwaInstall()).catch(() => { /* */ });

// Telemetri — anonim event tracking (Premium dönüşüm + UX ölçümü için)
import('./lib/telemetry').then((m) => m.initTelemetry()).catch(() => { /* */ });

initDb()
  .catch((err) => {
    console.error('Veritabanı başlatılamadı:', err);
  })
  .finally(() => {
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <ErrorBoundary label="root">
          <HelmetProvider>
            <QueryClientProvider client={queryClient}>
              <RouterProvider router={router} />
            </QueryClientProvider>
          </HelmetProvider>
        </ErrorBoundary>
      </React.StrictMode>,
    );
  });
