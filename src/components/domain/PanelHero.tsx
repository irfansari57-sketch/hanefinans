/**
 * PanelHero — Panel sayfasi ust hero bileseni (Varyant B: Panel-Komenter).
 *
 * Yapı:
 *  1) Ust ticker seridi — pill chip'ler (BIST 100, USD, GRAM, BTC vs.)
 *  2) Buyuk hero — BIST 100 buyuk sayi + zaman sekmeleri (1H/1A/3A/YTD)
 *     + area chart (SVG, gunluk close serisi)
 *  3) Alt AI komenter — Q ikonlu, bugunun piyasa yorumu (bize ozgu ayirt edici)
 *
 * FVT tarzi kompakt, ama Q logosu emerald tonuyla + AI komenter InvestliQ imzasi.
 */
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import type { MacroIndicator } from '@/data/types';
import { fetchHistoricalYahoo } from '@/data/api/yahoo';
import { MiniAreaChart as SharedMiniAreaChart } from './PanelStyleChart';

type Period = '1H' | '1A' | '3A' | 'YTD';

interface Props {
  macro: MacroIndicator[];
  /** Ana grafik icin default sembol (BIST 100). Kullanici pill'e tiklayarak degistirebilir. */
  defaultSymbol?: string;
}

/** Kategorili grup + Varyant A kart tarzi (kullanici talebi 2026-09-09).
 *  Endekse VIOP 30 + XBANK, doviz'e GBP/TRY + EUR/USD, kripto'ya XRP + DOGE eklendi. */
const TICKER_GROUPS: Array<{ title: string; keys: string[] }> = [
  { title: 'ENDEKS', keys: ['BIST 100', 'BIST 30', 'XUTUM', 'XBANK'] },
  { title: 'DÖVİZ',  keys: ['USD/TRY', 'EUR/TRY', 'GBP/TRY', 'EUR/USD'] },
  { title: 'METAL',  keys: ['Gram Altın', 'Ons Altın', 'Gram Gümüş', 'Ons Gümüş'] },
  { title: 'KRİPTO', keys: ['BTC/USD', 'ETH/USD', 'XRP/USD', 'DOGE/USD'] },
];

function formatValue(m: MacroIndicator): string {
  const key = m.key;
  // Endeks: BIST/VIOP/XBANK — binlik ayirici
  if (key === 'BIST 100' || key === 'BIST 30' || key === 'XUTUM' || key === 'XBANK') {
    return m.value.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
  }
  // Doviz TL karsi: 2 ondalik
  if (key === 'USD/TRY' || key === 'EUR/TRY' || key === 'GBP/TRY') return m.value.toFixed(2);
  // EUR/USD pariteti: 4 ondalik (1.1712)
  if (key === 'EUR/USD') return m.value.toFixed(4);
  if (key === 'Gram Altın') return m.value.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
  if (key === 'Ons Altın') return m.value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  // Kripto — kucuk deger (DOGE < 1) icin 4 ondalik
  if (m.value < 1) return m.value.toFixed(4);
  if (m.value < 10) return m.value.toFixed(2);
  if (m.value < 1000) return m.value.toFixed(0);
  // BTC vs. — kısaltma (79.4K)
  return (m.value / 1000).toFixed(1) + 'K';
}

/** Yahoo sembol eslesmesi — ana grafik icin. */
function toYahooSymbol(key: string): string {
  if (key === 'BIST 100') return 'XU100.IS';
  if (key === 'BIST 30') return 'XU030.IS';
  if (key === 'VIOP 30') return 'XU030.IS'; // VIOP 30 endeksi BIST 30 vadelisi — spot XU030 kullanilir
  if (key === 'XBANK') return 'XBANK.IS';
  if (key === 'XUTUM') return 'XUTUM.IS';
  if (key === 'USD/TRY') return 'USDTRY=X';
  if (key === 'EUR/TRY') return 'EURTRY=X';
  if (key === 'GBP/TRY') return 'GBPTRY=X';
  if (key === 'EUR/USD') return 'EURUSD=X';
  if (key === 'Gram Altın') return 'GC=F';
  if (key === 'Ons Altın') return 'GC=F';
  if (key === 'Gram Gümüş') return 'SI=F';
  if (key === 'Ons Gümüş') return 'SI=F';
  if (key === 'BTC/USD') return 'BTC-USD';
  if (key === 'ETH/USD') return 'ETH-USD';
  if (key === 'XRP/USD') return 'XRP-USD';
  if (key === 'DOGE/USD') return 'DOGE-USD';
  return 'XU100.IS';
}

