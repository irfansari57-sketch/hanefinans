import { useEffect, useState, useCallback, useMemo } from 'react';
import { Download, Send, RefreshCw, Zap } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { LiveBadge } from '@/components/domain/LiveBadge';
import {
  fetchMajorCryptos, fetchGlobal, fetchTopAltcoinMovers, fetchCryptoOhlc,
  type CryptoPrice, type CryptoMarketGlobal, type AltcoinMover,
} from '@/data/api/coingecko';
import { fetchFearGreed, type FearGreedSnapshot } from '@/data/api/feargreed';
import { fetchIndexYahoo, fetchHistoricalYahoo, YAHOO_SYMBOLS } from '@/data/api/yahoo';
import { loadStocks, loadMacroAll, clearServiceCaches, loadNews } from '@/data/services';
import { sendTelegramMessage, isTelegramConfigured } from '@/data/api/telegram';
import { rankMomentum, assessTradingConditions } from '@/lib/momentum';
import {
  rsi, macd, bollinger, adx, ema, sma, rsiSignal, bollingerLabel, adxLabel,
  supportResistance, type OHLC,
} from '@/lib/indicators';
import {
  analyzeTimeframe, aggregateTo4h, computeBigPlayerLean, buildVerdict,
  type MultiTimeframeResult, type TimeframeAnalysis,
} from '@/lib/multiTimeframe';
import { useAuth, isAdmin, isPro } from '@/store/auth';
import { AdBanner } from '@/components/domain/AdBanner';
import { useSiteSettings } from '@/store/siteSettings';
import { generateMarkdownReport, downloadMarkdown } from '@/lib/reportGenerator';
import { MOCK_STOCKS, MOCK_MACRO_FALLBACK } from '@/data/mock';
import type { Stock, MacroIndicator, NewsItem } from '@/data/types';
import { cn } from '@/lib/utils';
import { AnalystCommentary } from '@/components/domain/AnalystCommentary';

// Modüler section'lar — `./sections/` altında her biri kendi dosyasında
import type { CryptoTA, BistTA, IndexTA } from './sections/types';
import { STORAGE_LAST_SENT } from './sections/types';
import { SectionHeader } from './sections/SectionHeader';
import { MiniRow } from './sections/MiniRow';
import { MultiTimeframeCard } from './sections/MultiTimeframeCard';
import { buildTelegramText } from './sections/buildTelegramText';
import { SeoHead } from '@/components/seo/SeoHead';

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
  const [, setIndexTA] = useState<IndexTA[]>([]);
  const [mtResults, setMtResults] = useState<MultiTimeframeResult[]>([]);
  const [, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | undefined>();
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const user = useAuth((s) => s.user);
  const admin = isAdmin(user);
  const proUser = isPro(user);
  const adBannerEnabled = useSiteSettings((s) => s.adBannerEnabled);

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
          const price = macroEntry?.value ?? lastClose;
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

      // Multi-Timeframe Analizi (1h, 4h, 1d)
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
      try { localStorage.setItem(STORAGE_LAST_SENT, new Date().toISOString().slice(0, 10)); } catch { /* */ }
    }
    setSending(false);
    setTimeout(() => setSendResult(null), 5000);
  };

  const todayStr = new Date().toISOString().slice(0, 10);
  const lastSent = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_LAST_SENT) : null;
  const alreadySentToday = lastSent === todayStr;

  // Mini özet için ihtiyaç duyulan makro alanlar
  const eurTry = macros.find((m) => m.key === 'EUR/TRY');
  const gold = macros.find((m) => m.key === 'Gram Altın');
  const silver = macros.find((m) => m.key === 'Gram Gümüş');
  const silverOz = macros.find((m) => m.key === 'Ons Gümüş');
  const platinum = macros.find((m) => m.key === 'Gram Platin');

  return (
    <>
      <SeoHead title="Günlük Analiz" description="Sabah, öğlen ve akşam piyasa brifingi — endeksler, kripto, emtia, makro veriler ve günün öne çıkanları." path="/morning" />

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

      {/* Reklam banner — admin Ayarlar'dan açtıysa + PRO/ELITE değilse */}
      {adBannerEnabled && !proUser && <AdBanner className="mb-5" />}

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

      {/* ============ PİYASA YORUMCULARI ============ */}
      <div className="mb-5">
        <AnalystCommentary />
      </div>
    </>
  );
}
