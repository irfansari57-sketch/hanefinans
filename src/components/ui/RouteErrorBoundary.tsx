import { useEffect, useState } from 'react';
import { Link, useRouteError, isRouteErrorResponse } from 'react-router-dom';
import { AlertTriangle, Home, RefreshCw, Trash2 } from 'lucide-react';
import { captureException } from '@/lib/sentry';

/**
 * Aggressive cache clear — SW unregister + caches.delete + sessionStorage reset.
 * "Stale chunk" hatalarında (yeni deploy + eski browser cache) tek tık ile çözer.
 * Özellikle mobilde manuel SW temizleme zor olduğu için bu kritik.
 */
async function clearEverythingAndReload() {
  try {
    // 1) Service worker'ları sil
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch { /* ignore */ }
  try {
    // 2) Cache Storage tamamen temizle (workbox + runtime cache'ler)
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch { /* ignore */ }
  try {
    // 3) Reload sayacini resetle (lazyWithRetry 3-deneme sınırı)
    sessionStorage.removeItem('fa.chunkReloadHistory');
  } catch { /* ignore */ }
  // 4) Cache bypass ile sayfayı tekrar yükle
  window.location.replace(window.location.pathname + '?_=' + Date.now());
}

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
  const [clearing, setClearing] = useState(false);
  const [autoRecovering, setAutoRecovering] = useState(false);

  const is404 = isRouteErrorResponse(error) && error.status === 404;

  // Mesajı kontrol et — chunk fetch hatasıysa cache temizleme butonunu daha öne çıkar
  const errMsgRaw = error instanceof Error ? error.message : String(error);
  const looksLikeChunkError = /Failed to fetch dynamically imported module|Importing a module script failed|MIME type|ChunkLoadError|Loading chunk|Loading CSS chunk/i.test(errMsgRaw);

  useEffect(() => {
    // 404 değilse Sentry'ye gönder — 404 spam yapmasın
    if (isRouteErrorResponse(error) && error.status === 404) return;
    captureException(error, { source: 'router' });
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error('Route error:', error);
    }
  }, [error]);

  // Chunk load fail → otomatik cache clear + reload (kullanıcı butona basmadan)
  // Session başına max 1 kez tetiklenir (loop savunması)
  useEffect(() => {
    if (is404 || !looksLikeChunkError) return;
    const KEY = 'iq.autoRecoverAttempted';
    try {
      if (sessionStorage.getItem(KEY)) return;
      sessionStorage.setItem(KEY, String(Date.now()));
    } catch {
      return;
    }
    setAutoRecovering(true);
    // Sentry event'in gitmesine izin ver (kısa gecikme), sonra clear+reload
    const t = window.setTimeout(() => {
      clearEverythingAndReload();
    }, 600);
    return () => window.clearTimeout(t);
  }, [is404, looksLikeChunkError]);

  const onClearAndReload = async () => {
    setClearing(true);
    await clearEverythingAndReload();
  };

  // Auto-recovery devrede: minimal loading UI
  if (autoRecovering) {
    return (
      <div className="grid min-h-screen place-items-center bg-bg-base p-4">
        <div className="max-w-md text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-3 border-slate-700 border-t-emerald-400" />
          <p className="mt-4 text-sm text-slate-400">
            Yeni sürüm yükleniyor…
          </p>
        </div>
      </div>
    );
  }

  const errMsg = errMsgRaw;
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

        {!is404 && looksLikeChunkError && (
          <p className="mt-3 text-[11px] text-warning">
            Önbellek sorunu tespit edildi. Aşağıdaki "Önbelleği temizle" butonu ile çözülür.
          </p>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link to="/panel" className="btn-primary">
            <Home size={14} /> Ana sayfaya dön
          </Link>
          {!is404 && (
            <>
              <button
                onClick={onClearAndReload}
                disabled={clearing}
                className="btn-primary"
                title="Service Worker + önbellek temizler, sayfayı sıfırdan yükler"
              >
                <Trash2 size={14} />
                {clearing ? 'Temizleniyor…' : 'Önbelleği temizle ve yeniden dene'}
              </button>
              <button onClick={() => window.location.reload()} className="btn-secondary">
                <RefreshCw size={14} /> Sayfayı yenile
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