type YahooRange = '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y' | '2y' | '5y' | 'ytd';
const PERIOD_RANGE: Record<Period, YahooRange> = {
  '1H': '5d',
  '1A': '1mo',
  '3A': '3mo',
  YTD: 'ytd',
};

/**
 * Is Yatirim chart fallback — kurumsal aglarda Yahoo bloklu ise
 * BIST endeks/hisse icin /api/isyatirim/chart endpoint'inden data cek.
 * Forex/kripto/emtia icin null doner (Is Yatirim kapsamı disi).
 */
function toIsYatirimSymbol(key: string): string | null {
  if (key === 'BIST 100') return 'XU100';
  if (key === 'BIST 30') return 'XU030';
  // VIOP 30 = BIST 30 vadeli kontrat. Aktif kontrat sembolu XU030DV{YIL}
  // (yillik guncelleme gerekebilir - Ocak 2027'de XU030DV2027 olmali).
  if (key === 'VIOP 30') return 'XU030DV2026';
  if (key === 'XBANK') return 'XBANK';
  if (key === 'XUTUM') return 'XUTUM';
  return null; // forex + kripto + emtia Yahoo'da kalir
}

type IsRange = '1mo' | '3mo' | '6mo' | '1y' | 'ytd';
const PERIOD_TO_IS: Record<Period, IsRange> = {
  '1H': '1mo', // Is Yatirim'da daily minimum period, 5d icin 1mo yeter
  '1A': '1mo',
  '3A': '3mo',
  YTD: 'ytd',
};

async function fetchIsYatirimChart(
  isSym: string, isRange: IsRange,
): Promise<Array<{ date: number; close: number }> | null> {
  try {
    const resp = await fetch(`/api/isyatirim/chart?symbol=${isSym}&range=${isRange}`);
    if (!resp.ok) return null;
    const json = await resp.json() as {
      ok?: boolean; bars?: Array<{ date: number; close: number }>;
    };
    if (!json.ok || !Array.isArray(json.bars) || json.bars.length === 0) return null;
    return json.bars;
  } catch {
    return null;
  }
}

