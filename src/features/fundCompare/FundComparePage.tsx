/**
 * Fon Karşılaştırıcı — 2-4 fonu yan yana getiri + kategori + TEFAS durumuna göre karşılaştır.
 *
 * URL: /karsilastir?funds=CODE1,CODE2,CODE3
 *
 * Özellikler:
 *  - Fon arama + max 4 fon seçim (chip'lerle görsel)
 *  - Karşılaştırma tablosu: Gün/Hafta/Ay/3A/6A/YBI/1Y/3Y performans
 *  - Kategori + TEFAS durumu göstergesi
 *  - Renkli bar chart: her dönem için tüm seçili fonlar
 *  - localStorage'da son seçim persist
 */

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart3, Search, X, Plus, PiggyBank, TrendingUp, TrendingDown } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { SeoHead } from '@/components/seo/SeoHead';
import { loadFundsAsPerformance } from '@/data/api/tefasGithub';
import type { FundPerformance } from '@/data/types';
import { cn } from '@/lib/utils';

const LS_KEY = 'iq.fundCompare.selection';
const MAX_SELECT = 4;
const CHIP_COLORS = ['#f87171', '#60a5fa', '#34d399', '#fbbf24'];

type PeriodKey = 'day' | 'week' | 'month' | 'threeMonth' | 'sixMonth' | 'ytd' | 'year' | 'threeYear';

const PERIOD_LABELS: Record<PeriodKey, string> = {
  day: 'Gün',
  week: 'Hafta',
  month: 'Ay',
  threeMonth: '3 Ay',
  sixMonth: '6 Ay',
  ytd: 'YBİ',
  year: '1 Yıl',
  threeYear: '3 Yıl',
};

function readSaved(): string[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_SELECT) : [];
  } catch {
    return [];
  }
}

