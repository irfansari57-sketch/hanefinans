import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { router } from './app/router';
import { initDb } from './data/db';
import { queryClient } from './lib/queryClient';
import { initSentry } from './lib/sentry';
import { initTheme } from './store/theme';
import { initDensity } from './store/density';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { HelmetProvider } from 'react-helmet-async';
import './index.css';

// Theme'i ilk render'dan once <html>'e uygula — FOUC engelle
initTheme();
initDensity();

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
// 15 Eki 2026: deploy sonrasi eski bundle'da kalma sorunu icin
//  (a) yeni SW kontrolu devralinca (controllerchange) sayfa yenilenir — kullanici
//      bir alanda yaziyorsa hemen degil, sekme gizlenince / rota degisince,
//  (b) SW guncellemesi periyodik (15 dk) + sekme gorunur olunca tetiklenir.
//  Build-version guard (yukarida) ikinci savunma hatti olarak kalir.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      const check = () => { reg.update().catch(() => { /* offline vb. */ }); };
      window.setInterval(check, 15 * 60_000);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    }).catch((err) => {
      console.error('SW register failed', err);
    });
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded) return; // ilk kurulumda yenileme yok
      reloaded = true;
      const safeReload = () => window.location.reload();
      const typing = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      if (document.visibilityState === 'hidden' || !typing) { safeReload(); return; }
      // Kullanici yaziyor: rota degisince veya sekme gizlenince yenile
      (window as unknown as { __iqNeedsReload?: boolean }).__iqNeedsReload = true;
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') safeReload(); }, { once: true });
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
