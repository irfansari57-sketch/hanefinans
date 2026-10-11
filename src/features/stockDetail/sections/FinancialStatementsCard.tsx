/**
 * FinancialStatementsCard — Hisse detay sayfasında şirket finansalları.
 *
 * Veri: /api/stocks/:symbol/financials (FVT proxy)
 *   - Son 11 çeyrek: Net Satış, Brüt Kar, FAVÖK, Net Kar, Toplam Varlık, Özsermaye, Net Borç
 *   - Çarpanlar: FK, PDDD, FD/FAVÖK, Piyasa Değeri, Ödenmiş Sermaye, Fiili Dolaşım
 *
 * UI felsefesi: FVT'nin ağaç-ağır tablosundan farklı — çeyreklik mini-bar
 * grafikleri + metrik kartları ile görsel özet.
 */

import { useEffect, useMemo, useState } from 'react';
import { BarChart3, RefreshCw, AlertCircle, TrendingUp, TrendingDown, ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCompact } from '@/lib/format';

interface TreeNode {
  key: string;
  label: string;
  value: number | null;
  children: TreeNode[];
}

interface Period {
  donem: string;
  donemTarihi: string;
  toplamVarliklar: number | null;
  ozsermaye: number | null;
  netBorc: number | null;
  netSatis: number | null;
  brutKar: number | null;
  faaliyetKari: number | null;
  favok: number | null;
  netKar: number | null;
  nakitNakitBenzerleri: number | null;
  gonderimTarihi: string;
  bilanco?: TreeNode[] | null;
  gelirTablosu?: TreeNode[] | null;
  nakitAkis?: TreeNode[] | null;
}

interface Carpanlar {
  fk: number | null;
  pddd: number | null;
  fdFavok: number | null;
  piyasaDegeri: number | null;
  odenmisSermaye: number | null;
  fiiliDolasimOrani: number | null;
}

interface FinancialsResp {
  ok: boolean;
  symbol?: string;
  source?: string;
  updatedAt?: string;
  lastReport?: string | null;
  periods?: Period[];
  carpanlar?: Carpanlar | null;
  error?: string;
}

type MetricKey = 'netSatis' | 'brutKar' | 'favok' | 'netKar' | 'faaliyetKari';

const METRIC_LABELS: Record<MetricKey, string> = {
  netSatis: 'Net Satış',
  brutKar: 'Brüt Kar',
  favok: 'FAVÖK',
  faaliyetKari: 'Faaliyet Karı',
  netKar: 'Net Kar',
};

function formatTRY(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `₺${formatCompact(v)}`;
}