export function FundComparePage() {
  const [params, setParams] = useSearchParams();
  const [allFunds, setAllFunds] = useState<FundPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // URL param > localStorage
  const initialSelected = useMemo(() => {
    const urlCodes = params.get('funds');
    if (urlCodes) return urlCodes.split(',').filter(Boolean).slice(0, MAX_SELECT);
    return readSaved();
  }, [params]);

  const [selected, setSelected] = useState<string[]>(initialSelected);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const result = await loadFundsAsPerformance();
        if (alive && result?.funds) setAllFunds(result.funds);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Seçim değişince URL + localStorage senkronize
  useEffect(() => {
    if (selected.length > 0) {
      setParams({ funds: selected.join(',') }, { replace: true });
      try { localStorage.setItem(LS_KEY, JSON.stringify(selected)); } catch { /* ignore */ }
    } else {
      setParams({}, { replace: true });
      try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
    }
  }, [selected, setParams]);

  const selectedFunds = useMemo(
    () => selected.map((c) => allFunds.find((f) => f.code === c)).filter((f): f is FundPerformance => !!f),
    [selected, allFunds],
  );

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return allFunds
      .filter((f) => !selected.includes(f.code))
      .filter((f) => f.code.toLowerCase().includes(q) || (f.name ?? '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [search, allFunds, selected]);

  const addFund = (code: string) => {
    if (selected.length >= MAX_SELECT) return;
    if (selected.includes(code)) return;
    setSelected([...selected, code]);
    setSearch('');
  };

  const removeFund = (code: string) => {
    setSelected(selected.filter((c) => c !== code));
  };

  // Bar chart için period bazlı sıralama
  const chartData = useMemo(() => {
    if (selectedFunds.length === 0) return [];
    return (Object.keys(PERIOD_LABELS) as PeriodKey[]).map((period) => {
      const values = selectedFunds.map((f) => {
        const raw = f[period as keyof FundPerformance];
        return typeof raw === 'number' ? raw : null;
      });
      const validValues = values.filter((v): v is number => v != null);
      const max = validValues.length > 0 ? Math.max(...validValues.map(Math.abs), 1) : 1;
      return { period, label: PERIOD_LABELS[period], values, max };
    });
  }, [selectedFunds]);

  return (
    <>
      <SeoHead
        title="Fon Karşılaştır"
        description="2-4 TEFAS fonunu yan yana getiri performansı ve kategoriye göre karşılaştır."
        path="/karsilastir"
      />
      <PageHeader
        title="Fon Karşılaştırıcı"
        subtitle={`En fazla ${MAX_SELECT} fon seç, dönemsel performansları yan yana gör`}
      />

      {/* Seçim chip'leri */}
      <section className="glass-card mb-4 p-4">
        <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          <PiggyBank size={12} /> Karşılaştırılacak fonlar ({selected.length}/{MAX_SELECT})
        </div>

        {selected.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {selected.map((code, i) => {
              const f = allFunds.find((x) => x.code === code);
              return (
                <div
                  key={code}
                  className="flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs"
                  style={{
                    borderColor: CHIP_COLORS[i] + '66',
                    backgroundColor: CHIP_COLORS[i] + '15',
                    color: CHIP_COLORS[i],
                  }}
                >
                  <span className="font-bold">{code}</span>
                  {f?.category && <span className="text-slate-500">· {f.category}</span>}
                  <button
                    onClick={() => removeFund(code)}
                    className="ml-1 rounded p-0.5 hover:bg-slate-800/40"
                    aria-label={`${code} kaldır`}
                  >
                    <X size={11} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Fon ekle arama */}
        {selected.length < MAX_SELECT && (
          <div className="relative">
            <div className="flex items-center gap-2 rounded-lg border border-slate-700/50 bg-bg-card px-3 py-2">
              <Search size={14} className="text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Fon kodu veya adı ara (min 2 karakter)…"
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none"
              />
              {loading && <span className="text-[10px] text-slate-500">yükleniyor…</span>}
            </div>
            {searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-72 overflow-y-auto rounded-lg border border-slate-700/50 bg-bg-soft shadow-xl">
                {searchResults.map((f) => (
                  <button
                    key={f.code}
                    onClick={() => addFund(f.code)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition hover:bg-slate-800/40"
                  >
                    <Plus size={12} className="text-accent" />
                    <span className="font-bold text-slate-100">{f.code}</span>
                    <span className="flex-1 truncate text-slate-400">{f.name ?? ''}</span>
                    <span className="rounded bg-slate-800/60 px-1.5 py-0.5 text-[10px] text-slate-500">
                      {f.category}
                    </span>
                    {f.tefasOpen === false && (
                      <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-400">
                        TEFAS Kapalı
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {selectedFunds.length === 0 ? (
        <EmptyState
          icon={<BarChart3 size={28} />}
          title="Karşılaştırma için fon seç"
          description="Yukarıdan en az 2 fon arayıp ekle. Getiri performansları yan yana bar chart ve tablo halinde gösterilecek."
        />
      ) : (
        <>
          {/* Bar chart — her period için tüm fonların bar'ları */}
          <section className="glass-card mb-4 p-4">
            <div className="mb-3 flex items-center gap-2">
              <BarChart3 size={16} className="text-accent" />
              <h3 className="text-sm font-semibold text-slate-100">Dönemsel Getiri Karşılaştırması</h3>
            </div>
            <div className="space-y-4">
              {chartData.map(({ period, label, values, max }) => (
                <div key={period}>
                  <div className="mb-1.5 flex items-center justify-between text-[11px]">
                    <span className="font-medium text-slate-400">{label}</span>
                  </div>
                  <div className="space-y-1">
                    {selectedFunds.map((f, i) => {
                      const v = values[i];
                      const color = CHIP_COLORS[i];
                      const pct = v != null ? (Math.abs(v) / max) * 100 : 0;
                      const isPositive = v != null && v >= 0;
                      return (
                        <div key={f.code} className="flex items-center gap-2 text-[11px]">
                          <span className="w-12 shrink-0 font-bold" style={{ color }}>
                            {f.code}
                          </span>
                          <div className="relative flex-1 rounded overflow-hidden bg-slate-800/40" style={{ height: 18 }}>
                            {v != null && (
                              <div
                                className="absolute inset-y-0 left-0 rounded"
                                style={{
                                  width: `${pct}%`,
                                  backgroundColor: color,
                                  opacity: isPositive ? 0.8 : 0.4,
                                }}
                              />
                            )}
                          </div>
                          <span
                            className={cn(
                              'w-14 shrink-0 text-right font-semibold tabular-nums',
                              v == null ? 'text-slate-600' : isPositive ? 'text-emerald-400' : 'text-red-400',
                            )}
                          >
                            {v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : '—'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Detay tablo */}
          <section className="glass-card p-4">
            <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Detaylı karşılaştırma tablosu
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-xs">
                <thead className="border-b border-border text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="p-2 text-left">Metrik</th>
                    {selectedFunds.map((f, i) => (
                      <th key={f.code} className="p-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ backgroundColor: CHIP_COLORS[i] }}
                          />
                          <span className="font-bold" style={{ color: CHIP_COLORS[i] }}>
                            {f.code}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  <tr>
                    <td className="p-2 text-slate-500">Ad</td>
                    {selectedFunds.map((f) => (
                      <td key={f.code} className="p-2 text-right text-slate-300">{f.name ?? '—'}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="p-2 text-slate-500">Kategori</td>
                    {selectedFunds.map((f) => (
                      <td key={f.code} className="p-2 text-right text-slate-300">{f.category}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="p-2 text-slate-500">TEFAS</td>
                    {selectedFunds.map((f) => (
                      <td key={f.code} className="p-2 text-right">
                        <span className={cn(
                          'rounded px-1.5 py-0.5 text-[10px] font-medium',
                          f.tefasOpen === false ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400',
                        )}>
                          {f.tefasOpen === false ? 'Kapalı' : 'Açık'}
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="p-2 text-slate-500">Birim Pay Değeri</td>
                    {selectedFunds.map((f) => (
                      <td key={f.code} className="p-2 text-right tabular-nums text-slate-300">
                        {f.nav != null ? f.nav.toFixed(6) : '—'}
                      </td>
                    ))}
                  </tr>
                  {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((p) => (
                    <tr key={p}>
                      <td className="p-2 text-slate-500">{PERIOD_LABELS[p]} Getiri</td>
                      {selectedFunds.map((f) => {
                        const v = f[p as keyof FundPerformance];
                        const num = typeof v === 'number' ? v : null;
                        return (
                          <td key={f.code} className="p-2 text-right tabular-nums">
                            {num != null ? (
                              <span className={cn(
                                'font-semibold',
                                num >= 0 ? 'text-emerald-400' : 'text-red-400',
                              )}>
                                {num >= 0 ? <TrendingUp size={10} className="inline" /> : <TrendingDown size={10} className="inline" />}{' '}
                                {num >= 0 ? '+' : ''}{num.toFixed(2)}%
                              </span>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-center text-[10px] text-slate-500">
              Veriler TEFAS resmi API'sinden gelir. Karşılaştırmalar bilgilendirme amaçlıdır; yatırım tavsiyesi değildir.
            </p>
          </section>
        </>
      )}
    </>
  );
}
