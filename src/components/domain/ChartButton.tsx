import { useState, lazy, Suspense } from 'react';
import { LineChart } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';

const LiveChart = lazy(() => import('./LiveChart').then((m) => ({ default: m.LiveChart })));

interface ChartButtonProps {
  symbol: string;
  name?: string;
  size?: number;
}

export function ChartButton({ symbol, name, size = 13 }: ChartButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-slate-400 transition hover:bg-bg-card hover:text-slate-200"
        title="Grafik"
      >
        <LineChart size={size} />
        <span className="hidden sm:inline">Grafik</span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`${symbol}${name ? ` — ${name}` : ''}`} size="lg">
        <Suspense fallback={<Skeleton variant="rect" className="w-full" height={460} />}>
          <LiveChart symbol={symbol} height={460} />
        </Suspense>
        <p className="mt-2 text-[11px] text-slate-500">
          Yahoo Finance verisi + TradingView lightweight-charts. Zaman dilimi ve grafik tipini yukarıdan seç.
          Detaylı analiz için sağdaki "TradingView'de aç" linkini kullan.
        </p>
      </Modal>
    </>
  );
}