export function PanelHero({ macro, defaultSymbol = 'BIST 100' }: Props) {
  const [primarySymbol, setPrimarySymbol] = useState<string>(defaultSymbol);
  const [period, setPeriod] = useState<Period>('YTD');
  const [series, setSeries] = useState<Array<{ date: number; close: number }>>([]);
  const [seriesLoading, setSeriesLoading] = useState(false);
  // Macro'da sadece mock deger olan bazi endeksler icin (XUTUM vs) Is Yatirim'dan
  // canli fetch — /api/isyatirim/chart son 2 close'undan value + changePct hesaplarız.
  const [extraQuotes, setExtraQuotes] = useState<Record<string, { value: number; changePct: number }>>({});

  useEffect(() => {
    let alive = true;
    // /api/isyatirim/chart endpoint'inden son 2 close alalim — chart data
    // dogrulukla geliyor (kullanici testi), ticker value icin ayni kaynak.
    // Snapshot endpoint denemesi sırasında XBANK vs. mock kaliyordu.
    const targets: Array<[string, string]> = [
      ['XUTUM', 'XUTUM'],
      ['XBANK', 'XBANK'],
    ];
    (async () => {
      try {
        const results = await Promise.all(targets.map(async ([_, sym]) => {
          try {
            const bars = await fetchIsYatirimChart(sym, '1mo');
            if (!bars || bars.length < 2) return null;
            const last = bars[bars.length - 1].close;
            const prev = bars[bars.length - 2].close;
            return { value: last, changePct: prev > 0 ? ((last - prev) / prev) * 100 : 0 };
          } catch { return null; }
        }));
        if (!alive) return;
        const map: Record<string, { value: number; changePct: number }> = {};
        targets.forEach(([key], i) => { const r = results[i]; if (r) map[key] = r; });
        if (Object.keys(map).length > 0) setExtraQuotes(map);
      } catch { /* extra quote fetch failed - macro mock degeri kalir, panel calisir */ }
    })();
    return () => { alive = false; };
  }, []);

  // Macro'yu extra quote'lar ile enrich et (XUTUM vs. icin canli deger)
  const enrichedMacro = useMemo(() => {
    if (Object.keys(extraQuotes).length === 0) return macro;
    return macro.map((m) => {
      const q = extraQuotes[m.key];
      return q
        ? { ...m, value: q.value, changePct: q.changePct, source: 'live' as const }
        : m;
    });
  }, [macro, extraQuotes]);

  const primary = useMemo(() => enrichedMacro.find((m) => m.key === primarySymbol), [enrichedMacro, primarySymbol]);

  useEffect(() => {
    let alive = true;
    setSeriesLoading(true);
    const ysym = toYahooSymbol(primarySymbol);
    // VIOP 30 vadelidir - Yahoo'da yok, dogrudan Is Yatirim'a git.
    // Diger BIST endeksleri onceki gibi: Yahoo birincil, IS fallback.
    const skipYahoo = primarySymbol === 'VIOP 30';
    // Gram Altin/Gumus Yahoo/Is Yatirim'dan Ons (GC=F/SI=F) ceker.
    // Cizilen chart Ons cinsinden gozukur (~4500 USD, ~100 USD gibi degerler).
    // Ticker Gram TL'e cevirir icin scale factor: currentGramTL / currentOnsUSD
    // Historical Ons close'lari bu ratio ile carpip Gram TL yaklasik degeri gosterelim.
    // Not: USD/TRY zamanla degistigi icin bu tam degil, ama trend/sekil dogru.
    const primaryMacro = enrichedMacro.find((mm) => mm.key === primarySymbol);
    const onsMacroKey = primarySymbol === 'Gram Altın' ? 'Ons Altın'
      : primarySymbol === 'Gram Gümüş' ? 'Ons Gümüş' : null;
    const onsMacro = onsMacroKey ? enrichedMacro.find((mm) => mm.key === onsMacroKey) : null;
    const scaleFactor = onsMacro && primaryMacro && onsMacro.value > 0
      ? primaryMacro.value / onsMacro.value
      : null;
    (async () => {
      try {
        // 1) Yahoo Finance — birincil kaynak (VIOP haric)
        if (!skipYahoo) {
          const data = await fetchHistoricalYahoo(ysym, PERIOD_RANGE[period], '1d');
          const pairs = (data?.closes ?? [])
            .filter((c) => Number.isFinite(c.close) && c.close > 0);
          if (pairs.length >= 2) {
            const scaled = scaleFactor
              ? pairs.map((p) => ({ date: p.date, close: p.close * scaleFactor }))
              : pairs;
            if (alive) setSeries(scaled);
            return;
          }
        }
        // 2) Fallback: Is Yatirim (kurumsal aglarda Yahoo bloklu + VIOP)
        const isSym = toIsYatirimSymbol(primarySymbol);
        if (isSym) {
          const isBars = await fetchIsYatirimChart(isSym, PERIOD_TO_IS[period]);
          if (isBars && isBars.length >= 2 && alive) {
            const scaled = scaleFactor
              ? isBars.map((b) => ({ date: b.date, close: b.close * scaleFactor }))
              : isBars;
            setSeries(scaled);
            return;
          }
        }
        if (alive) setSeries([]);
      } catch {
        if (alive) setSeries([]);
      } finally {
        if (alive) setSeriesLoading(false);
      }
    })();
    return () => { alive = false; };
    // enrichedMacro DEP DIŞI — macro her 30sn refresh oldugu icin bagimlilikta
    // olsaydi chart durmadan re-fetch olurdu (Panel skeleton'a duser). Scale factor
    // ilk mount'ta hesaplanan degerle kalır — historical chart aylık, gram/ons
    // ratio yavas degisir, tolerable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primarySymbol, period]);

  return (
    <div className="rounded-xl border border-accent/25 bg-bg-card/40 p-4">
      {/* Ust ticker — Desktop: 4 kategorili grup (Endeks/Doviz/Metal/Kripto).
          Mobil: yatay kaydirmali tek satir chip strip (kompakt UX 11 Eyl 2026).
          Aktif chip'te accent border + subtle bg. */}

      {/* MOBIL: yatay chip strip */}
      <div className="mb-3 md:hidden -mx-1">
        <div className="scrollbar-none flex gap-1.5 overflow-x-auto px-1 pb-1">
          {TICKER_GROUPS.flatMap((g) => g.keys).map((key) => {
            const m = enrichedMacro.find((mm) => mm.key === key);
            if (!m) return null;
            const isActive = m.key === primarySymbol;
            const isPositive = (m.changePct ?? 0) >= 0;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setPrimarySymbol(m.key)}
                className={cn(
                  'shrink-0 rounded-lg border px-2.5 py-1.5 text-left transition',
                  isActive
                    ? 'border-accent/50 bg-accent/15'
                    : 'border-border bg-bg-soft/40 hover:border-accent/30',
                )}
              >
                <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 leading-none">
                  {m.key}
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xs font-bold tabular-nums text-slate-100">{formatValue(m)}</span>
                  {m.changePct != null && Number.isFinite(m.changePct) && (
                    <span className={cn(
                      'text-[10px] tabular-nums',
                      isPositive ? 'text-success' : 'text-danger',
                    )}>
                      {isPositive ? '+' : ''}{m.changePct.toFixed(2)}%
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* DESKTOP: 4 kategorili grup */}
      <div className="mb-4 hidden md:grid grid-cols-2 gap-3 md:grid-cols-4">
        {TICKER_GROUPS.map((group) => (
          <div key={group.title} className="min-w-0">
            <div className="mb-1.5 pl-1 text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">
              {group.title}
            </div>
            <div className="flex flex-col gap-1">
              {group.keys.map((key) => {
                const m = enrichedMacro.find((mm) => mm.key === key);
                if (!m) return null;
                return (
                  <TickerRow
                    key={m.key}
                    m={m}
                    isPrimary={m.key === primarySymbol}
                    onSelect={() => setPrimarySymbol(m.key)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Hero baslik + sayi + tab sekmeleri */}
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{primarySymbol}</span>
          <span className="text-3xl font-bold tabular-nums text-slate-100 sm:text-4xl">
            {primary ? formatValue(primary) : '—'}
          </span>
          {primary?.changePct != null && Number.isFinite(primary.changePct) && (
            <span className={cn(
              'text-sm font-semibold tabular-nums',
              primary.changePct >= 0 ? 'text-success' : 'text-danger',
            )}>
              {primary.changePct >= 0 ? '↗ +' : '↘ '}
              {primary.changePct.toFixed(2)}%
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {(['1H', '1A', '3A', 'YTD'] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={cn(
                'rounded-md px-2.5 py-1 text-[11px] font-semibold transition',
                period === p
                  ? 'bg-bg-soft text-slate-100'
                  : 'text-slate-400 hover:bg-bg-soft/50 hover:text-slate-200',
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="mb-4">
        {seriesLoading && series.length === 0 ? (
          <div className="h-32 animate-pulse rounded bg-bg-soft/40" />
        ) : series.length >= 2 ? (
          <SharedMiniAreaChart
            data={series}
            positive={(primary?.changePct ?? 0) >= 0}
            formatValue={(v) => {
              if (primarySymbol === 'BIST 100' || primarySymbol === 'BIST 30') {
                return v.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
              }
              if (v >= 1000) return v.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
              return v.toFixed(2);
            }}
          />
        ) : (
          <div className="grid h-32 place-items-center rounded bg-bg-soft/20 text-[11px] text-slate-500">
            Grafik verisi yok
          </div>
        )}
      </div>

      {/* AI Komenter satiri — bize ozgu */}
      <AiComment primary={primary} allMacro={macro} />
    </div>
  );
}

/** Varyant A (kullanici sectigi): her satir belirgin kart — border + bg.
 *  Aktif olan yesil border-tint. Hover'da hafif kabarma. */
function TickerRow({ m, isPrimary, onSelect }: {
  m: MacroIndicator;
  isPrimary: boolean;
  onSelect: () => void;
}) {
  const cp = m.changePct;
  const finite = cp != null && Number.isFinite(cp);
  const isUp = finite && (cp as number) > 0;
  const isDown = finite && (cp as number) < 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-[11px] transition text-left',
        isPrimary
          ? 'border-accent bg-accent/15 shadow-sm shadow-accent/20'
          : 'border-border bg-bg-card/70 hover:border-accent/40 hover:bg-bg-card',
      )}
      aria-pressed={isPrimary}
      title={`${m.label} grafiğini göster`}
    >
      <span className="min-w-0 flex-1 truncate font-medium text-slate-400 dark:text-slate-300">
        {m.label}
      </span>
      <span className="shrink-0 font-bold tabular-nums text-slate-900 dark:text-slate-100">
        {formatValue(m)}
      </span>
      {finite && (
        <span className={cn(
          'shrink-0 min-w-[48px] text-right font-semibold tabular-nums text-[10px]',
          isUp && 'text-success',
          isDown && 'text-danger',
        )}>
          {isUp ? '+' : ''}{(cp as number).toFixed(2)}%
        </span>
      )}
    </button>
  );
}

/**
 * SVG area chart — kapanis serisi. Y-axis (sag) + X-axis (alt) tarih labellari.
 * Data: {date: ms, close: number}[] — X-axis tarih hesabinda kullanilir.
 */
function MiniAreaChart({ data, positive, formatValue }: {
  data: Array<{ date: number; close: number }>;
  positive: boolean;
  formatValue?: (v: number) => string;
}) {
  const values = data.map((d) => d.close);
  const W = 620;
  const H = 160; // yukseklik biraz artti — X-axis label icin
  const PAD_TOP = 8;
  const PAD_BOTTOM = 22; // X-axis label yeri
  const PAD_RIGHT = 44;  // Y-axis label yeri
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mid = (min + max) / 2;
  const range = max - min || 1;
  const chartW = W - PAD_RIGHT;
  const chartH = H - PAD_TOP - PAD_BOTTOM;
  const xStep = chartW / Math.max(1, values.length - 1);
  const points = values.map((v, i) => ({
    x: i * xStep,
    y: PAD_TOP + (1 - (v - min) / range) * chartH,
  }));
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const bottom = PAD_TOP + chartH;
  const area = `${line} L ${points[points.length - 1].x.toFixed(1)} ${bottom} L 0 ${bottom} Z`;
  const stroke = positive ? '#22c55e' : '#ef4444';
  const fillId = positive ? 'panelHeroGradPos' : 'panelHeroGradNeg';
  const fmt = formatValue ?? ((v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 2 }));

  // 3 seviye y-axis: min, mid, max — sag tarafta yaslanmis
  const yLevels = [
    { v: max, y: PAD_TOP },
    { v: mid, y: PAD_TOP + chartH / 2 },
    { v: min, y: bottom },
  ];

  // X-axis tarih labellari — 5 esit noktada: 0, 25%, 50%, 75%, 100%
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((r) => {
    const i = Math.min(data.length - 1, Math.round(r * (data.length - 1)));
    return { i, x: i * xStep };
  });
  const TR_MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const fmtDate = (ms: number) => {
    const d = new Date(ms);
    return `${d.getDate()} ${TR_MONTHS[d.getMonth()]}`;
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-40 w-full">
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.30" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Grid — 3 yatay ince cizgi (dashed) */}
      {yLevels.map((lv) => (
        <line
          key={lv.y}
          x1="0" x2={chartW}
          y1={lv.y} y2={lv.y}
          stroke="rgba(148,163,184,0.15)"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
      ))}
      <path d={area} fill={`url(#${fillId})`} />
      <path d={line} stroke={stroke} strokeWidth="2" fill="none" />
      {/* Y-axis label seviyeleri — sag taraf */}
      {yLevels.map((lv) => (
        <text
          key={`y-${lv.y}`}
          x={W - 4}
          y={lv.y + 3}
          fill="rgba(148,163,184,0.75)"
          fontSize="10"
          fontWeight="500"
          textAnchor="end"
          fontFamily="Inter, system-ui, sans-serif"
        >
          {fmt(lv.v)}
        </text>
      ))}
      {/* X-axis tarih labellari — alt taraf */}
      {xTicks.map((t) => {
        const d = data[t.i];
        if (!d) return null;
        const anchor = t.i === 0 ? 'start' : t.i === data.length - 1 ? 'end' : 'middle';
        return (
          <text
            key={`x-${t.i}`}
            x={t.x}
            y={H - 6}
            fill="rgba(148,163,184,0.75)"
            fontSize="10"
            fontWeight="500"
            textAnchor={anchor}
            fontFamily="Inter, system-ui, sans-serif"
          >
            {fmtDate(d.date)}
          </text>
        );
      })}
    </svg>
  );
}

/**
 * AI Komenter — kural tabanli (LLM cagirmadan) hizli özet.
 * Piyasa hareket buyüklügü + yönü + hangi sinif liderlik ediyor.
 * Ileride /api/ai/panel-comment gibi bir endpoint'e taşınabilir.
 */
function AiComment({ primary, allMacro }: { primary: MacroIndicator | undefined; allMacro: MacroIndicator[] }) {
  const text = useMemo(() => buildComment(primary, allMacro), [primary, allMacro]);
  return (
    <div className="flex items-start gap-3 rounded-lg border-l-2 border-accent bg-gradient-to-r from-accent/10 to-transparent px-3 py-2.5">
      <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-300 via-emerald-500 to-emerald-700 text-[10px] font-bold text-emerald-950">
        Q
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold text-slate-100">
          {primary ? `${primary.label} — bugünün yorumu` : 'Bugünün yorumu'}
        </div>
        <div className="mt-0.5 text-[12px] leading-relaxed text-slate-300">{text}</div>
      </div>
    </div>
  );
}

/**
 * Sembole ozel yorum — hangi indikator secili ise onun karakteri
 * (endeks/doviz/metal/kripto) ile uygun tonda paragraf uret.
 */
function buildComment(primary: MacroIndicator | undefined, all: MacroIndicator[]): string {
  if (!primary || primary.changePct == null || !Number.isFinite(primary.changePct)) {
    return 'Bu göstergenin canlı veri akışı henüz yok. Kısa süre içinde güncellenecek.';
  }

  const p = primary.changePct;
  const key = primary.key;
  const parts: string[] = [];

  // Ana sembol için kişiselleştirilmiş yorum
  if (key === 'BIST 100' || key === 'BIST 30') {
    if (Math.abs(p) < 0.15) parts.push(`${key} yatay seyir gösteriyor, hacim düşük — kararsız gün.`);
    else if (p >= 1.5) parts.push(`${key} %${p.toFixed(2)} güçlü yükselişte — alım baskısı belirgin, momentum güçlü.`);
    else if (p >= 0.5) parts.push(`${key} %${p.toFixed(2)} pozitif ivmede. Bankacılık ve holdingler öncü olabilir.`);
    else if (p >= 0) parts.push(`${key} %${p.toFixed(2)} sınırlı artışta, seçici alım.`);
    else if (p >= -0.5) parts.push(`${key} %${Math.abs(p).toFixed(2)} hafif geri çekilme — kar realizasyonu.`);
    else if (p >= -1.5) parts.push(`${key} %${Math.abs(p).toFixed(2)} satış baskısında.`);
    else parts.push(`${key} %${Math.abs(p).toFixed(2)} sert düşüşte — risk-off gün, defansif hisseler öne çıkabilir.`);
    // Karşılaştırma: USD/TRY etkisi
    const usd = all.find((m) => m.key === 'USD/TRY');
    if (usd?.changePct != null && Number.isFinite(usd.changePct) && Math.abs(usd.changePct) >= 0.3) {
      parts.push(usd.changePct > 0 ? `Dolar %${usd.changePct.toFixed(2)} yukarı, TL değer kaybı ihracatçıları destekleyebilir.` : `Dolar %${Math.abs(usd.changePct).toFixed(2)} geri çekildi.`);
    }
  } else if (key === 'USD/TRY' || key === 'EUR/TRY') {
    const cur = key === 'USD/TRY' ? 'Dolar' : 'Euro';
    if (Math.abs(p) < 0.1) parts.push(`${cur}/TRY yatay — merkez bankası tarafında beklenti dengesi.`);
    else if (p >= 1) parts.push(`${cur} %${p.toFixed(2)} yukarı — TL üzerinde belirgin baskı, ithalat pahalaşıyor.`);
    else if (p >= 0.2) parts.push(`${cur} %${p.toFixed(2)} yukarı yönlü.`);
    else if (p >= -0.2) parts.push(`${cur}/TRY sınırlı hareket.`);
    else if (p >= -1) parts.push(`${cur} %${Math.abs(p).toFixed(2)} geri çekildi, TL değer kazanıyor.`);
    else parts.push(`${cur} %${Math.abs(p).toFixed(2)} sert düşüşte — TL güçlü performans.`);
  } else if (key === 'Gram Altın' || key === 'Ons Altın') {
    if (p >= 1) parts.push(`${key} %${p.toFixed(2)} artışla güvenli liman talebi belirgin.`);
    else if (p >= 0.3) parts.push(`${key} %${p.toFixed(2)} pozitif — ılımlı yükseliş.`);
    else if (p >= -0.3) parts.push(`${key} yatay seyir.`);
    else parts.push(`${key} %${Math.abs(p).toFixed(2)} geri çekildi — risk iştahı arttı.`);
    // FED / dolar bağıntısı
    const usd = all.find((m) => m.key === 'USD/TRY');
    if (usd?.changePct != null && Math.abs(usd.changePct) >= 0.3) {
      parts.push(usd.changePct > 0 ? 'Dolar da güçleniyor — çift yönlü prim.' : 'Dolar zayıflarken altın güçleniyor — klasik korelasyon.');
    }
  } else if ((key as string).endsWith('/USD')) {
    const coin = key.split('/')[0];
    if (Math.abs(p) < 0.3) parts.push(`${coin} yatay seyir — düşük volatilite.`);
    else if (p >= 3) parts.push(`${coin} %${p.toFixed(2)} güçlü ralli — risk iştahı çok yüksek.`);
    else if (p >= 1) parts.push(`${coin} %${p.toFixed(2)} yükselişte.`);
    else if (p >= 0) parts.push(`${coin} %${p.toFixed(2)} sınırlı pozitif.`);
    else if (p >= -1) parts.push(`${coin} %${Math.abs(p).toFixed(2)} hafif düşüş.`);
    else if (p >= -3) parts.push(`${coin} %${Math.abs(p).toFixed(2)} satış baskısı.`);
    else parts.push(`${coin} %${Math.abs(p).toFixed(2)} sert düşüş — risk-off panik olabilir.`);
    // Kripto piyasa geneli
    const btc = all.find((m) => m.key === 'BTC/USD');
    if (key !== 'BTC/USD' && btc?.changePct != null && Number.isFinite(btc.changePct)) {
      parts.push(btc.changePct > 0 ? `BTC de %${btc.changePct.toFixed(2)} yukarı — piyasa geneli pozitif.` : `BTC %${Math.abs(btc.changePct).toFixed(2)} negatif — genel satış modu.`);
    }
  } else if (key === 'Gram Gümüş' || key === 'Ons Gümüş') {
    if (p >= 1) parts.push(`${key} %${p.toFixed(2)} artışta — endüstriyel talep etkisi.`);
    else if (p >= -0.5) parts.push(`${key} yatay seyir.`);
    else parts.push(`${key} %${Math.abs(p).toFixed(2)} geri çekildi.`);
  } else {
    parts.push(`${primary.label} ${p >= 0 ? '+' : ''}${p.toFixed(2)}% ${p >= 0 ? 'pozitif' : 'negatif'} yönde.`);
  }

  return parts.slice(0, 2).join(' ');
}
