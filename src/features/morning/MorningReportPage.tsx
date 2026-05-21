import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Sun, Download, Send, RefreshCw, Bitcoin, TrendingUp, Globe2, Target,
  Flame, AlertTriangle, Check, Zap, Newspaper, Activity, Coins, CircleDollarSign,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { LiveBadge } from '@/components/domain/LiveBadge';
import { fetchMajorCryptos, fetchGlobal, fetchTopAltcoinMovers, fetchCryptoOhlc, type CryptoPrice, type CryptoMarketGlobal, type AltcoinMover } from '@/data/api/coingecko';
import { fetchFearGreed, fearGreedTone, type FearGreedSnapshot } from '@/data/api/feargreed';
import { fetchIndexYahoo, fetchHistoricalYahoo, YAHOO_SYMBOLS } from '@/data/api/yahoo';
import { loadStocks, loadMacroAll, clearServiceCaches, loadNews } from '@/data/services';
import { sendTelegramMessage, isTelegramConfigured } from '@/data/api/telegram';
import { rankMomentum, assessTradingConditions } from '@/lib/momentum';
import { rsi, macd, bollinger, adx, ema, sma, rsiSignal, bollingerLabel, adxLabel, supportResistance, type OHLC } from '@/lib/indicators';
import { analyzeTimeframe, aggregateTo4h, computeBigPlayerLean, buildVerdict, type MultiTimeframeResult, type TimeframeAnalysis } from '@/lib/multiTimeframe';
import { useAuth, isAdmin, isPro } from '@/store/auth';
import { AdBanner } from '@/components/domain/AdBanner';
import { generateMarkdownReport, downloadMarkdown } from '@/lib/reportGenerator';
import { MOCK_STOCKS, MOCK_MACRO_FALLBACK } from '@/data/mock';
import type { Stock, MacroIndicator, NewsItem } from '@/data/types';
import { cn } from '@/lib/utils';
import { formatMoney, formatCompact } from '@/lib/format';
import { SymbolBadge } from '@/components/domain/SymbolBadge';
import { AnalystCommentary } from '@/components/domain/AnalystCommentary';
import { Link } from 'react-router-dom';
import { macroKeyToRoute } from '@/lib/macroRoutes';

const STORAGE_LAST_SENT = 'fa.morning.lastSent';

interface CryptoTA {
  symbol: string;
  name: string;
  priceUsd: number;
  change24h: number;
  rangeLow: number;
  rangeHigh: number;
  rsi: number;
  rsiNote: string;
  macdBullish: boolean;
  macdBearish: boolean;
  bollingerLabel: string;
  adxLabel: string;
  adxBullish?: boolean;
  resistance: number;
  support: number;
  resistancePct: number;
  supportPct: number;
}

interface BistTA {
  stock: Stock;
  rsi?: number;
  rsiNote?: string;
}

interface IndexTA {
  symbol: string;
  label: string;
  price: number;
  changePct: number;
  rsi?: number;
  rsiNote?: string;
  macdBullish: boolean;
  macdBearish: boolean;
  resistance?: number;
  support?: number;
  resistancePct?: number;
  supportPct?: number;
  bollingerLabel: string;
  adxLabel: string;
  trend: 'yukarı' | 'aşağı' | 'yatay';
  verdict: string;
  emas?: { period: number; value: number; abovePct: number }[]; // fiyatın EMA'ya göre konumu (%)
  ma8?: number; // Günlük SMA8 fiyatı
}

