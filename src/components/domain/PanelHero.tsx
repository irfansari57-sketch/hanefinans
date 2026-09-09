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

type Period = '1H' | '1A' | '3A' | 'YTD';

interface Props {
  macro: MacroIndicator[];
  /** Ana grafik icin default sembol (BIST 100). Kullanici pill'e tiklayarak degistirebilir. */
  defaultSymbol?: string;
}

/** Kategorili grup + Varyant A kart tarzi (kullanici talebi 2026-09-09).
 *  Endekse VIOP 30 + XBANK, doviz'e GBP/TRY + EUR/USD, kripto'ya XRP + DOGE eklendi. */
const TICKER_GROUPS: Array<{ title: string; keys: string[] }> = [
  { title: 'ENDEKS', keys: ['BIST 100', 'BIST 30', 'VIOP 30', 'XBANK'] },
  { title: 'DÖVİZ',  keys: ['USD/TRY', 'EUR/TRY', 'GBP/TRY', 'EUR/USD'] },
  { title: 'METAL',  keys: ['Gram Altın', 'Ons Altın', 'Gram Gümüş', 'Ons Gümüş'] },
  { title: 'KRİPTO', keys: ['BTC/USD', 'ETH/USD', 'XRP/USD', 'DOGE/USD'] },
];

function formatValue(m: MacroIndicator): string {
  const key = m.key;
  // Endeks: BIST/VIOP/XBANK — binlik ayirici
  if (key === 'BIST 100' || key === 'BIST 30' || key === 'VIOP 30' || key === 'XBANK') {
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

export function PanelHero({ macro, defaultSymbol = 'BIST 100' }: Props) {
  const [primarySymbol, setPrimarySymbol] = useState<string>(defaultSymbol);
  const [period, setPeriod] = useState<Period>('YTD');
  const [series, setSeries] = useState<number[]>([]);
  const [seriesLoading, setSeriesLoading] = useState(false);

  const primary = useMemo(() => macro.find((m) => m.key === primarySymbol), [macro, primarySymbol]);

  useEffect(() => {
    let alive = true;
    setSeriesLoading(true);
    const ysym = toYahooSymbol(primarySymbol);
    fetchHistoricalYahoo(ysym, PERIOD_RANGE[period], '1d')
      .then((data) => {
        if (!alive) return;
        // HistoricalSeries.closes = {date, close}[] — sadece close degerlerini al.
        const closes = (data?.closes ?? [])
          .map((c) => c.close)
          .filter((v) => Number.isFinite(v) && v > 0);
        setSeries(closes);
      })
      .catch(() => setSeries([]))
      .finally(() => alive && setSeriesLoading(false));
    return () => { alive = false; };
  }, [primarySymbol, period]);

  return (
    <div className="rounded-xl border border-accent/25 bg-bg-card/40 p-4">
      {/* Ust ticker — Varyant B: 4 kategorili grup (Endeks/Doviz/Metal/Kripto).
          Kullanici talebi. Aktif satirda sol yesil seritli border. */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {TICKER_GROUPS.map((group) => (
          <div key={group.title} className="min-w-0">
            <div className="mb-1.5 pl-1 text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">
              {group.title}
            </div>
            <div className="flex flex-col gap-1">
              {group.keys.map((key) => {
                const m = macro.find((mm) => mm.key === key);
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
          <MiniAreaChart
            values={series}
            positive={(primary?.changePct ?? 0) >= 0}
            formatValue={(v) => {
              // Sembole gore uygun format
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
 * Kompakt SVG area chart — kapanis serisi. Y-axis label + grid + area.
 * Sag tarafta 3 seviyeli y-axis label (max / mid / min) — FVT tarzi deger satirlari.
 */
function MiniAreaChart({ values, positive, formatValue }: {
  values: number[];
  positive: boolean;
  formatValue?: (v: number) => string;
}) {
  const W = 620;
  const H = 140;
  const PAD_TOP = 8;
  const PAD_BOTTOM = 8;
  const PAD_RIGHT = 44; // y-axis label yeri
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mid = (min + max) / 2;
  const range = max - min || 1;
  const chartW = W - PAD_RIGHT;
  const xStep = chartW / Math.max(1, values.length - 1);
  const points = values.map((v, i) => ({
    x: i * xStep,
    y: PAD_TOP + (1 - (v - min) / range) * (H - PAD_TOP - PAD_BOTTOM),
  }));
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L ${points[points.length - 1].x.toFixed(1)} ${H} L 0 ${H} Z`;
  const stroke = positive ? '#22c55e' : '#ef4444';
  const fillId = positive ? 'panelHeroGradPos' : 'panelHeroGradNeg';
  const fmt = formatValue ?? ((v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 2 }));

  // 3 seviye y-axis: min, mid, max — sag tarafta yaslanmis
  const yLevels = [
    { v: max, y: PAD_TOP },
    { v: mid, y: (PAD_TOP + (H - PAD_BOTTOM)) / 2 },
    { v: min, y: H - PAD_BOTTOM },
  ];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-36 w-full">
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
          key={`t-${lv.y}`}
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
