import { useEffect } from 'react';
import { Link, useRouteError, isRouteErrorResponse } from 'react-router-dom';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';
import { captureException } from '@/lib/sentry';

/**
 * React Router'ın `errorElement` slot'una takılan boundary.
 * - Loader/action hataları
 * - Render sırasındaki hatalar (child boundary olmazsa)
 * - 404 (Navigate ile match'lenmeyen route'lar)
 *
 * Tüm hataları Sentry'ye otomatik gönderir (DSN varsa) ve kullanıcıya
 * 404 vs. genel hata için ayrı UI gösterir.
 */
export function RouteErrorBoundary() {
  const error = useRouteError();

  useEffect(() => {
    // 404 değilse Sentry'ye gönder — 404 spam yapmasın
    if (isRouteErrorResponse(error) && error.status === 404) return;
    captureException(error, { source: 'router' });
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error('Route error:', error);
    }
  }, [error]);

  const is404 = isRouteErrorResponse(error) && error.status === 404;
  const errMsg = error instanceof Error ? error.message : String(error);
  const errStack = error instanceof Error ? error.stack : undefined;

  return (
    <div className="grid min-h-screen place-items-center bg-bg-base p-4">
      <div className="max-w-md text-center">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-danger/15">
          <AlertTriangle size={28} className="text-danger" />
        </div>
        <h1 className="mt-4 text-2xl font-bold text-slate-100">
          {is404 ? 'Sayfa bulunamadı' : 'Bir şeyler ters gitti'}
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          {is404
            ? 'Aradığın sayfa silinmiş, taşınmış ya da hiç olmamış olabilir.'
            : 'Sayfayı yüklerken beklenmedik bir hata oluştu. Tekrar dene veya ana sayfaya dön.'}
        </p>

        {import.meta.env.DEV && !is404 && (
          <pre className="mt-4 max-h-40 overflow-auto rounded bg-bg-card p-3 text-left text-[10px] text-danger/80">
            {errMsg}
            {errStack && '\n\n' + errStack}
          </pre>
        )}

        <div className="mt-6 flex justify-center gap-2">
          <Link to="/panel" className="btn-primary">
            <Home size={14} /> Ana sayfaya dön
          </Link>
          {!is404 && (
            <button onClick={() => window.location.reload()} className="btn-secondary">
              <RefreshCw size={14} /> Sayfayı yenile
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
