import { useEffect, useState } from 'react';
import { RefreshCw, CalendarClock } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { MacroCard } from '@/components/domain/MacroCard';
import { loadMacroAll, clearServiceCaches } from '@/data/services';
import { MOCK_MACRO_FALLBACK, MOCK_EVENTS } from '@/data/mock';
import type { MacroIndicator } from '@/data/types';
import { daysUntil, formatDateTR } from '@/lib/date';
import { cn } from '@/lib/utils';

const eventTone: Record<number, string> = {
  3: 'text-danger',
  2: 'text-warning',
  1: 'text-slate-400',
};

// Module-level memo cache — sayfa değişimlerinde yeniden fetch'i önler
const MACRO_MEMO_TTL_MS = 2 * 60_000;
interface MacroMemo {
  fetchedAt: number;
  macro: MacroIndicator[];
}
let macroMemo: MacroMemo | null = null;

export function MacroPage() {
  const [macro, setMacro] = useState<MacroIndicator[]>(() => macroMemo?.macro ?? MOCK_MACRO_FALLBACK);
  const [loading, setLoading] = useState(() => !macroMemo);

  // Memo cache sync
  useEffect(() => {
    if (macro.length > 0 && macro !== MOCK_MACRO_FALLBACK && macro.some((m) => m.source === 'live')) {
      macroMemo = {
        fetchedAt: Date.now(),
        macro,
      };
    }
  }, [macro]);

  useEffect(() => {
    const memoAge = macroMemo ? Date.now() - macroMemo.fetchedAt : Infinity;
    if (memoAge < MACRO_MEMO_TTL_MS) {
      setLoading(false);
      return;
    }
    // İlk yüklemede cache'i temizle, taze çek
    clearServiceCaches();
    loadMacroAll()
      .then((r) => setMacro(r.data))
      .finally(() => setLoading(false));
  }, []);

  const onRefresh = async () => {
    setLoading(true);
    try {
      clearServiceCaches();
      const r = await loadMacroAll();
      setMacro(r.data);
    } finally {
      setLoading(false);
    }
  };

  const liveCount = macro.filter((m) => m.source === 'live').length;
  const sortedEvents = [...MOCK_EVENTS].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <>
      <PageHeader
        title="Makro"
        subtitle="Para birimleri, endeksler, emtia ve yaklaşan olaylar."
        actions={
          <button type="button" className="btn-secondary" onClick={onRefresh} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Yenile
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2 py-0.5 text-success">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          {liveCount} canlı
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-2 py-0.5 text-warning">
          <span className="h-1.5 w-1.5 rounded-full bg-warning" />
          {macro.length - liveCount} mock
        </span>
        <span className="text-slate-500">
          Canlı kaynaklar: frankfurter.app (USD/TRY, EUR/TRY) • Twelve Data (BIST 100, Brent) • GoldAPI (Gram Altın).
          API anahtarları Ayarlar'dan ekle.
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {macro.map((m) => (
          <MacroCard key={m.key} item={m} />
        ))}
      </div>

      <div className="mt-6">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300">
          <CalendarClock size={14} /> Yaklaşan Olaylar
        </h2>
        <div className="rounded-xl border border-border bg-bg-soft">
          <div className="divide-y divide-border">
            {sortedEvents.map((e) => {
              const dleft = daysUntil(e.date);
              return (
                <div key={e.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-100">{e.title}</div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {e.country} • {formatDateTR(e.date)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className={cn('font-medium', eventTone[e.importance])}>
                      {'●'.repeat(e.importance)}
                    </span>
                    <span className="rounded-full bg-bg-card px-2 py-0.5 text-slate-300">
                      {dleft <= 0 ? 'Bugün' : `${dleft} gün`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