function formatRatio(v: number | null | undefined, suffix = ''): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v.toFixed(2)}${suffix}`;
}

function pctChange(a: number | null, b: number | null): number | null {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  return ((a - b) / Math.abs(b)) * 100;
}

interface Props {
  symbol: string;
}

export function FinancialStatementsCard({ symbol }: Props) {
  const [data, setData] = useState<FinancialsResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<MetricKey>('netSatis');
  const [view, setView] = useState<'ozet' | 'bilanco' | 'gelir' | 'nakit'>('ozet');
  const [periodAIdx, setPeriodAIdx] = useState(0);
  const [periodBIdx, setPeriodBIdx] = useState(1);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(`/api/stocks/${encodeURIComponent(symbol)}/financials`);
        const j = (await r.json()) as FinancialsResp;
        if (cancelled) return;
        if (!j.ok) {
          setError(j.error ?? 'Veri alınamadı');
          setData(null);
        } else {
          setData(j);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Fetch hatası');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [symbol]);

  // Grafik için son 8 çeyreği eski → yeni sırada
  const chartPeriods = useMemo(() => {
    if (!data?.periods) return [];
    return [...data.periods].slice(0, 8).reverse();
  }, [data]);

  const chartMax = useMemo(() => {
    if (chartPeriods.length === 0) return 0;
    return Math.max(...chartPeriods.map((p) => Math.abs(p[metric] ?? 0)));
  }, [chartPeriods, metric]);

  const latest = data?.periods?.[0];
  const prev = data?.periods?.[1];
  const yoy = data?.periods?.[4]; // 4 çeyrek önce = YoY karşılaştırma

  if (loading) {
    return (
      <div className="card p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <BarChart3 size={14} /> Şirket Finansalları
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <RefreshCw size={11} className="animate-spin" /> Yükleniyor…
        </div>
      </div>
    );
  }

  if (error || !data?.periods || data.periods.length === 0) {
    return (
      <div className="card p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <BarChart3 size={14} /> Şirket Finansalları
        </div>
        <div className="mt-3 flex items-start gap-2 text-xs text-slate-500">
          <AlertCircle size={12} className="mt-0.5 shrink-0 text-amber-500/70" />
          <span>Bu sembol için finansal rapor verisi bulunamadı. {error ? `(${error})` : ''}</span>
        </div>
      </div>
    );
  }

  const c = data.carpanlar;

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <BarChart3 size={14} /> Şirket Finansalları
        </h3>
        <div className="text-[10px] text-slate-500">
          {data.lastReport ? `Son rapor: ${data.lastReport}` : ''}
        </div>
      </div>

      {/* View tabs */}
      <div className="flex flex-wrap gap-1 border-b border-border px-5 py-2">
        {([
          ['ozet', 'Özet'],
          ['bilanco', 'Bilanço'],
          ['gelir', 'Gelir Tablosu'],
          ['nakit', 'Nakit Akışı'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={cn(
              'rounded-md px-3 py-1 text-[11px] font-medium transition-colors',
              view === key
                ? 'bg-accent text-white'
                : 'text-slate-400 hover:bg-bg-soft hover:text-slate-200',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Detaylı tablo görünümleri — FVT-style: dönem selector + multi-series chart + oranlar + ağaç */}
      {view !== 'ozet' && data.periods && data.periods.length > 0 && (
        <div className="px-5 py-4 space-y-4">
          {/* Dönem seçicisi */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500">Dönem:</span>
            <select
              value={periodAIdx}
              onChange={(e) => setPeriodAIdx(Number(e.target.value))}
              className="rounded-md border border-border bg-bg-soft px-2 py-1 text-slate-200 focus:border-accent focus:outline-none"
            >
              {data.periods.map((p, i) => (
                <option key={i} value={i}>{p.donem}</option>
              ))}
            </select>
            <span className="text-slate-500">vs</span>
            <select
              value={periodBIdx}
              onChange={(e) => setPeriodBIdx(Number(e.target.value))}
              className="rounded-md border border-border bg-bg-soft px-2 py-1 text-slate-200 focus:border-accent focus:outline-none"
            >
              {data.periods.map((p, i) => (
                <option key={i} value={i}>{p.donem}</option>
              ))}
            </select>
          </div>

          {/* Multi-series bar chart — view'a göre */}
          <MultiSeriesChart periods={data.periods} view={view} />

          {/* Finansal Oranlar — mevcut dönem */}
          <FinansalOranlar period={data.periods[periodAIdx]} />

          {/* Ağaç tablo */}
          <StatementTable
            tree={
              view === 'bilanco'
                ? data.periods[periodAIdx]?.bilanco ?? null
                : view === 'gelir'
                ? data.periods[periodAIdx]?.gelirTablosu ?? null
                : data.periods[periodAIdx]?.nakitAkis ?? null
            }
            currentPeriod={data.periods[periodAIdx]}
            prevPeriod={data.periods[periodBIdx] ?? null}
            section={view}
          />
        </div>
      )}

      {/* --- ÖZET görünümü (önceki içerik) --- */}
      {view === 'ozet' && c && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-b border-border bg-bg-soft/40 px-5 py-3 sm:grid-cols-3 lg:grid-cols-6">
          <RatioItem label="F/K" value={formatRatio(c.fk)} />
          <RatioItem label="PD/DD" value={formatRatio(c.pddd)} />
          <RatioItem label="FD/FAVÖK" value={formatRatio(c.fdFavok)} />
          <RatioItem label="Piyasa Değeri" value={formatTRY(c.piyasaDegeri)} />
          <RatioItem label="Ödenmiş Sermaye" value={formatTRY(c.odenmisSermaye)} />
          <RatioItem label="Fiili Dolaşım" value={c.fiiliDolasimOrani != null ? `%${c.fiiliDolasimOrani.toFixed(1)}` : '—'} />
        </div>
      )}

      {/* Son çeyrek özeti + YoY karşılaştırma */}
      {view === 'ozet' && latest && (
        <div className="grid grid-cols-2 gap-3 border-b border-border px-5 py-4 sm:grid-cols-4">
          <SummaryCard
            label="Net Satış"
            value={formatTRY(latest.netSatis)}
            yoy={pctChange(latest.netSatis, yoy?.netSatis ?? null)}
            period={latest.donem}
          />
          <SummaryCard
            label="FAVÖK"
            value={formatTRY(latest.favok)}
            yoy={pctChange(latest.favok, yoy?.favok ?? null)}
            period={latest.donem}
          />
          <SummaryCard
            label="Net Kar"
            value={formatTRY(latest.netKar)}
            yoy={pctChange(latest.netKar, yoy?.netKar ?? null)}
            period={latest.donem}
          />
          <SummaryCard
            label="Net Borç"
            value={formatTRY(latest.netBorc)}
            yoy={pctChange(latest.netBorc, yoy?.netBorc ?? null)}
            period={latest.donem}
            invertColor
          />
        </div>
      )}

      {/* Metrik seçici + çeyreklik bar grafiği */}
      {view === 'ozet' && (
      <div className="px-5 py-4">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {(Object.keys(METRIC_LABELS) as MetricKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setMetric(k)}
              className={cn(
                'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                metric === k
                  ? 'bg-accent text-white'
                  : 'bg-bg-soft text-slate-400 hover:bg-bg-card hover:text-slate-200',
              )}
            >
              {METRIC_LABELS[k]}
            </button>
          ))}
        </div>

        <div className="flex items-end justify-between gap-1" style={{ minHeight: '140px' }}>
          {chartPeriods.map((p) => {
            const v = p[metric];
            const abs = v != null ? Math.abs(v) : 0;
            const MAX_BAR_PX = 110;
            const h = chartMax > 0 ? Math.max(3, (abs / chartMax) * MAX_BAR_PX) : 0;
            const negative = v != null && v < 0;
            return (
              <div key={p.donem} className="group flex flex-1 flex-col items-center gap-1">
                <div
                  className={cn(
                    'w-full min-w-[12px] rounded-t transition-opacity hover:opacity-80',
                    negative ? 'bg-danger' : 'bg-accent',
                  )}
                  style={{ height: `${h}px` }}
                  title={`${p.donem} · ${formatTRY(v)}`}
                />
                <div className="text-[9px] tabular-nums text-slate-500 whitespace-nowrap">{p.donem}</div>
              </div>
            );
          })}
        </div>

        {/* Çeyreklik QoQ delta */}
        {latest && prev && (
          <div className="mt-3 flex items-center gap-4 text-[11px]">
            <QoQBadge
              label="QoQ"
              value={pctChange(latest[metric], prev[metric])}
            />
            <QoQBadge
              label="YoY"
              value={pctChange(latest[metric], yoy?.[metric] ?? null)}
            />
          </div>
        )}
      </div>
      )}

      {/* Bilanço özeti */}
      {view === 'ozet' && latest && (
        <div className="border-t border-border bg-bg-soft/30 px-5 py-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Bilanço · {latest.donem}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] sm:grid-cols-4">
            <BilancoRow label="Toplam Varlıklar" value={formatTRY(latest.toplamVarliklar)} />
            <BilancoRow label="Özsermaye" value={formatTRY(latest.ozsermaye)} />
            <BilancoRow label="Net Borç" value={formatTRY(latest.netBorc)} />
            <BilancoRow label="Nakit" value={formatTRY(latest.nakitNakitBenzerleri)} />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * StatementTable — Bilanço / Gelir Tablosu / Nakit Akış ağaç görünümü.
 * FVT'deki gibi expand/collapse + 2 dönem + % değişim kolonu.
 */
function StatementTable({
  tree,
  currentPeriod,
  prevPeriod,
  section,
}: {
  tree: TreeNode[] | null;
  currentPeriod: Period;
  prevPeriod: Period | null;
  section: 'bilanco' | 'gelir' | 'nakit';
}) {
  // Önceki dönemin aynı tree'sini bul (eşlemeli % değişim için)
  const prevTree: TreeNode[] | null = prevPeriod
    ? (section === 'bilanco' ? prevPeriod.bilanco : section === 'gelir' ? prevPeriod.gelirTablosu : prevPeriod.nakitAkis) ?? null
    : null;

  // Önceki dönemdeki key → value lookup (recursive flatten)
  // NOT: useMemo HER zaman çağrılmalı — early return'den ÖNCE olmalı yoksa
  // React "rendered more hooks" hatası verir, component crash eder.
  const prevMap = useMemo(() => {
    const m = new Map<string, number | null>();
    const walk = (nodes: TreeNode[], path: string) => {
      for (const n of nodes) {
        const p = `${path}/${n.key}`;
        m.set(p, n.value);
        if (n.children?.length) walk(n.children, p);
      }
    };
    if (prevTree) walk(prevTree, '');
    return m;
  }, [prevTree]);

  if (!tree || tree.length === 0) {
    return (
      <div className="flex items-start gap-2 rounded-md bg-bg-soft/50 p-3 text-xs text-slate-500">
        <AlertCircle size={12} className="mt-0.5 shrink-0 text-amber-500/70" />
        <span>Bu bölüm için detaylı veri henüz yok.</span>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 grid grid-cols-[1fr_120px_120px_80px] gap-2 border-b border-border pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        <div>Kalem</div>
        <div className="text-right">{currentPeriod.donem}</div>
        <div className="text-right">{prevPeriod?.donem ?? '—'}</div>
        <div className="text-right">% Değ.</div>
      </div>
      <div className="divide-y divide-border/30">
        {tree.map((node) => (
          <TreeRow key={node.key} node={node} depth={0} path="" prevMap={prevMap} defaultOpen />
        ))}
      </div>
    </div>
  );
}

function TreeRow({
  node,
  depth,
  path,
  prevMap,
  defaultOpen = false,
}: {
  node: TreeNode;
  depth: number;
  path: string;
  prevMap: Map<string, number | null>;
  defaultOpen?: boolean;
}) {
  // Default: ilk 4 seviye açık gelir — kullanıcı tüm kalemleri (Nakit,
  // Ticari Alacaklar, Stoklar vb.) tek bakışta görsün. Parent satırları
  // value=null olduğu için "—" görünür; alt kalemler değer taşır.
  const [open, setOpen] = useState<boolean>(defaultOpen && depth < 4);
  const hasChildren = (node.children?.length ?? 0) > 0;
  const myPath = `${path}/${node.key}`;
  const prevVal = prevMap.get(myPath) ?? null;
  const change = pctChange(node.value, prevVal);
  const isTotal = /toplam|ara_toplam|gross|net/i.test(node.key) || /TOPLAM|ARA/.test(node.label);

  return (
    <>
      <div
        className={cn(
          'grid grid-cols-[1fr_120px_120px_80px] items-center gap-2 py-1.5 text-[11px] tabular-nums',
          isTotal ? 'font-semibold text-slate-100' : 'text-slate-300',
          depth === 0 && 'bg-bg-soft/40',
        )}
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
      >
        <div className="flex items-center gap-1 overflow-hidden">
          {hasChildren ? (
            <button
              onClick={() => setOpen((o) => !o)}
              className="shrink-0 rounded p-0.5 text-slate-500 hover:bg-bg-card hover:text-slate-200"
              aria-label={open ? 'Daralt' : 'Genişlet'}
            >
              {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}
          <span className="truncate" title={node.label}>{node.label}</span>
        </div>
        <div className="text-right">{node.value != null ? formatCompact(node.value) : '—'}</div>
        <div className="text-right text-slate-500">{prevVal != null ? formatCompact(prevVal) : '—'}</div>
        <div className={cn(
          'text-right',
          change == null ? 'text-slate-600' : change > 0 ? 'text-success' : change < 0 ? 'text-danger' : 'text-slate-500',
        )}>
          {change == null ? '—' : `${change > 0 ? '+' : ''}${change.toFixed(1)}%`}
        </div>
      </div>
      {open && hasChildren && node.children.map((child) => (
        <TreeRow key={child.key} node={child} depth={depth + 1} path={myPath} prevMap={prevMap} defaultOpen={defaultOpen} />
      ))}
    </>
  );
}

/**
 * MultiSeriesChart — FVT-style çeyreklik stacked bar grafiği.
 * Bilanço: Toplam Varlıklar / Yükümlülükler / Özkaynaklar
 * Gelir: Net Satış / Brüt Kar / Net Kar
 * Nakit: İşletme / Yatırım / Finansman akışları
 */
function MultiSeriesChart({ periods, view }: { periods: Period[]; view: 'bilanco' | 'gelir' | 'nakit' }) {
  // Son 11 çeyreği eski → yeni sırada
  const chartData = useMemo(() => [...periods].reverse(), [periods]);

  // Her view için ekstrat fonksiyonu
  type Series = { label: string; color: string; getValue: (p: Period) => number | null };
  const seriesList: Series[] = useMemo(() => {
    if (view === 'bilanco') {
      return [
        { label: 'Toplam Varlıklar', color: '#3b82f6', getValue: (p) => p.toplamVarliklar },
        {
          label: 'Yükümlülükler',
          color: '#ef4444',
          getValue: (p) =>
            p.toplamVarliklar != null && p.ozsermaye != null
              ? p.toplamVarliklar - p.ozsermaye
              : null,
        },
        { label: 'Özkaynaklar', color: '#10b981', getValue: (p) => p.ozsermaye },
      ];
    }
    if (view === 'gelir') {
      return [
        { label: 'Net Satış', color: '#3b82f6', getValue: (p) => p.netSatis },
        { label: 'Brüt Kar', color: '#10b981', getValue: (p) => p.brutKar },
        { label: 'Net Kar', color: '#f59e0b', getValue: (p) => p.netKar },
      ];
    }
    // Nakit: tree içinden işletme/yatırım/finansman nakit akışlarını çek
    const extract = (p: Period, keyRegex: RegExp): number | null => {
      const tree = p.nakitAkis;
      if (!tree) return null;
      for (const root of tree) {
        for (const child of root.children ?? []) {
          if (keyRegex.test(child.key)) return child.value;
        }
      }
      return null;
    };
    return [
      { label: 'İşletme', color: '#10b981', getValue: (p) => extract(p, /isletme_faaliyetlerinden/i) },
      { label: 'Yatırım', color: '#f59e0b', getValue: (p) => extract(p, /yatirim_faaliyetlerinden/i) },
      { label: 'Finansman', color: '#8b5cf6', getValue: (p) => extract(p, /finansman_faaliyetlerinden/i) },
    ];
  }, [view]);

  const chartMax = useMemo(() => {
    let max = 0;
    for (const p of chartData) {
      for (const s of seriesList) {
        const v = s.getValue(p);
        if (v != null) max = Math.max(max, Math.abs(v));
      }
    }
    return max;
  }, [chartData, seriesList]);

  const MAX_BAR_PX = 110;

  return (
    <div className="rounded-md bg-bg-soft/30 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-3 text-[10px]">
        {seriesList.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: s.color }} />
            <span className="text-slate-400">{s.label}</span>
          </div>
        ))}
      </div>
      <div className="flex items-end justify-between gap-2" style={{ minHeight: '140px' }}>
        {chartData.map((p) => (
          <div key={p.donem} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex w-full items-end justify-center gap-0.5" style={{ height: `${MAX_BAR_PX}px` }}>
              {seriesList.map((s) => {
                const v = s.getValue(p);
                const abs = v != null ? Math.abs(v) : 0;
                const h = chartMax > 0 ? Math.max(2, (abs / chartMax) * MAX_BAR_PX) : 0;
                const negative = v != null && v < 0;
                return (
                  <div
                    key={s.label}
                    className="flex-1 min-w-[4px] rounded-t transition-opacity hover:opacity-70"
                    style={{
                      height: `${h}px`,
                      backgroundColor: s.color,
                      opacity: negative ? 0.5 : 1,
                    }}
                    title={`${p.donem} · ${s.label}: ${v != null ? formatCompact(v) : '—'}`}
                  />
                );
              })}
            </div>
            <div className="text-[9px] tabular-nums text-slate-500 whitespace-nowrap">{p.donem}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * FinansalOranlar — tek dönemden hesaplanan temel oranlar.
 * FVT'nin "Finansal Oranlar" bölümüne benzer.
 */
function FinansalOranlar({ period }: { period: Period | undefined }) {
  if (!period) return null;

  const borcOzsermaye = period.netBorc != null && period.ozsermaye && period.ozsermaye > 0
    ? period.netBorc / period.ozsermaye
    : null;
  const netKarMarji = period.netKar != null && period.netSatis && period.netSatis > 0
    ? (period.netKar / period.netSatis) * 100
    : null;
  const brutKarMarji = period.brutKar != null && period.netSatis && period.netSatis > 0
    ? (period.brutKar / period.netSatis) * 100
    : null;
  const roe = period.netKar != null && period.ozsermaye && period.ozsermaye > 0
    ? (period.netKar / period.ozsermaye) * 100
    : null;
  const roa = period.netKar != null && period.toplamVarliklar && period.toplamVarliklar > 0
    ? (period.netKar / period.toplamVarliklar) * 100
    : null;

  return (
    <div className="rounded-md border border-border/50 bg-bg-soft/30 p-3">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        Finansal Oranlar · {period.donem}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-5">
        <OranItem label="Borç / Özsermaye" value={borcOzsermaye != null ? `${borcOzsermaye.toFixed(2)}x` : '—'} />
        <OranItem label="Net Kar Marjı" value={netKarMarji != null ? `${netKarMarji.toFixed(2)}%` : '—'} tone={netKarMarji != null && netKarMarji > 0 ? 'pos' : 'neg'} />
        <OranItem label="Brüt Kar Marjı" value={brutKarMarji != null ? `${brutKarMarji.toFixed(2)}%` : '—'} />
        <OranItem label="ROE" value={roe != null ? `${roe.toFixed(2)}%` : '—'} tone={roe != null && roe > 0 ? 'pos' : 'neg'} />
        <OranItem label="ROA" value={roa != null ? `${roa.toFixed(2)}%` : '—'} tone={roa != null && roa > 0 ? 'pos' : 'neg'} />
      </div>
    </div>
  );
}

function OranItem({ label, value, tone }: { label: string; value: string; tone?: 'pos' | 'neg' }) {
  const toneClass = tone === 'pos' ? 'text-success' : tone === 'neg' ? 'text-danger' : 'text-slate-100';
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={cn('text-base font-bold tabular-nums', toneClass)}>{value}</div>
    </div>
  );
}

function RatioItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-sm font-semibold tabular-nums text-slate-100">{value}</div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  yoy,
  period,
  invertColor,
}: {
  label: string;
  value: string;
  yoy: number | null;
  period: string;
  invertColor?: boolean;
}) {
  const positive = yoy != null && yoy > 0;
  const good = invertColor ? !positive : positive;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-base font-bold tabular-nums text-slate-100">{value}</div>
      {yoy != null && (
        <div className={cn('mt-0.5 flex items-center gap-1 text-[10px] font-medium', good ? 'text-success' : 'text-danger')}>
          {positive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
          <span className="tabular-nums">{yoy > 0 ? '+' : ''}{yoy.toFixed(1)}%</span>
          <span className="text-slate-500">YoY</span>
        </div>
      )}
      <div className="text-[9px] text-slate-600">{period}</div>
    </div>
  );
}

function BilancoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium tabular-nums text-slate-200">{value}</span>
    </div>
  );
}

function QoQBadge({ label, value }: { label: string; value: number | null }) {
  if (value == null) return null;
  const positive = value > 0;
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-slate-500">{label}:</span>
      <span className={cn('font-semibold tabular-nums', positive ? 'text-success' : 'text-danger')}>
        {positive ? '+' : ''}{value.toFixed(1)}%
      </span>
    </div>
  );
}
