import { useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink, RefreshCw, Activity, TrendingUp, TrendingDown, Info } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { LiveBadge } from '@/components/domain/LiveBadge';
import { PeriodReturns } from '@/components/domain/PeriodReturns';
import { fetchHistoricalYahoo, fetchIndexYahoo, computePeriodReturns, type PeriodReturns as PeriodReturnsT } from '@/data/api/yahoo';
import { fetchTrCds, type TrCdsData } from '@/data/api/trCds';
import { cn } from '@/lib/utils';

const LiveChart = lazy(() => import('@/components/domain/LiveChart').then((m) => ({ default: m.LiveChart })));

interface MacroMeta {
  label: string;
  category: 'ABD Endeksi' | 'Avrupa Endeksi' | 'Asya Endeksi' | 'Emtia' | 'Risk & Volatilite' | 'Faiz' | 'Türkiye Risk';
  unit?: string;
  description: string;
  /** Yahoo Finance dışında özel veri kaynağı kullanan semboller */
  custom?: 'tr-cds';
}

const META: Record<string, MacroMeta> = {
  // ABD Endeksleri
  '^GSPC': { label: 'S&P 500', category: 'ABD Endeksi', description: 'ABD’nin en büyük 500 halka açık şirketinin piyasa değeri ağırlıklı endeksi. Global risk iştahı barometresi.' },
  '^DJI':  { label: 'Dow Jones', category: 'ABD Endeksi', description: '30 büyük ABD sanayisi blue-chip şirketinin fiyat ağırlıklı endeksi.' },
  '^IXIC': { label: 'NASDAQ Composite', category: 'ABD Endeksi', description: 'NASDAQ borsasındaki ~3000 hissenin endeksi. Teknoloji ağırlıklı.' },
  '^RUT':  { label: 'Russell 2000', category: 'ABD Endeksi', description: 'ABD küçük sermayeli (small-cap) 2000 şirket. İç ekonomi sağlığı sinyali.' },
  // Avrupa
  '^GDAXI':    { label: 'DAX (Almanya)', category: 'Avrupa Endeksi', description: 'Frankfurt borsasında işlem gören 40 büyük Alman şirketi. Avrupa motoru.' },
  '^FTSE':     { label: 'FTSE 100 (İngiltere)', category: 'Avrupa Endeksi', description: 'Londra borsasının 100 en büyük şirketi. GBP ve emtia ağırlıklı.' },
  '^FCHI':     { label: 'CAC 40 (Fransa)', category: 'Avrupa Endeksi', description: 'Paris borsasının 40 büyük şirketi. Lüks tüketim ağırlıklı.' },
  '^STOXX50E': { label: 'Euro Stoxx 50', category: 'Avrupa Endeksi', description: 'Euro bölgesinin 50 lider şirketi — pan-Avrupa blue-chip.' },
  // Asya
  '^N225':     { label: 'Nikkei 225 (Japonya)', category: 'Asya Endeksi', description: 'Tokyo borsasının 225 büyük şirketi. JPY oynaklığına hassas.' },
  '^HSI':      { label: 'Hang Seng (Hong Kong)', category: 'Asya Endeksi', description: 'Hong Kong borsası — Çin teması ve emerging market göstergesi.' },
  '000001.SS': { label: 'Shanghai Composite', category: 'Asya Endeksi', description: 'Shanghai borsasındaki tüm A-share ve B-share hisseler.' },
  '^AXJO':     { label: 'ASX 200 (Avustralya)', category: 'Asya Endeksi', description: 'Avustralya’nın en büyük 200 şirketi. Emtia ve madencilik ağırlıklı.' },
  // Emtia
  'BZ=F': { label: 'Brent Petrol', category: 'Emtia', unit: '$/varil', description: 'ICE Brent Vadeli (Kuzey Denizi). Avrupa ham petrol benchmark’ı.' },
  'CL=F': { label: 'WTI Petrol', category: 'Emtia', unit: '$/varil', description: 'NYMEX WTI Vadeli. ABD ham petrol benchmark’ı.' },
  'GC=F': { label: 'Altın (ons)', category: 'Emtia', unit: '$/ons', description: 'COMEX Altın Vadeli Kontratı. Güvenli liman varlığı.' },
  'SI=F': { label: 'Gümüş (ons)', category: 'Emtia', unit: '$/ons', description: 'COMEX Gümüş Vadeli. Altın korelasyonlu, daha volatil.' },
  'NG=F': { label: 'Doğal Gaz', category: 'Emtia', unit: '$/MMBtu', description: 'Henry Hub Doğal Gaz Vadeli. ABD doğal gaz benchmark.' },
  'HG=F': { label: 'Bakır', category: 'Emtia', unit: '$/lb', description: 'COMEX Bakır Vadeli. Küresel sanayi sağlığı göstergesi (“Dr. Copper”).' },
  // Risk & Volatilite & Faiz
  '^VIX':     { label: 'VIX', category: 'Risk & Volatilite', description: 'CBOE Volatility Index — S&P 500 30-gün öngörü volatilitesi. “Korku Endeksi.” Genelde 12-20 normal, 30+ panik.' },
  'DX-Y.NYB': { label: 'DXY (Dolar Endeksi)', category: 'Risk & Volatilite', description: 'USD’nin 6 ana para birimine (EUR, JPY, GBP, CAD, SEK, CHF) karşı ağırlıklı gücü.' },
  '^MOVE':    { label: 'MOVE Index', category: 'Risk & Volatilite', description: 'ICE BofA tahvil volatilite endeksi. ABD Treasury opsiyon volatilitesi — faiz piyasası korkusu.' },
  '^TNX':     { label: 'ABD 10Y Faiz', category: 'Faiz', unit: '%', description: 'ABD 10 Yıllık Hazine Tahvili Faizi (yıllık %). Küresel risksiz faiz benchmark, yükselişi gelişen piyasaları (EM) baskılar.' },
  '^TYX':     { label: 'ABD 30Y Faiz', category: 'Faiz', unit: '%', description: 'ABD 30 Yıllık Hazine Tahvili Faizi (yıllık %). Uzun vade enflasyon beklentisi.' },
  '^FVX':     { label: 'ABD 5Y Faiz', category: 'Faiz', unit: '%', description: 'ABD 5 Yıllık Hazine Tahvili Faizi (yıllık %).' },
  // Türkiye Risk (özel kaynak)
  'TR-CDS-5Y': {
    label: 'Türkiye 5Y CDS Spread',
    category: 'Türkiye Risk',
    unit: 'bps',
    custom: 'tr-cds',
    description: 'Türkiye 5 yıllık Credit Default Swap spread (baz puan, bps). Türkiye’nin temerrüt riskini sigortalama maliyeti — yabancı sermaye akışının ve TL bono getirilerinin temel belirleyicisi. CDS yükselmesi risk algısı artıyor demektir.',
  },
};

