import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { router } from './app/router';
import { initDb } from './data/db';
import { queryClient } from './lib/queryClient';
import { initSentry } from './lib/sentry';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import './index.css';

// Sentry'yi olabildiğince erken init et — global window error'ları da yakalayabilsin
// DSN env'de yoksa no-op döner, bundle'a SDK girmez
initSentry();

initDb()
  .catch((err) => {
    console.error('Veritabanı başlatılamadı:', err);
  })
  .finally(() => {
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <ErrorBoundary label="root">
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
          </QueryClientProvider>
        </ErrorBoundary>
      </React.StrictMode>,
    );
  });
