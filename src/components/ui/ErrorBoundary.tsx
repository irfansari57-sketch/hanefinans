import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { captureException } from '@/lib/sentry';

interface Props {
  children: ReactNode;
  /** Özel fallback render — verilmezse default UI kullanılır. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Sentry'ye gönderilen context'e eklenmek üzere etiket. Hangi boundary'nin yakaladığını anlamak için. */
  label?: string;
}

interface State {
  error: Error | null;
}

/**
 * React render hatalarını yakalayan boundary. Hata oluştuğunda:
 *   1. Sentry'ye otomatik report eder (DSN varsa)
 *   2. Default veya özel fallback UI gösterir
 *   3. Reset edilebilir — kullanıcı "Tekrar dene" diyebilir
 *
 * NOT: Async/event-handler hatalarını YAKALAMAZ — sadece render sırasındaki hatalar.
 * Async için captureException()'ı manuel çağır.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    captureException(error, {
      boundary: this.props.label ?? 'unnamed',
      componentStack: errorInfo.componentStack ?? '',
    });
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error('ErrorBoundary caught:', error, errorInfo);
    }
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }
      return <DefaultErrorFallback error={this.state.error} reset={this.reset} />;
    }
    return this.props.children;
  }
}

function DefaultErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="grid min-h-[300px] place-items-center px-4 py-8">
      <div className="max-w-md rounded-xl border border-danger/30 bg-danger/5 p-6 text-center">
        <AlertTriangle size={32} className="mx-auto text-danger" />
        <h2 className="mt-3 text-base font-semibold text-slate-100">Bir hata oluştu</h2>
        <p className="mt-1 text-sm text-slate-400">
          Sayfayı yüklerken bir sorun çıktı. Tekrar denemeyi veya sayfayı yenilemeyi deneyebilirsin.
        </p>
        {import.meta.env.DEV && (
          <pre className="mt-3 max-h-40 overflow-auto rounded bg-bg-card p-2 text-left text-[10px] text-danger/80">
            {error.message}
            {error.stack && '\n\n' + error.stack}
          </pre>
        )}
        <div className="mt-4 flex justify-center gap-2">
          <button onClick={reset} className="btn-secondary">
            <RefreshCw size={14} /> Tekrar dene
          </button>
          <button onClick={() => window.location.reload()} className="btn-primary">
            Sayfayı yenile
          </button>
        </div>
      </div>
    </div>
  );
}