export function MorningReportPage() {
  const [cryptos, setCryptos] = useState<CryptoPrice[]>([]);
  const [globalCrypto, setGlobalCrypto] = useState<CryptoMarketGlobal | null>(null);
  const [fearGreed, setFearGreed] = useState<FearGreedSnapshot | null>(null);
  const [topAltcoins, setTopAltcoins] = useState<AltcoinMover[]>([]);
  const [cryptoTA, setCryptoTA] = useState<CryptoTA[]>([]);
  const [stocks, setStocks] = useState<Stock[]>(MOCK_STOCKS);
  const [macros, setMacros] = useState<MacroIndicator[]>(MOCK_MACRO_FALLBACK);
  const [futures, setFutures] = useState<Array<{ label: string; value: number; changePct: number }>>([]);
  const [topGainersTA, setTopGainersTA] = useState<BistTA[]>([]);
  const [indexTA, setIndexTA] = useState<IndexTA[]>([]);
  const [mtResults, setMtResults] = useState<MultiTimeframeResult[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | undefined>();
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const user = useAuth((s) => s.user);
  const admin = isAdmin(user);
  const proUser = isPro(user);

  const allSymbols = useMemo(() => MOCK_STOCKS.map((s) => s.symbol), []);

  const refresh = useCallback(async (force = false) => {
    if (force) clearServiceCaches();
    setLoading(true);
    try {
      const [
        cryptoR, globalR, fgR, altR, stocksR, macrosR, newsR,
        sp, nq, dow,
        btcOhlc, ethOhlc, bnbOhlc,
      ] = await Promise.all([
        fetchMajorCryptos(),
        fetchGlobal(),
        fetchFearGreed(),
        fetchTopAltcoinMovers(50),
        loadStocks(allSymbols),
        loadMacroAll(),
        loadNews({ max: 12 }),
        fetchIndexYahoo(YAHOO_SYMBOLS.sp500Futures),
        fetchIndexYahoo(YAHOO_SYMBOLS.nasdaqFutures),
        fetchIndexYahoo(YAHOO_SYMBOLS.dowFutures),
        fetchCryptoOhlc('bitcoin', 30),
        fetchCryptoOhlc('ethereum', 30),
        fetchCryptoOhlc('binancecoin', 30),
      ]);
      setCryptos(cryptoR);
      setGlobalCrypto(globalR);
      setFearGreed(fgR);
      setTopAltcoins(altR);
      setStocks(stocksR.data);
      setMacros(macrosR.data);
      setNews(newsR.data);

      const fut: typeof futures = [];
      if (sp) fut.push({ label: 'S&P 500 Futures (ES)', value: sp.value, changePct: sp.changePct });
      if (nq) fut.push({ label: 'NASDAQ Futures (NQ)', value: nq.value, changePct: nq.changePct });
      if (dow) fut.push({ label: 'Dow Futures (YM)', value: dow.value, changePct: dow.changePct });
      setFutures(fut);

      // Per-coin teknik analiz
      const taList: CryptoTA[] = [];
      const ohlcMap: Record<string, typeof btcOhlc> = { BTC: btcOhlc, ETH: ethOhlc, BNB: bnbOhlc };
      for (const c of cryptoR.slice(0, 3)) {
        const o = ohlcMap[c.symbol] ?? [];
        if (o.length < 25) continue;
        const closes = o.map((b) => b.close);
        const bars: OHLC[] = o.map((b) => ({ open: b.open, high: b.high, low: b.low, close: b.close }));
        const lastRsi = rsi(closes, 14).at(-1) ?? NaN;
        const macdR = macd(closes);
        const boll = bollinger(closes);
        const adxR = adx(bars);
        const sr = supportResistance(bars, 30);
        const last24 = o.slice(-2);
        const dayRange = {
          low: Math.min(...last24.map((b) => b.low)),
          high: Math.max(...last24.map((b) => b.high)),
        };
        const cur = c.usd;
        taList.push({
          symbol: c.symbol,
          name: c.name,
          priceUsd: cur,
          change24h: c.change24h,
          rangeLow: dayRange.low,
          rangeHigh: dayRange.high,
          rsi: lastRsi,
          rsiNote: rsiSignal(lastRsi),
          macdBullish: macdR.recentBullishCross,
          macdBearish: macdR.recentBearishCross,
          bollingerLabel: bollingerLabel(boll.position),
          adxLabel: adxLabel(adxR.lastTrendStrength),
          adxBullish: adxR.bullishBias,
          resistance: sr.resistance,
          support: sr.support,
          resistancePct: ((sr.resistance - cur) / cur) * 100,
          supportPct: ((cur - sr.support) / cur) * 100,
        });
      }
      setCryptoTA(taList);

      // BIST 100 ve BIST 30 için tam teknik analiz
      const indexConfigs = [
        { ySym: 'XU100.IS', symbol: 'BIST 100', label: 'BIST 100', macroKey: 'BIST 100' },
        { ySym: 'XU030.IS', symbol: 'BIST 30',  label: 'BIST 30',  macroKey: 'BIST 30' },
      ];
      const indexResults: IndexTA[] = await Promise.all(
        indexConfigs.map(async ({ ySym, symbol, label, macroKey }) => {
          const hist = await fetchHistoricalYahoo(ySym, '6mo', '1d');
          const macroEntry = macrosR.data.find((m) => m.key === macroKey);
          const lastClose = hist?.bars.at(-1)?.close ?? 0;
          // Spot fiyat varsa macro'dan, yoksa son kapanıştan
          const price = macroEntry?.value ?? lastClose;
          // Değişim: macro'da varsa onu kullan, yoksa son 2 kapanış arası hesapla
          let changePct = macroEntry?.changePct ?? 0;
          if ((!macroEntry || !Number.isFinite(macroEntry.changePct)) && hist && hist.bars.length >= 2) {
            const prev = hist.bars[hist.bars.length - 2].close;
            changePct = ((lastClose - prev) / prev) * 100;
          }
          if (!hist || hist.bars.length < 25) {
            return {
              symbol, label, price, changePct,
              macdBullish: false, macdBearish: false,
              bollingerLabel: '—', adxLabel: '—',
              trend: 'yatay' as const,
              verdict: 'Yeterli tarihsel veri yok.',
            };
          }
          const closes = hist.bars.map((b) => b.close);
          const bars: OHLC[] = hist.bars.map((b) => ({ open: b.open, high: b.high, low: b.low, close: b.close }));
          const r = rsi(closes, 14).at(-1);
          const macdR = macd(closes);
          const boll = bollinger(closes);
          const adxR = adx(bars);
          const sr = supportResistance(bars, 90);
          const cur = price || closes[closes.length - 1];

          // EMA pozisyonları
          const emaPeriods = [5, 8, 13, 21, 55, 200];
          const emas = emaPeriods
            .map((p) => {
              const v = ema(closes, p).at(-1);
              if (!Number.isFinite(v)) return null;
              return { period: p, value: v as number, abovePct: ((cur - (v as number)) / (v as number)) * 100 };
            })
            .filter((x): x is { period: number; value: number; abovePct: number } => x !== null);
          const ma8Val = sma(closes, 8).at(-1);
          const ma8 = Number.isFinite(ma8Val) ? (ma8Val as number) : undefined;

          // Yön belirle
          let trend: 'yukarı' | 'aşağı' | 'yatay' = 'yatay';
          if ((r ?? 50) > 55 && (macdR.macd.at(-1) ?? 0) > (macdR.signal.at(-1) ?? 0)) trend = 'yukarı';
          else if ((r ?? 50) < 45 && (macdR.macd.at(-1) ?? 0) < (macdR.signal.at(-1) ?? 0)) trend = 'aşağı';

          // Verdict (kısa yön yorumu)
          const vparts: string[] = [];
          if (trend === 'yukarı') vparts.push('Kısa vadeli yön YUKARI yönlü.');
          else if (trend === 'aşağı') vparts.push('Kısa vadeli yön AŞAĞI yönlü.');
          else vparts.push('Trend YATAY/kararsız.');

          if (r != null) {
            if (r >= 70) vparts.push('RSI aşırı alım — geri çekilme riski yüksek.');
            else if (r <= 30) vparts.push('RSI aşırı satım — toparlanma potansiyeli.');
            else if (r >= 55) vparts.push('Alım momentumu güçlü.');
            else if (r <= 45) vparts.push('Satış baskısı sürüyor.');
          }
          if (macdR.recentBullishCross) vparts.push('MACD bullish kesişim verdi.');
          if (macdR.recentBearishCross) vparts.push('MACD bearish kesişim verdi.');

          const resistancePct = ((sr.resistance - cur) / cur) * 100;
          const supportPct = ((cur - sr.support) / cur) * 100;
          if (resistancePct > 0 && resistancePct < 2) vparts.push(`Direnç ${sr.resistance.toFixed(0)} çok yakın — kırılırsa hızlanır.`);
          if (supportPct > 0 && supportPct < 2) vparts.push(`Destek ${sr.support.toFixed(0)} yakın — bu seviye kritik.`);

          return {
            symbol, label, price, changePct,
            rsi: r ?? undefined,
            rsiNote: r != null ? rsiSignal(r) : undefined,
            macdBullish: macdR.recentBullishCross,
            macdBearish: macdR.recentBearishCross,
            resistance: sr.resistance,
            support: sr.support,
            resistancePct,
            supportPct,
            bollingerLabel: bollingerLabel(boll.position),
            adxLabel: adxLabel(adxR.lastTrendStrength),
            trend,
            verdict: vparts.join(' '),
            emas,
            ma8,
          };
        }),
      );
      setIndexTA(indexResults);

      // ============= Multi-Timeframe Analizi (1h, 4h, 1d) =============
      const mtSymbols = [
        { ySym: 'XU100.IS', label: 'BIST 100', macroKey: 'BIST 100' },
        { ySym: 'XU030.IS', label: 'BIST 30', macroKey: 'BIST 30' },
        { ySym: 'SI=F',     label: 'Ons Gümüş', macroKey: 'Ons Gümüş' },
        { ySym: 'GC=F',     label: 'Ons Altın', macroKey: 'Ons Altın' },
      ];
      const mtComputed = await Promise.all(
        mtSymbols.map(async ({ ySym, label, macroKey }) => {
          const [hist1h, hist1d] = await Promise.all([
            fetchHistoricalYahoo(ySym, '1mo', '60m'),
            fetchHistoricalYahoo(ySym, '1y', '1d'),
          ]);
          const macroEntry = macrosR.data.find((m) => m.key === macroKey);
          const lastClose1d = hist1d?.bars.at(-1)?.close ?? 0;
          const price = macroEntry?.value ?? lastClose1d;
          let changePct = macroEntry?.changePct ?? 0;
          if (!macroEntry && hist1d && hist1d.bars.length >= 2) {
            const prev = hist1d.bars[hist1d.bars.length - 2].close;
            changePct = ((lastClose1d - prev) / prev) * 100;
          }

          // 1h trend
          let tf1h: TimeframeAnalysis | null = null;
          if (hist1h && hist1h.bars.length > 0) {
            const closes1h = hist1h.bars.map((b) => b.close);
            tf1h = analyzeTimeframe(closes1h, [5, 8, 13, 21, 55]);
          }
          // 4h trend (1h barlardan üret)
          let tf4h: TimeframeAnalysis | null = null;
          if (hist1h && hist1h.bars.length > 0) {
            const bars4h = aggregateTo4h(hist1h.bars);
            const closes4h = bars4h.map((b) => b.close);
            tf4h = analyzeTimeframe(closes4h, [5, 8, 13, 21]);
          }
          // 1d trend
          let tf1d: TimeframeAnalysis | null = null;
          let bigPlayerLean: 'alıcı' | 'satıcı' | 'kararsız' = 'kararsız';
          if (hist1d && hist1d.bars.length > 0) {
            const closes1d = hist1d.bars.map((b) => b.close);
            tf1d = analyzeTimeframe(closes1d, [5, 8, 13, 21, 55, 200]);
            const ohlcBars: OHLC[] = hist1d.bars.map((b) => ({ open: b.open, high: b.high, low: b.low, close: b.close }));
            bigPlayerLean = computeBigPlayerLean(ohlcBars);
          }

          const base: Omit<MultiTimeframeResult, 'verdict'> = {
            symbol: label,
            label,
            price,
            changePct,
            tf1h,
            tf4h,
            tf1d,
            bigPlayerLean,
          };
          return { ...base, verdict: buildVerdict(base) };
        }),
      );
      setMtResults(mtComputed);

      // BIST Top Gainers RSI hesabı
      const topG = [...stocksR.data].sort((a, b) => b.changePct - a.changePct).slice(0, 10);
      const gainerTA: BistTA[] = await Promise.all(
        topG.map(async (s) => {
          const hist = await fetchHistoricalYahoo(s.symbol, '3mo', '1d');
          if (!hist || hist.bars.length < 20) return { stock: s };
          const closes = hist.bars.map((b) => b.close);
          const r = rsi(closes, 14).at(-1);
          return {
            stock: s,
            rsi: Number.isFinite(r as number) ? (r as number) : undefined,
            rsiNote: Number.isFinite(r as number) ? rsiSignal(r as number) : undefined,
          };
        }),
      );
      setTopGainersTA(gainerTA);

      setUpdatedAt(Date.now());
    } finally {
      setLoading(false);
    }
  }, [allSymbols]);

  useEffect(() => {
    refresh(true);
  }, [refresh]);

  const conditions = assessTradingConditions(macros);
  const momentumStocks = rankMomentum(stocks, 10);

  const onDownload = () => {
    const md = generateMarkdownReport({
      date: new Date(),
      cryptos,
      globalCrypto,
      fearGreed,
      topAltcoins,
      macros,
      futures,
      bist: stocks,
      momentumStocks,
      trConditions: conditions,
    });
    const datestr = new Date().toISOString().slice(0, 10);
    downloadMarkdown(`piyasa-raporu-${datestr}.md`, md);
  };

  const onTelegramSend = async () => {
    setSending(true);
    setSendResult(null);
    const text = buildTelegramText({ cryptoTA, stocks, macros, futures, fearGreed, conditions, topGainersTA });
    const res = await sendTelegramMessage(text, { parseMode: 'Markdown' });
    setSendResult({
      ok: res.ok,
      msg: res.ok ? 'Telegram\'a gönderildi ✓' : (res.error ?? 'Hata'),
    });
    if (res.ok) {
      try { localStorage.setItem(STORAGE_LAST_SENT, new Date().toISOString().slice(0, 10)); } catch {}
    }
    setSending(false);
    setTimeout(() => setSendResult(null), 5000);
  };

  const todayStr = new Date().toISOString().slice(0, 10);
  const lastSent = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_LAST_SENT) : null;
  const alreadySentToday = lastSent === todayStr;

  // Quick summary table (resmin ÖZET kısmı)
  const usdTry = macros.find((m) => m.key === 'USD/TRY');
  const eurTry = macros.find((m) => m.key === 'EUR/TRY');
  const bist100 = macros.find((m) => m.key === 'BIST 100');
  const gold = macros.find((m) => m.key === 'Gram Altın');
  const silver = macros.find((m) => m.key === 'Gram Gümüş');
  const silverOz = macros.find((m) => m.key === 'Ons Gümüş');
  const platinum = macros.find((m) => m.key === 'Gram Platin');
  const brent = macros.find((m) => m.key === 'Brent');
  const vix = macros.find((m) => m.key === 'VIX');
  const bist100TA = indexTA.find((t) => t.symbol === 'BIST 100');

  return (
    <>
      <PageHeader
        title="Günlük Analiz"
        subtitle={`${new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', weekday: 'long' })} • ${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <LiveBadge updatedAt={updatedAt} refreshing={loading} />
            <button className="btn-secondary" onClick={() => refresh(true)} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Yenile
            </button>
            {admin && (
              <>
                <button className="btn-secondary" onClick={onDownload}>
                  <Download size={14} /> .md İndir
                </button>
                <button
                  className={cn('btn-primary', alreadySentToday && 'opacity-80')}
                  onClick={onTelegramSend}
                  disabled={sending || !isTelegramConfigured()}
                >
                  <Send size={14} /> {sending ? 'Gönderiliyor…' : alreadySentToday ? 'Bugün gönderildi' : 'Telegram\'a Yolla'}
                </button>
              </>
            )}
          </div>
        }
      />

      {sendResult && (
        <div className={cn(
          'mb-4 rounded-lg border px-3 py-2 text-sm',
          sendResult.ok ? 'border-success/30 bg-success/10 text-success' : 'border-danger/30 bg-danger/10 text-danger',
        )}>
          {sendResult.msg}
        </div>
      )}

      {/* Reklam banner — PRO/ELITE'de gizli */}
      {!proUser && <AdBanner className="mb-5" />}

      {/* ============ KISA PİYASA ANALİZİ — Multi-Timeframe Long/Short ============ */}
      <section className="glass-card mb-5 p-5">
        <SectionHeader icon={Zap} title="Kısa Piyasa Analizi" tone="accent" />
        <p className="mt-1 ml-13 text-xs text-slate-400">
          BIST 100, BIST 30, USD/TRY ve Altın için <strong>1 saatlik, 4 saatlik ve günlük</strong> trend yönü + büyük oyuncu eğilimi.
        </p>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {mtResults.length === 0 ? (
            <div className="lg:col-span-2 rounded-lg border border-border bg-bg-card p-4 text-xs text-slate-500">
              {loading ? 'Çoklu zaman dilimi analizi hesaplanıyor…' : 'Veri alınamadı.'}
            </div>
          ) : (
            mtResults.map((r) => <MultiTimeframeCard key={r.symbol} r={r} />)
          )}
        </div>

        {/* Mini özet sayıları */}
        <div className="mt-5 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {silverOz && <MiniRow label="Ons Gümüş" value={`$${silverOz.value.toFixed(2)}`} change={silverOz.changePct ?? 0} />}
          {eurTry && <MiniRow label="EUR/TRY" value={eurTry.value.toFixed(2)} change={eurTry.changePct ?? 0} />}
          {gold && <MiniRow label="Gram Altın" value={`${gold.value.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}₺`} change={gold.changePct ?? 0} />}
          {silver && <MiniRow label="Gram Gümüş" value={`${silver.value.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}₺`} change={silver.changePct ?? 0} />}
          {platinum && <MiniRow label="Gram Platin" value={`${platinum.value.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}₺`} change={platinum.changePct ?? 0} />}
          {cryptos[0] && <MiniRow label={cryptos[0].symbol} value={`$${cryptos[0].usd.toLocaleString('en-US', { maximumFractionDigits: 0 })}`} change={cryptos[0].change24h} />}
        </div>
      </section>

      <div className="flex flex-col">
      {/* ============ PİYASA YORUMCULARI ============ */}
      <div className="mb-5 order-5">
        <AnalystCommentary />
      </div>
      </div>
    </>
  );
}

// ============ Yardımcı bileşenler ============

function SectionHeader({
  icon: Icon, title, tone,
}: { icon: typeof Sun; title: string; tone: 'warning' | 'success' | 'danger' | 'accent' }) {
  const tones = {
    warning: 'bg-warning/15 text-warning',
    success: 'bg-success/15 text-success',
    danger:  'bg-danger/15 text-danger',
    accent:  'bg-accent/15 text-accent',
  };
  return (
    <div className="flex items-center gap-3">
      <span className={cn('grid h-10 w-10 place-items-center rounded-lg', tones[tone])}>
        <Icon size={18} />
      </span>
      <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
    </div>
  );
}

function MiniRow({ label, value, change, warningOnRise }: { label: string; value: string; change: number; warningOnRise?: boolean }) {
  const tone = change > 0 ? 'text-success' : change < 0 ? 'text-danger' : 'text-slate-400';
  const arrow = warningOnRise && change > 0 ? '⚠️' : change >= 0.5 ? '🟢' : change <= -0.5 ? '🔴' : '➡️';
  return (
    <div className="rounded-lg border border-border bg-bg-card p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-0.5 text-base font-semibold tabular-nums text-slate-100">{value}</div>
      <div className={cn('text-[11px] tabular-nums', tone)}>
        {arrow} {change >= 0 ? '+' : ''}{change.toFixed(2)}%
      </div>
    </div>
  );
}

function MultiTimeframeCard({ r }: { r: MultiTimeframeResult }) {
  const changeTone = r.changePct >= 0 ? 'text-success' : 'text-danger';
  const leanColor = r.bigPlayerLean === 'alıcı' ? 'border-success/40 bg-success/10 text-success'
    : r.bigPlayerLean === 'satıcı' ? 'border-danger/40 bg-danger/10 text-danger'
    : 'border-slate-500/40 bg-slate-500/10 text-slate-300';

  // Sembol etiketi zaten macroKey ile aynı (BIST 30 doğrudan eşleşir)
  const routeKey = r.symbol;
  const route = macroKeyToRoute(routeKey);

  return (
    <div className="group rounded-lg border border-border bg-bg-card p-4 transition hover:border-accent/40">
      {/* Üst — sembol + fiyat (sembol tıklanabilir, varsa detay sayfasına gider) */}
      <div className="flex items-baseline justify-between gap-3">
        {route ? (
          <Link to={route} className="text-base font-bold text-slate-100 hover:text-accent">
            {r.label} <span className="text-[10px] text-slate-500 group-hover:text-accent">↗</span>
          </Link>
        ) : (
          <h4 className="text-base font-bold text-slate-100">{r.label}</h4>
        )}
        <div className="text-right">
          <div className="text-xl font-bold tabular-nums text-slate-100">
            {r.price.toLocaleString('tr-TR', { maximumFractionDigits: r.price < 100 ? 2 : 0 })}
          </div>
          <div className={cn('text-sm tabular-nums', changeTone)}>
            {r.changePct >= 0 ? '+' : ''}{r.changePct.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Çoklu zaman dilimi yönleri */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <TimeframeBox label="1 SAATLİK" ta={r.tf1h} />
        <TimeframeBox label="4 SAATLİK" ta={r.tf4h} />
        <TimeframeBox label="GÜNLÜK" ta={r.tf1d} />
      </div>

      {/* Büyük oyuncu eğilimi */}
      <div className={cn('mt-3 rounded-lg border px-3 py-2 text-xs', leanColor)}>
        <div className="flex items-center justify-between">
          <span className="font-semibold uppercase tracking-wider text-[10px]">Büyük Oyuncu Eğilimi</span>
          <span className="font-bold uppercase">
            {r.bigPlayerLean === 'alıcı' ? '↑ ALICI BASKIN' : r.bigPlayerLean === 'satıcı' ? '↓ SATICI BASKIN' : '↔ KARARSIZ'}
          </span>
        </div>
      </div>

      {/* Yorum */}
      <div className="mt-3 rounded-lg border border-border bg-bg-soft p-3 text-xs leading-relaxed text-slate-300">
        <strong className="text-accent">Yorum: </strong>
        {r.verdict}
      </div>
    </div>
  );
}

function TimeframeBox({ label, ta }: { label: string; ta: TimeframeAnalysis | null }) {
  if (!ta) {
    return (
      <div className="rounded border border-border bg-bg-soft p-2 text-center">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
        <div className="mt-1 text-xs font-bold text-slate-500">—</div>
      </div>
    );
  }
  const bg = ta.trend === 'long' ? 'border-success/40 bg-success/10'
    : ta.trend === 'short' ? 'border-danger/40 bg-danger/10'
    : 'border-slate-500/40 bg-slate-500/10';
  const color = ta.trend === 'long' ? 'text-success'
    : ta.trend === 'short' ? 'text-danger'
    : 'text-slate-400';
  const label2 = ta.trend === 'long' ? 'LONG ↑'
    : ta.trend === 'short' ? 'SHORT ↓'
    : 'NEUTRAL ↔';
  return (
    <div className={cn('rounded border p-2 text-center', bg)}>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={cn('mt-1 text-sm font-bold', color)}>{label2}</div>
      <div className="mt-0.5 text-[9px] text-slate-500">
        {ta.emaScore}/{ta.emasAbove.length + ta.emasBelow.length} EMA üstte
      </div>
    </div>
  );
}

function IndexAnalysisCard({ ta }: { ta: IndexTA }) {
  const trendTone = ta.trend === 'yukarı' ? 'text-success' : ta.trend === 'aşağı' ? 'text-danger' : 'text-slate-400';
  const trendBg = ta.trend === 'yukarı' ? 'bg-success/15 border-success/30' : ta.trend === 'aşağı' ? 'bg-danger/15 border-danger/30' : 'bg-slate-500/15 border-slate-500/30';
  const trendArrow = ta.trend === 'yukarı' ? '↑' : ta.trend === 'aşağı' ? '↓' : '→';
  const changeTone = ta.changePct >= 0 ? 'text-success' : 'text-danger';

  return (
    <div className="rounded-lg border border-border bg-bg-card p-4">
      {/* Başlık */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-base font-bold text-slate-100">{ta.label}</h4>
          <div className={cn('mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', trendBg, trendTone)}>
            {trendArrow} Kısa vade {ta.trend}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold tabular-nums text-slate-100">
            {ta.price.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
          </div>
          <div className={cn('text-sm tabular-nums', changeTone)}>
            {ta.changePct >= 0 ? '+' : ''}{ta.changePct.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Destek / Direnç */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded border border-danger/30 bg-danger/5 p-2.5">
          <div className="text-[9px] uppercase tracking-wider text-danger">Direnç</div>
          <div className="mt-0.5 text-lg font-bold tabular-nums text-slate-100">
            {ta.resistance != null ? ta.resistance.toLocaleString('tr-TR', { maximumFractionDigits: 0 }) : '—'}
          </div>
          {ta.resistancePct != null && (
            <div className="mt-0.5 text-[10px] text-slate-400">
              %{Math.abs(ta.resistancePct).toFixed(2)} {ta.resistancePct > 0 ? 'uzakta ↑' : 'aşıldı'}
            </div>
          )}
        </div>
        <div className="rounded border border-success/30 bg-success/5 p-2.5">
          <div className="text-[9px] uppercase tracking-wider text-success">Destek</div>
          <div className="mt-0.5 text-lg font-bold tabular-nums text-slate-100">
            {ta.support != null ? ta.support.toLocaleString('tr-TR', { maximumFractionDigits: 0 }) : '—'}
          </div>
          {ta.supportPct != null && (
            <div className="mt-0.5 text-[10px] text-slate-400">
              %{Math.abs(ta.supportPct).toFixed(2)} {ta.supportPct > 0 ? 'uzakta ↓' : 'kırıldı'}
            </div>
          )}
        </div>
      </div>

      {/* İndikatörler */}
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded bg-bg-soft px-2 py-1.5">
          <span className="text-slate-500">RSI:</span>{' '}
          <strong className={cn(
            'tabular-nums',
            (ta.rsi ?? 0) >= 70 ? 'text-warning' :
            (ta.rsi ?? 0) <= 30 ? 'text-success' : 'text-slate-200',
          )}>
            {ta.rsi != null ? ta.rsi.toFixed(1) : '—'}
          </strong>
          {ta.rsiNote && <span className="ml-1 text-slate-500">({ta.rsiNote})</span>}
        </div>
        <div className="rounded bg-bg-soft px-2 py-1.5">
          <span className="text-slate-500">MACD:</span>{' '}
          {ta.macdBullish ? (
            <strong className="text-success">Bullish ✓</strong>
          ) : ta.macdBearish ? (
            <strong className="text-danger">Bearish ✗</strong>
          ) : (
            <strong className="text-slate-400">Nötr</strong>
          )}
        </div>
        <div className="rounded bg-bg-soft px-2 py-1.5">
          <span className="text-slate-500">Bollinger:</span>{' '}
          <strong className="text-slate-300">{ta.bollingerLabel}</strong>
        </div>
        <div className="rounded bg-bg-soft px-2 py-1.5">
          <span className="text-slate-500">ADX:</span>{' '}
          <strong className="text-slate-300">{ta.adxLabel}</strong>
        </div>
      </div>

      {/* Yorum */}
      <div className="mt-3 rounded-lg border border-border bg-bg-soft p-3 text-xs leading-relaxed text-slate-300">
        <strong className="text-accent">Yorum: </strong>
        {ta.verdict}
      </div>
    </div>
  );
}

function SummaryRow({ name, value, change, warningOnRise, highlight }: { name: string; value: string; change: number; warningOnRise?: boolean; highlight?: boolean }) {
  const arrow = warningOnRise && change > 0 ? '⚠️' : change >= 1 ? '🟢' : change <= -1 ? '🔴' : change > 0 ? '➡️' : '➡️';
  const tone = change > 0 ? 'text-success' : change < 0 ? 'text-danger' : 'text-slate-400';
  return (
    <tr className={cn('hover:bg-bg-soft', highlight && 'bg-accent/5')}>
      <td className={cn('px-3 py-2.5', highlight ? 'font-semibold text-accent' : 'text-slate-200')}>{name}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-100">{value}</td>
      <td className={cn('px-3 py-2.5 text-right tabular-nums', tone)}>
        {arrow} {change >= 0 ? '+' : ''}{change.toFixed(2)}%
      </td>
    </tr>
  );
}

function MiniStat({ label, value, change }: { label: string; value: string; change?: number }) {
  const showChange = change != null;
  const tone = showChange ? (change >= 0 ? 'text-success' : 'text-danger') : 'text-slate-400';
  return (
    <div className="rounded-lg border border-border bg-bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums text-slate-100">{value}</div>
      {showChange && (
        <div className={cn('mt-0.5 text-xs tabular-nums', tone)}>
          {change >= 0 ? '+' : ''}{change.toFixed(2)}%
        </div>
      )}
    </div>
  );
}

function FearGreedMini({ fg }: { fg: FearGreedSnapshot }) {
  const t = fearGreedTone(fg.value);
  const tones = {
    danger:  'text-danger',
    warning: 'text-warning',
    slate:   'text-slate-300',
    success: 'text-success',
    accent:  'text-accent',
  } as const;
  return (
    <div className="rounded-lg border border-border bg-bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">Fear & Greed</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className={cn('text-xl font-bold tabular-nums', tones[t.tone])}>{fg.value}</span>
        <span className="text-[10px] text-slate-500">/100</span>
      </div>
      <div className={cn('mt-0.5 text-xs', tones[t.tone])}>{t.label}</div>
    </div>
  );
}

function CryptoTACard({ ta }: { ta: CryptoTA }) {
  const tone = ta.change24h >= 0 ? 'text-success' : 'text-danger';
  return (
    <div className="rounded-lg border border-border bg-bg-card p-4">
      <div className="flex items-center justify-between">
        <h5 className="text-base font-semibold">
          <span className="font-mono text-warning">{ta.symbol}</span>
          <span className="ml-2 text-slate-400 text-sm">({ta.name})</span>
        </h5>
        <div className="text-right">
          <div className="text-xl font-bold tabular-nums text-slate-100">
            ${ta.priceUsd.toLocaleString('en-US', { maximumFractionDigits: ta.priceUsd < 10 ? 4 : 0 })}
          </div>
          <div className={cn('text-sm tabular-nums', tone)}>
            {ta.change24h >= 0 ? '+' : ''}{ta.change24h.toFixed(2)}%
          </div>
        </div>
      </div>
      <ul className="mt-3 grid gap-1.5 text-xs text-slate-300 sm:grid-cols-2">
        <li>
          <strong>Gün içi aralık:</strong> ${ta.rangeLow.toFixed(ta.priceUsd < 10 ? 4 : 0)} – ${ta.rangeHigh.toFixed(ta.priceUsd < 10 ? 4 : 0)}
        </li>
        <li>
          <strong>RSI:</strong> {Number.isFinite(ta.rsi) ? ta.rsi.toFixed(1) : '—'} <span className="text-slate-500">({ta.rsiNote})</span>
        </li>
        <li>
          <strong>MACD:</strong>{' '}
          {ta.macdBullish ? <span className="text-success">Bullish crossover ✅</span>
            : ta.macdBearish ? <span className="text-danger">Bearish crossover ⚠️</span>
            : <span className="text-slate-400">nötr</span>}
        </li>
        <li>
          <strong>Bollinger:</strong> <span className="text-slate-400">{ta.bollingerLabel}</span>
        </li>
        <li>
          <strong>ADX:</strong> {ta.adxLabel}{' '}
          {ta.adxBullish == null ? '' : ta.adxBullish ? <span className="text-success">(+DI &gt; -DI)</span> : <span className="text-danger">(-DI &gt; +DI)</span>}
        </li>
        <li>
          <strong>Kritik direnç:</strong> ${ta.resistance.toFixed(ta.priceUsd < 10 ? 4 : 0)} <span className="text-slate-500">(%{ta.resistancePct.toFixed(1)} uzakta)</span>
        </li>
        <li className="sm:col-span-2">
          <strong>Kritik destek:</strong> ${ta.support.toFixed(ta.priceUsd < 10 ? 4 : 0)} <span className="text-slate-500">(%{ta.supportPct.toFixed(1)} uzakta)</span>
        </li>
      </ul>
    </div>
  );
}

function SectorSummary({ stocks }: { stocks: Stock[] }) {
  const agg = new Map<string, { count: number; sum: number }>();
  for (const s of stocks) {
    if (!s.sector) continue;
    const e = agg.get(s.sector) ?? { count: 0, sum: 0 };
    e.count += 1;
    e.sum += s.changePct;
    agg.set(s.sector, e);
  }
  const sectors = Array.from(agg.entries())
    .map(([name, e]) => ({ name, avg: e.sum / e.count, count: e.count }))
    .sort((a, b) => b.avg - a.avg);

  if (sectors.length === 0) return null;
  return (
    <div className="mt-5 rounded-lg border border-border bg-bg-card p-3">
      <h5 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-300">Öne Çıkan Sektörler</h5>
      <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
        {sectors.map((s) => (
          <div key={s.name} className="flex items-center justify-between rounded bg-bg-soft px-2.5 py-1 text-xs">
            <span className="truncate text-slate-300">{s.name}</span>
            <span className={cn('tabular-nums font-medium', s.avg >= 0 ? 'text-success' : 'text-danger')}>
              {s.avg >= 0 ? '+' : ''}{s.avg.toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FuturesRow({ name, value, change, warningOnRise }: { name: string; value: number; change: number; warningOnRise?: boolean }) {
  const arrow = warningOnRise && change > 0 ? '⚠️' : change >= 0.05 ? '🟢' : change <= -0.05 ? '🔴' : '➡️';
  const tone = change > 0 ? 'text-success' : change < 0 ? 'text-danger' : 'text-slate-400';
  return (
    <tr className="hover:bg-bg-soft">
      <td className="px-3 py-2.5 text-slate-200">{name}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-100">{value.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
      <td className={cn('px-3 py-2.5 text-right tabular-nums', tone)}>
        {arrow} {change >= 0 ? '+' : ''}{change.toFixed(2)}%
      </td>
    </tr>
  );
}

function TradingDashboard({
  fearGreed, cryptoTA, bist100, bist100TA, topGainersTA, conditions, vix, usdTry, stocks,
}: {
  fearGreed: FearGreedSnapshot | null;
  cryptoTA: CryptoTA[];
  bist100: MacroIndicator | undefined;
  bist100TA: IndexTA | undefined;
  topGainersTA: BistTA[];
  conditions: ReturnType<typeof assessTradingConditions>;
  vix: MacroIndicator | undefined;
  usdTry: MacroIndicator | undefined;
  stocks: Stock[];
}) {
  // Önerilen portföy dağılımı — risk seviyesi + F&G + BIST trendine göre
  const fgVal = fearGreed?.value ?? 50;
  const bistTrend = bist100TA?.trend ?? 'yatay';
  const riskLow = conditions.riskLevel === 'Düşük';
  let cryptoPct = 20, bistPct = 50, cashPct = 30;
  if (fgVal > 70) { cryptoPct = 15; bistPct = 40; cashPct = 45; } // greed → temkinli
  else if (fgVal < 30) { cryptoPct = 30; bistPct = 50; cashPct = 20; } // fear → fırsat
  if (bistTrend === 'yukarı') { bistPct += 10; cashPct -= 10; }
  else if (bistTrend === 'aşağı') { bistPct -= 15; cashPct += 15; }
  if (!riskLow) { cashPct += 10; bistPct -= 5; cryptoPct -= 5; }
  // Normalize
  const sum = cryptoPct + bistPct + cashPct;
  cryptoPct = Math.max(0, Math.round((cryptoPct / sum) * 100));
  bistPct = Math.max(0, Math.round((bistPct / sum) * 100));
  cashPct = 100 - cryptoPct - bistPct;

  const overbought = topGainersTA.filter((t) => (t.rsi ?? 0) >= 75).length;
  const bestSectors = (() => {
    const agg = new Map<string, { count: number; sum: number }>();
    for (const s of stocks) {
      if (!s.sector) continue;
      const e = agg.get(s.sector) ?? { count: 0, sum: 0 };
      e.count += 1;
      e.sum += s.changePct;
      agg.set(s.sector, e);
    }
    return Array.from(agg.entries())
      .map(([name, e]) => ({ name, avg: e.sum / e.count }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 3);
  })();

  // BIST seans saatleri (TR saati)
  const now = new Date();
  const tz = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', hour12: false });
  const hour = now.getHours();
  const day = now.getDay();
  const isWeekend = day === 0 || day === 6;
  const isOpen = !isWeekend && hour >= 10 && hour < 18;
  const sessionStatus = isWeekend
    ? 'Hafta sonu — BIST kapalı'
    : hour < 10
      ? `BIST açılışa ${10 - hour} sa kaldı (10:00)`
      : hour < 18
        ? `BIST açık (${tz} • kapanış 18:00)`
        : 'BIST kapandı — yarın 10:00 açılış';

  return (
    <section className="glass-card mb-5 p-5">
      <SectionHeader icon={Target} title="Trading Ortamı Değerlendirmesi" tone="accent" />
      <p className="mt-1 ml-13 text-xs text-slate-400">
        Risk, momentum ve makro koşullara göre bugünün trading ortamı.
      </p>

      {/* Üst özet — büyük göstergeler */}
      <div className="mt-4 grid gap-2 grid-cols-2 lg:grid-cols-4">
        <BigStat
          label="Risk Seviyesi"
          value={conditions.riskLevel.toUpperCase()}
          tone={conditions.riskLevel === 'Düşük' ? 'success' : conditions.riskLevel === 'Orta' ? 'warning' : 'danger'}
          hint={conditions.tradingFriendly ? 'Genel trading uygun' : 'Genel olarak temkinli ol'}
        />
        <BigStat
          label="Scalp Uygunluğu"
          value={conditions.scalpFriendly ? 'EVET' : 'TEMKİNLİ'}
          tone={conditions.scalpFriendly ? 'success' : 'warning'}
          hint={vix ? `VIX ${vix.value.toFixed(1)}` : 'Volatilite bilinmiyor'}
        />
        <BigStat
          label="Fear & Greed"
          value={fearGreed ? `${fearGreed.value}/100` : '—'}
          tone={fgVal >= 60 ? 'success' : fgVal >= 40 ? 'warning' : 'danger'}
          hint={fearGreed?.classification ?? ''}
        />
        <BigStat
          label="BIST Seansı"
          value={isOpen ? 'AÇIK' : 'KAPALI'}
          tone={isOpen ? 'success' : 'warning'}
          hint={sessionStatus}
        />
      </div>

      {/* 3 kategori boxları */}
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <TradingBox
          title="Kripto için Uygunluk"
          verdict={fgVal > 55 ? 'orta-yüksek' : fgVal < 35 ? 'fırsat penceresi' : 'orta'}
          verdictTone={fgVal > 55 ? 'success' : fgVal < 35 ? 'success' : 'warning'}
          bullets={[
            fearGreed ? `Fear & Greed ${fearGreed.value} — ${fearGreed.classification}` : 'F&G verisi yok',
            cryptoTA[0]?.macdBullish ? `${cryptoTA[0].symbol} MACD bullish cross ✅` : null,
            cryptoTA[0]?.macdBearish ? `${cryptoTA[0].symbol} MACD bearish cross ⚠️` : null,
            cryptoTA[0] ? `${cryptoTA[0].symbol} RSI ${cryptoTA[0].rsi.toFixed(1)} — ${cryptoTA[0].rsiNote}` : null,
            cryptoTA[0] && cryptoTA[0].adxBullish != null
              ? `Trend: ${cryptoTA[0].adxLabel}${cryptoTA[0].adxBullish ? ' (alıcı baskın)' : ' (satıcı baskın)'}`
              : null,
          ].filter(Boolean) as string[]}
        />
        <TradingBox
          title="BIST için Uygunluk"
          verdict={bistTrend === 'yukarı' ? 'olumlu' : bistTrend === 'aşağı' ? 'risk yüksek' : 'kararsız'}
          verdictTone={bistTrend === 'yukarı' ? 'success' : bistTrend === 'aşağı' ? 'danger' : 'warning'}
          bullets={[
            bist100 ? `BIST100 ${(bist100.changePct ?? 0) >= 0 ? '+' : ''}${(bist100.changePct ?? 0).toFixed(2)}% • ${bist100.value.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}` : null,
            bist100TA ? `Kısa vadeli trend: ${bist100TA.trend.toUpperCase()}` : null,
            bist100TA?.rsi != null ? `BIST RSI ${bist100TA.rsi.toFixed(1)} — ${bist100TA.rsiNote}` : null,
            overbought > 0 ? `${overbought} hisse RSI ≥75 — aşırı alımda, kar realizasyonu olabilir` : 'Aşırı alımda hisse az — temiz alım ortamı',
            ...conditions.notes,
          ].filter(Boolean) as string[]}
        />
        <TradingBox
          title="Scalp / Day-Trade Uygunluğu"
          verdict={conditions.scalpFriendly ? 'EVET — fırsat var' : 'TEMKİNLİ ol'}
          verdictTone={conditions.scalpFriendly ? 'success' : 'warning'}
          bullets={[
            vix ? `VIX ${vix.value.toFixed(1)} — ${(vix.value > 22) ? 'yüksek volatilite' : 'düşük-orta volatilite'}` : null,
            usdTry ? `USD/TRY ${usdTry.value.toFixed(2)} (${(usdTry.changePct ?? 0) >= 0 ? '+' : ''}${(usdTry.changePct ?? 0).toFixed(2)}%)` : null,
            conditions.scalpFriendly
              ? 'Hızlı giriş-çıkış için uygun, sıkı stop kullan'
              : 'Geniş stop, küçük pozisyon — sabırlı ol',
            `Risk seviyesi: ${conditions.riskLevel.toUpperCase()}`,
          ].filter(Boolean) as string[]}
        />
      </div>

      {/* Önerilen portföy dağılımı */}
      <div className="mt-5 rounded-lg border border-border bg-bg-card p-4">
        <h4 className="mb-3 text-sm font-semibold text-slate-200">Önerilen Portföy Dağılımı (bugünün koşullarına göre)</h4>
        <div className="flex h-5 overflow-hidden rounded">
          {bistPct > 0 && <div className="flex items-center justify-center bg-success text-[10px] font-bold text-white" style={{ width: `${bistPct}%` }}>BIST {bistPct}%</div>}
          {cryptoPct > 0 && <div className="flex items-center justify-center bg-warning text-[10px] font-bold text-white" style={{ width: `${cryptoPct}%` }}>Kripto {cryptoPct}%</div>}
          {cashPct > 0 && <div className="flex items-center justify-center bg-slate-600 text-[10px] font-bold text-white" style={{ width: `${cashPct}%` }}>Nakit/Altın {cashPct}%</div>}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          Bu öneri F&G ({fgVal}), BIST trendi ({bistTrend}) ve risk seviyesine ({conditions.riskLevel}) göre algoritmik olarak hesaplandı — yatırım tavsiyesi değildir.
        </p>
      </div>

      {/* Öne çıkan sektörler */}
      {bestSectors.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-2 text-sm font-semibold text-slate-200">Bugünün Öne Çıkan Sektörleri</h4>
          <div className="grid gap-2 sm:grid-cols-3">
            {bestSectors.map((s, i) => (
              <div key={s.name} className={cn(
                'rounded border p-2',
                s.avg >= 0 ? 'border-success/30 bg-success/5' : 'border-danger/30 bg-danger/5',
              )}>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-300">{i + 1}. {s.name}</span>
                  <span className={cn('text-xs font-bold tabular-nums', s.avg >= 0 ? 'text-success' : 'text-danger')}>
                    {s.avg >= 0 ? '+' : ''}{s.avg.toFixed(2)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function BigStat({ label, value, tone, hint }: { label: string; value: string; tone: 'success' | 'warning' | 'danger'; hint?: string }) {
  const tones = {
    success: 'border-success/30 bg-success/5 text-success',
    warning: 'border-warning/30 bg-warning/5 text-warning',
    danger: 'border-danger/30 bg-danger/5 text-danger',
  };
  return (
    <div className={cn('rounded-lg border p-3', tones[tone])}>
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-[10px] text-slate-400">{hint}</div>}
    </div>
  );
}

function TradingBox({
  title, verdict, verdictTone, bullets,
}: {
  title: string;
  verdict: string;
  verdictTone: 'success' | 'warning' | 'danger';
  bullets: string[];
}) {
  const tones = {
    success: 'bg-success/15 text-success border-success/30',
    warning: 'bg-warning/15 text-warning border-warning/30',
    danger:  'bg-danger/15 text-danger border-danger/30',
  };
  return (
    <div className="rounded-lg border border-border bg-bg-card p-4">
      <h5 className="text-sm font-semibold text-slate-200">{title}</h5>
      <div className={cn('mt-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider', tones[verdictTone])}>
        <Check size={11} /> {verdict}
      </div>
      <ul className="mt-3 space-y-1.5 text-xs text-slate-300">
        {bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-accent" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ============ Telegram metni ============

function buildTelegramText(p: {
  cryptoTA: CryptoTA[];
  stocks: Stock[];
  macros: MacroIndicator[];
  futures: Array<{ label: string; value: number; changePct: number }>;
  fearGreed: FearGreedSnapshot | null;
  conditions: ReturnType<typeof assessTradingConditions>;
  topGainersTA: BistTA[];
}): string {
  const date = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
  const lines: string[] = [];
  lines.push(`📊 *Günlük Piyasa Raporu — ${date}*`);
  lines.push('');

  // KRİPTO
  lines.push('*KRİPTO*');
  for (const ta of p.cryptoTA) {
    const arrow = ta.change24h >= 0 ? '🟢' : '🔴';
    lines.push(`${arrow} ${ta.symbol}: $${ta.priceUsd.toLocaleString('en-US')} (${ta.change24h >= 0 ? '+' : ''}${ta.change24h.toFixed(2)}%)`);
    lines.push(`  RSI ${ta.rsi.toFixed(1)} — ${ta.rsiNote}${ta.macdBullish ? ' • MACD bullish ✅' : ta.macdBearish ? ' • MACD bearish ⚠️' : ''}`);
  }
  if (p.fearGreed) lines.push(`F&G: ${p.fearGreed.value}/100 — ${p.fearGreed.classification}`);
  lines.push('');

  // BIST
  const bist = p.macros.find((m) => m.key === 'BIST 100');
  const usd = p.macros.find((m) => m.key === 'USD/TRY');
  const eur = p.macros.find((m) => m.key === 'EUR/TRY');
  lines.push('*BIST*');
  if (bist) lines.push(`BIST100: ${bist.value.toLocaleString('tr-TR')} (${(bist.changePct ?? 0) >= 0 ? '+' : ''}${(bist.changePct ?? 0).toFixed(2)}%)`);
  if (usd) lines.push(`USD/TRY: ${usd.value.toFixed(2)}`);
  if (eur) lines.push(`EUR/TRY: ${eur.value.toFixed(2)}`);

  if (p.topGainersTA.length > 0) {
    lines.push('');
    lines.push('*BIST Top Gainers + RSI*');
    p.topGainersTA.slice(0, 5).forEach((t, i) => {
      const rsiTxt = t.rsi != null ? ` RSI ${t.rsi.toFixed(0)}${(t.rsi ?? 0) >= 75 ? ' ⚠️' : ''}` : '';
      lines.push(`${i + 1}. ${t.stock.symbol} +${t.stock.changePct.toFixed(2)}%${rsiTxt}`);
    });
  }
  lines.push('');

  // MAKRO
  lines.push('*GLOBAL MAKRO*');
  for (const f of p.futures) {
    lines.push(`${f.label.split(' ')[0]}: ${f.value.toLocaleString('en-US')} (${f.changePct >= 0 ? '+' : ''}${f.changePct.toFixed(2)}%)`);
  }
  const vix = p.macros.find((m) => m.key === 'VIX');
  const brent = p.macros.find((m) => m.key === 'Brent');
  const gold = p.macros.find((m) => m.key === 'Gram Altın');
  if (brent) lines.push(`Brent: $${brent.value.toFixed(2)} (${(brent.changePct ?? 0) >= 0 ? '+' : ''}${(brent.changePct ?? 0).toFixed(2)}%)`);
  if (gold)  lines.push(`Gram Altın: ${gold.value.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}₺ (${(gold.changePct ?? 0) >= 0 ? '+' : ''}${(gold.changePct ?? 0).toFixed(2)}%)`);
  if (vix)   lines.push(`VIX: ${vix.value.toFixed(2)} ${(vix.changePct ?? 0) > 0 ? '⚠️' : ''}`);
  lines.push('');

  // TRADING ORTAMI
  lines.push('*TRADING ORTAMI*');
  lines.push(`Risk: ${p.conditions.riskLevel}`);
  lines.push(`Trading: ${p.conditions.tradingFriendly ? '✅' : '⚠️'} • Scalp: ${p.conditions.scalpFriendly ? '✅' : '⚠️'}`);

  return lines.join('\n');
}