const categoryTone: Record<MacroMeta['category'], { bg: string; text: string }> = {
  'ABD Endeksi':       { bg: 'bg-accent/15', text: 'text-accent' },
  'Avrupa Endeksi':    { bg: 'bg-accent/15', text: 'text-accent' },
  'Asya Endeksi':      { bg: 'bg-accent/15', text: 'text-accent' },
  'Emtia':             { bg: 'bg-warning/15', text: 'text-warning' },
  'Risk & Volatilite': { bg: 'bg-danger/15',  text: 'text-danger' },
  'Faiz':              { bg: 'bg-danger/15',  text: 'text-danger' },
  'Türkiye Risk':      { bg: 'bg-danger/15',  text: 'text-danger' },
};

export function MacroDetailPage() {
  const { symbol = '' } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const ySym = decodeURIComponent(symbol);
  const meta = META[ySym];
  const isCustom = meta?.custom === 'tr-cds';

  const [spot, setSpot] = useState<{ value: number; changePct: number } | null>(null);
  const [returns, setReturns] = useState<PeriodReturnsT>({});
  const [trCdsData, setTrCdsData] = useState<TrCdsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | undefined>();

  const refresh = async () => {
    if (!meta) return;
    setLoading(true);
    try {
      if (isCustom) {
        // TR CDS — Pages Function üzerinden
        const data = await fetchTrCds(true);
        setTrCdsData(data);
        if (data && data.ok && data.value != null) {
          setSpot({ value: data.value, changePct: data.changePct ?? 0 });
        }
        // History'den period returns hesapla
        if (data?.history && data.history.length > 1) {
          const closes = data.history.map((h) => ({
            date: new Date(h.date).getTime(),
            close: h.value,
          }));
          setReturns(computePeriodReturns(closes));
        }
      } else {
        // Yahoo
        const [spotR, hist1d] = await Promise.all([
          fetchIndexYahoo(ySym),
          fetchHistoricalYahoo(ySym, '1y', '1d', { bistSuffix: false }),
        ]);
        setSpot(spotR);
        if (hist1d) setReturns(computePeriodReturns(hist1d.closes));
      }
      setUpdatedAt(Date.now());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ySym]);

  const formatted = useMemo(() => {
    if (spot?.value == null) return '—';
    const v = spot.value;
    return v.toLocaleString('en-US', {
      maximumFractionDigits: v < 10 ? 4 : v < 1000 ? 2 : 0,
    });
  }, [spot]);

  if (!meta) {
    return (
      <>
        <button onClick={() => navigate(-1)} className="btn-ghost mb-3">
          <ArrowLeft size={14} /> Geri
        </button>
        <EmptyState icon={<Activity size={28} />} title="Gösterge bulunamadı" description={`"${ySym}" desteklenmiyor.`} />
      </>
    );
  }

  const change = spot?.changePct ?? 0;
  // TR CDS için: CDS düşmesi olumlu (risk priminin düşmesi)
  const isImprovement = isCustom ? change <= 0 : change >= 0;
  const tone = isImprovement ? 'text-success' : 'text-danger';
  const sign = change >= 0 ? '+' : '';
  const Icon = (isCustom ? change <= 0 : change >= 0) ? TrendingDown : TrendingUp;
  // Aslında yukarıdaki Icon mantığı karışık — sadeleştir:
  const arrowDown = change < 0;
  const arrowIcon = arrowDown ? TrendingDown : TrendingUp;
  const ArrowIcon = arrowIcon;
  const tcat = categoryTone[meta.category];

  return (
    <>
      <PageHeader
        title={meta.label}
        subtitle={`${meta.category} — ${ySym}`}
      />
      <div className="mb-4 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="btn-ghost">
          <ArrowLeft size={14} /> Geri
        </button>
        <div className="flex items-center gap-2">
          <LiveBadge updatedAt={updatedAt} refreshing={loading} />
          <button className="btn-secondary" onClick={refresh} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Yenile
          </button>
        </div>
      </div>

      {/* Hero */}
      <div className="card relative mb-4 overflow-hidden p-6">
        <div className={cn('pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full blur-3xl',
          meta.category === 'Emtia' ? 'bg-warning/10' :
          meta.category === 'Risk & Volatilite' || meta.category === 'Faiz' || meta.category === 'Türkiye Risk' ? 'bg-danger/10' :
          'bg-accent/10')} />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('grid h-10 w-10 place-items-center rounded-lg', tcat.bg, tcat.text)}>
                <Activity size={20} />
              </span>
              <h1 className="font-mono text-2xl font-bold tracking-tight text-slate-100">{meta.label}</h1>
              <span className="rounded-md border border-border bg-bg-soft px-2 py-0.5 text-xs text-slate-300">{meta.category}</span>
              <span className="rounded-md bg-bg-soft px-2 py-0.5 text-xs font-mono text-slate-400">{ySym}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold tabular-nums text-slate-100">
              {meta.unit?.startsWith('$') ? '$' : ''}{formatted}{meta.unit === '%' ? '%' : ''}
              {meta.unit === 'bps' && <span className="ml-1 text-sm font-medium text-slate-500">bps</span>}
            </div>
            {meta.unit && meta.unit !== '%' && meta.unit !== 'bps' && (
              <div className="text-[10px] text-slate-500">{meta.unit}</div>
            )}
            <div className={cn('mt-1 flex items-center justify-end gap-1 text-lg font-semibold tabular-nums', tone)}>
              <ArrowIcon size={14} />
              {sign}{change.toFixed(2)}%
              {isCustom && trCdsData?.changeAbs != null && (
                <span className="ml-1 text-xs text-slate-400">({trCdsData.changeAbs >= 0 ? '+' : ''}{trCdsData.changeAbs.toFixed(1)} bps)</span>
              )}
            </div>
            {isCustom && trCdsData?.asOfDate && (
              <div className="text-[10px] text-slate-500">son veri: {trCdsData.asOfDate}</div>
            )}
          </div>
        </div>

        {/* Info paragraph */}
        <div className="relative mt-4 flex items-start gap-2 rounded-lg border border-border bg-bg-soft p-3 text-[12px] leading-relaxed text-slate-300">
          <Info size={14} className="mt-0.5 flex-shrink-0 text-accent" />
          <p>{meta.description}</p>
        </div>

        <div className="relative mt-5">
          <PeriodReturns returns={returns} />
        </div>
      </div>

      {/* Chart */}
      <div className="card mb-4 overflow-hidden p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-300">
          {isCustom ? 'Tarihsel Grafik' : 'Canlı Grafik'}
          <span className="text-slate-500"> ({isCustom ? 'worldgovernmentbonds.com' : 'Yahoo Finance + lightweight-charts'})</span>
        </h2>

        {isCustom ? (
          <TrCdsHistoryChart data={trCdsData} />
        ) : (
          <Suspense fallback={<Skeleton variant="rect" className="w-full" height={460} />}>
            <LiveChart symbol={ySym} height={460} bistSuffix={false} />
          </Suspense>
        )}
      </div>

      {/* External Links */}
      <div className="card p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-200">Dış Kaynaklar</h3>
        {isCustom ? (
          <div className="grid gap-2 sm:grid-cols-3">
            <a
              href="http://www.worldgovernmentbonds.com/cds-historical-data/turkey/5-years/"
              target="_blank" rel="noreferrer"
              className="flex items-center justify-between rounded-lg border border-border bg-bg-card px-3 py-2 text-xs text-slate-300 hover:border-accent/40 hover:text-accent"
            >
              <span>worldgovernmentbonds.com</span><ExternalLink size={11} />
            </a>
            <a
              href="https://www.investing.com/rates-bonds/turkey-cds-5-yr-usd"
              target="_blank" rel="noreferrer"
              className="flex items-center justify-between rounded-lg border border-border bg-bg-card px-3 py-2 text-xs text-slate-300 hover:border-accent/40 hover:text-accent"
            >
              <span>Investing.com</span><ExternalLink size={11} />
            </a>
            <a
              href="https://www.investing.com/rates-bonds/turkey-10-year-bond-yield"
              target="_blank" rel="noreferrer"
              className="flex items-center justify-between rounded-lg border border-border bg-bg-card px-3 py-2 text-xs text-slate-300 hover:border-accent/40 hover:text-accent"
            >
              <span>Türkiye 10Y Tahvil</span><ExternalLink size={11} />
            </a>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-3">
            <a
              href={`https://finance.yahoo.com/quote/${encodeURIComponent(ySym)}`}
              target="_blank" rel="noreferrer"
              className="flex items-center justify-between rounded-lg border border-border bg-bg-card px-3 py-2 text-xs text-slate-300 hover:border-accent/40 hover:text-accent"
            >
              <span>Yahoo Finance</span><ExternalLink size={11} />
            </a>
            <a
              href={`https://www.tradingview.com/symbols/${encodeURIComponent(ySym.replace(/[\^=]/g, ''))}/`}
              target="_blank" rel="noreferrer"
              className="flex items-center justify-between rounded-lg border border-border bg-bg-card px-3 py-2 text-xs text-slate-300 hover:border-accent/40 hover:text-accent"
            >
              <span>TradingView</span><ExternalLink size={11} />
            </a>
            <a
              href={`https://www.investing.com/search/?q=${encodeURIComponent(meta.label)}`}
              target="_blank" rel="noreferrer"
              className="flex items-center justify-between rounded-lg border border-border bg-bg-card px-3 py-2 text-xs text-slate-300 hover:border-accent/40 hover:text-accent"
            >
              <span>Investing.com</span><ExternalLink size={11} />
            </a>
          </div>
        )}
      </div>
    </>
  );
}

