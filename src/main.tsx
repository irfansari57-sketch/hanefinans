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