/**
 * TR CDS history için inline SVG area chart. Lightweight-charts'a gerek yok —
 * 365 nokta basit polyline ile yeterince hızlı.
 */
function TrCdsHistoryChart({ data }: { data: TrCdsData | null }) {
  if (!data) {
    return <Skeleton variant="rect" className="w-full" height={300} />;
  }
  if (!data.ok || !data.history || data.history.length < 2) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-lg border border-warning/30 bg-warning/5 text-sm text-warning">
        <Info size={16} className="mr-2" />
        {data.error ?? 'Tarihçi veri henüz yok'}
      </div>
    );
  }

  const points = data.history;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 800;
  const H = 300;
  const PAD = 36;

  const xStep = (W - 2 * PAD) / (points.length - 1);
  const norm = (v: number) => H - PAD - ((v - min) / range) * (H - 2 * PAD);

  const pathPts = points.map((p, i) => `${PAD + i * xStep},${norm(p.value)}`);
  const linePath = `M ${pathPts.join(' L ')}`;
  const areaPath = `M ${PAD},${H - PAD} L ${pathPts.join(' L ')} L ${PAD + (points.length - 1) * xStep},${H - PAD} Z`;

  // 4 y-grid line
  const yTicks = [0.0, 0.25, 0.5, 0.75, 1.0].map((t) => ({
    y: H - PAD - t * (H - 2 * PAD),
    label: (min + t * range).toFixed(0),
  }));

  const first = points[0];
  const last = points[points.length - 1];
  const delta = last.value - first.value;
  const deltaPct = (delta / first.value) * 100;
  const up = delta >= 0;
  const stroke = up ? '#ef4444' : '#22c55e';
  const fill   = up ? 'rgba(239, 68, 68, 0.12)' : 'rgba(34, 197, 94, 0.12)';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{first.date} ({first.value.toFixed(1)} bps)</span>
        <span className={cn('font-medium tabular-nums', up ? 'text-danger' : 'text-success')}>
          {up ? '+' : ''}{delta.toFixed(1)} bps · {up ? '+' : ''}{deltaPct.toFixed(1)}% (dönem)
        </span>
        <span>{last.date} ({last.value.toFixed(1)} bps)</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" role="img">
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD} x2={W - PAD} y1={t.y} y2={t.y} stroke="#1f2a44" strokeWidth="0.5" />
            <text x={PAD - 6} y={t.y + 3} textAnchor="end" fontSize="9" fill="#64748b">{t.label}</text>
          </g>
        ))}
        <path d={areaPath} fill={fill} />
        <path d={linePath} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      <div className="text-[10px] text-slate-500">
        {points.length} günlük tarihçi · Kaynak: worldgovernmentbonds.com · Edge cache 30 dk
      </div>
    </div>
  );
}
