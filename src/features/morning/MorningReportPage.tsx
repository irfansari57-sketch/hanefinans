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
import { rsi, macd, bollinger, adx, rsiSignal, bollingerLabel, adxLabel, supportResistance, type OHLC } from '@/lib/indicators';
import { generateMarkdownReport, downloadMarkdown } from '@/lib/reportGenerator';
import { MOCK_STOCKS, MOCK_MACRO_FALLBACK } from '@/data/mock';
import type { Stock, MacroIndicator, NewsItem } from '@/data/types';
import { cn } from '@/lib/utils';
import { formatMoney, formatCompact } from '@/lib/format';

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
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | undefined>();
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null);

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

      // BIST 100 ve BIST 30 endeksleri için tam teknik analiz
      const indexConfigs = [
        { ySym: 'XU100.IS', symbol: 'BIST 100', label: 'BIST 100' },
        { ySym: 'XU030.IS', symbol: 'BIST 30',  label: 'BIST 30 (VIOP30 dayanağı)' },
      ];
      const indexResults: IndexTA[] = await Promise.all(
        indexConfigs.map(async ({ ySym, symbol, label }) => {
          const hist = await fetchHistoricalYahoo(ySym, '6mo', '1d');
          const macroEntry = macrosR.data.find((m) => m.label === label || m.key === symbol);
          const price = macroEntry?.value ?? 0;
          const changePct = macroEntry?.changePct ?? 0;
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
          };
        }),
      );
      setIndexTA(indexResults);

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
  const bist30 = macros.find((m) => m.key === 'BIST 30');
  const gold = macros.find((m) => m.key === 'Gram Altın');
  const silver = macros.find((m) => m.key === 'Gram Gümüş');
  const platinum = macros.find((m) => m.key === 'Gram Platin');
  const goldOz = macros.find((m) => m.key === 'Ons Altın');
  const silverOz = macros.find((m) => m.key === 'Ons Gümüş');
  const platinumOz = macros.find((m) => m.key === 'Ons Platin');
  const brent = macros.find((m) => m.key === 'Brent');
  const vix = macros.find((m) => m.key === 'VIX');

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

      {/* ============ KISA PİYASA ANALİZİ — BIST 100 + BIST 30 TAM TA ============ */}
      <section className="glass-card mb-5 p-5">
        <SectionHeader icon={Zap} title="Kısa Piyasa Analizi" tone="accent" />
        <p className="mt-1 ml-13 text-xs text-slate-400">
          BIST 100 ve BIST 30 (VIOP30 dayanağı) için kısa vadeli yön, destek-direnç ve teknik sinyaller.
        </p>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {indexTA.length === 0 ? (
            <div className="lg:col-span-2 rounded-lg border border-border bg-bg-card p-4 text-xs text-slate-500">
              {loading ? 'Endeks teknik analizi hesaplanıyor…' : 'Veri alınamadı, frankfurter/Yahoo bağlantısını kontrol et.'}
            </div>
          ) : (
            indexTA.map((idx) => <IndexAnalysisCard key={idx.symbol} ta={idx} />)
          )}
        </div>

        {/* Mini özet sayıları */}
        <div className="mt-5 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {usdTry && <MiniRow label="USD/TRY" value={usdTry.value.toFixed(2)} change={usdTry.changePct ?? 0} />}
          {eurTry && <MiniRow label="EUR/TRY" value={eurTry.value.toFixed(2)} change={eurTry.changePct ?? 0} />}
          {gold && <MiniRow label="Gram Altın" value={`${gold.value.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}₺`} change={gold.changePct ?? 0} />}
          {brent && <MiniRow label="Brent" value={`$${brent.value.toFixed(2)}`} change={brent.changePct ?? 0} />}
          {vix && <MiniRow label="VIX" value={vix.value.toFixed(2)} change={vix.changePct ?? 0} warningOnRise />}
          {cryptos[0] && <MiniRow label={cryptos[0].symbol} value={`$${cryptos[0].usd.toLocaleString('en-US', { maximumFractionDigits: 0 })}`} change={cryptos[0].change24h} />}
        </div>
      </section>

      <div className="flex flex-col">
      {/* ============ 3. KRİPTO ANALİZİ (ikincil) ============ */}
      <section className="glass-card mb-5 p-5 order-3">
        <SectionHeader icon={Bitcoin} title="3. Kripto Analizi" tone="warning" />

        {globalCrypto && fearGreed && (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <MiniStat label="BTC Dominance" value={`%${globalCrypto.btcDominance.toFixed(2)}`} />
            <MiniStat label="ETH Dominance" value={`%${globalCrypto.ethDominance.toFixed(2)}`} />
            <FearGreedMini fg={fearGreed} />
          </div>
        )}

        <h4 className="mt-5 mb-2 text-sm font-semibold text-slate-300">Ana Coinler — Teknik Analiz</h4>
        <div className="space-y-3">
          {cryptoTA.length === 0 && (
            <div className="rounded-lg border border-border bg-bg-card p-4 text-xs text-slate-500">
              {loading ? 'Teknik göstergeler hesaplanıyor…' : 'Veri alınamadı.'}
            </div>
          )}
          {cryptoTA.map((ta) => (
            <CryptoTACard key={ta.symbol} ta={ta} />
          ))}
        </div>

        {topAltcoins.length > 0 && (
          <>
            <h4 className="mt-5 mb-2 text-sm font-semibold text-slate-300">Öne Çıkan Altcoinler (24s)</h4>
            <div className="overflow-x-auto rounded-lg border border-border bg-bg-card">
              <table className="min-w-full text-xs">
                <thead className="bg-bg-soft text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">Sembol</th>
                    <th className="px-3 py-2 text-left">İsim</th>
                    <th className="px-3 py-2 text-right">Fiyat</th>
                    <th className="px-3 py-2 text-right">24s</th>
                    <th className="px-3 py-2 text-right">Hacim</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {topAltcoins
                    .filter((a) => !['BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'BUSD', 'DAI'].includes(a.symbol))
                    .sort((a, b) => b.change24h - a.change24h)
                    .slice(0, 10)
                    .map((a, i) => (
                      <tr key={a.id} className="hover:bg-bg-soft">
                        <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                        <td className="px-3 py-2 font-mono text-warning">{a.symbol}</td>
                        <td className="px-3 py-2 text-slate-300">{a.name}</td>
                        <td className="px-3 py-2 text-right tabular-nums">${a.priceUsd.toFixed(a.priceUsd < 1 ? 4 : 2)}</td>
                        <td className={cn('px-3 py-2 text-right tabular-nums', a.change24h >= 0 ? 'text-success' : 'text-danger')}>
                          {a.change24h >= 0 ? '+' : ''}{a.change24h.toFixed(2)}%
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-400">${formatCompact(a.volumeUsd)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* ============ 1. BIST ANALİZİ (öncelikli) ============ */}
      <section className="glass-card mb-5 p-5 order-1">
        <SectionHeader icon={TrendingUp} title="1. BIST Analizi" tone="success" />

        {bist100 && (
          <div className="mt-4 rounded-lg border border-border bg-bg-card p-4">
            <h4 className="text-sm font-semibold text-slate-200">BIST100 Açılış Öncesi Durum</h4>
            <ul className="mt-2 space-y-1 text-xs text-slate-300">
              <li>
                <strong>BIST100:</strong> {bist100.value.toLocaleString('tr-TR')} |{' '}
                <span className={(bist100.changePct ?? 0) >= 0 ? 'text-success' : 'text-danger'}>
                  {(bist100.changePct ?? 0) >= 0 ? '🟢 +' : '🔴 '}{(bist100.changePct ?? 0).toFixed(2)}%
                </span>
              </li>
              {usdTry && <li><strong>USD/TRY:</strong> {usdTry.value.toFixed(2)}</li>}
              {eurTry && <li><strong>EUR/TRY:</strong> {eurTry.value.toFixed(2)}</li>}
            </ul>
          </div>
        )}

        <h4 className="mt-5 mb-2 flex items-center gap-2 text-sm font-semibold text-slate-300">
          <Flame size={14} className="text-warning" /> BIST Günlük Top Gainers
        </h4>
        <div className="overflow-x-auto rounded-lg border border-border bg-bg-card">
          <table className="min-w-full text-xs">
            <thead className="bg-bg-soft text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Hisse</th>
                <th className="px-3 py-2 text-right">Değişim</th>
                <th className="px-3 py-2 text-right">RSI</th>
                <th className="px-3 py-2 text-left">Sektör</th>
                <th className="px-3 py-2 text-left">Not</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {topGainersTA.map(({ stock: s, rsi: r }, i) => {
                const overbought = (r ?? 0) >= 75;
                return (
                  <tr key={s.symbol} className="hover:bg-bg-soft">
                    <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                    <td className="px-3 py-2 font-mono text-accent">{s.symbol}</td>
                    <td className={cn('px-3 py-2 text-right tabular-nums font-medium', s.changePct >= 0 ? 'text-success' : 'text-danger')}>
                      {s.changePct >= 0 ? '+' : ''}{s.changePct.toFixed(2)}%
                    </td>
                    <td className={cn('px-3 py-2 text-right tabular-nums', overbought ? 'text-warning' : 'text-slate-300')}>
                      {r != null ? r.toFixed(1) : '—'}
                    </td>
                    <td className="px-3 py-2 text-slate-400">{s.sector ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-400">
                      {overbought ? (
                        <span className="inline-flex items-center gap-1 text-warning">
                          <AlertTriangle size={10} /> Aşırı alım
                        </span>
                      ) : (r ?? 50) > 60 ? (
                        'Güçlü momentum'
                      ) : (
                        'Makul seviyelerde'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <SectorSummary stocks={stocks} />
      </section>

      {/* ============ 2. GLOBAL MAKRO & EMTİA ============ */}
      <section className="glass-card mb-5 p-5 order-2">
        <SectionHeader icon={Globe2} title="2. Global Makro & Emtia" tone="danger" />

        <h4 className="mt-4 mb-2 text-sm font-semibold text-slate-300">ABD Vadeli İşlemleri</h4>
        <div className="overflow-x-auto rounded-lg border border-border bg-bg-card">
          <table className="min-w-full text-xs">
            <thead className="bg-bg-soft text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Endeks</th>
                <th className="px-3 py-2 text-right">Fiyat</th>
                <th className="px-3 py-2 text-right">Değişim</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {futures.map((f) => (
                <FuturesRow key={f.label} name={f.label} value={f.value} change={f.changePct} />
              ))}
              {vix && <FuturesRow name="VIX (Korku Endeksi)" value={vix.value} change={vix.changePct ?? 0} warningOnRise />}
            </tbody>
          </table>
        </div>

        <h4 className="mt-5 mb-2 flex items-center gap-2 text-sm font-semibold text-slate-300">
          <Coins size={14} className="text-warning" /> Altın & <CircleDollarSign size={14} className="text-success" /> Petrol
        </h4>
        <div className="grid gap-3 sm:grid-cols-3">
          {gold && <MiniStat label="Gram Altın (TRY)" value={`${gold.value.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}₺`} change={gold.changePct} />}
          {brent && <MiniStat label="Brent Petrol" value={`$${brent.value.toFixed(2)}`} change={brent.changePct} />}
          <MiniStat label="USD/TRY" value={usdTry?.value.toFixed(2) ?? '—'} change={usdTry?.changePct} />
        </div>
      </section>

      {/* ============ 4. TRADING ORTAMI DEĞERLENDİRMESİ ============ */}
      <section className="glass-card mb-5 p-5 order-4">
        <SectionHeader icon={Target} title="4. Trading Ortamı Değerlendirmesi" tone="accent" />

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <TradingBox
            title="Kripto için Uygunluk"
            verdict={fearGreed && fearGreed.value > 45 ? 'orta-yüksek' : 'düşük-orta'}
            verdictTone={fearGreed && fearGreed.value > 45 ? 'success' : 'warning'}
            bullets={[
              fearGreed ? `Fear & Greed ${fearGreed.value} — ${fearGreed.classification}` : 'F&G verisi yok',
              cryptoTA.length > 0 && cryptoTA[0].macdBullish ? `${cryptoTA[0].symbol} MACD bullish cross` : null,
              cryptoTA.length > 0 ? `${cryptoTA[0].symbol} RSI ${cryptoTA[0].rsi.toFixed(1)} — ${cryptoTA[0].rsiNote}` : null,
            ].filter(Boolean) as string[]}
          />
          <TradingBox
            title="BIST için Uygunluk"
            verdict={Math.abs((bist100?.changePct ?? 0)) < 1.5 ? 'orta' : 'yüksek volatilite'}
            verdictTone={Math.abs((bist100?.changePct ?? 0)) < 1.5 ? 'success' : 'warning'}
            bullets={[
              bist100 ? `BIST100 ${(bist100.changePct ?? 0) >= 0 ? '+' : ''}${(bist100.changePct ?? 0).toFixed(2)}%` : null,
              topGainersTA.filter((t) => (t.rsi ?? 0) >= 75).length > 0
                ? `${topGainersTA.filter((t) => (t.rsi ?? 0) >= 75).length} hisse RSI ≥75 — aşırı alım`
                : null,
              ...conditions.notes,
            ].filter(Boolean) as string[]}
          />
          <TradingBox
            title="Scalp Trading Bugün Uygun mu?"
            verdict={conditions.scalpFriendly ? 'EVET' : 'TEMKİNLİ'}
            verdictTone={conditions.scalpFriendly ? 'success' : 'warning'}
            bullets={[
              vix ? `VIX ${vix.value.toFixed(1)}` : null,
              conditions.scalpFriendly
                ? 'Yüksek volatilite — kısa pozisyonlar için uygun'
                : 'Düşük volatilite — temkinli ol, geniş stop kullan',
              `Risk seviyesi: ${conditions.riskLevel}`,
            ].filter(Boolean) as string[]}
          />
        </div>
      </section>

      {/* ============ 5. PİYASA HABERLERİ ============ */}
      {news.length > 0 && (
        <section className="glass-card mb-5 p-5 order-5">
          <SectionHeader icon={Newspaper} title="5. Piyasa Haberleri & Catalyst" tone="success" />
          <ol className="mt-4 space-y-2 text-xs">
            {news.slice(0, 7).map((n, i) => {
              const tone = n.importance >= 8 ? 'text-danger' : n.importance >= 6 ? 'text-warning' : 'text-slate-300';
              return (
                <li key={n.id} className="flex items-start gap-3 rounded-lg border border-border bg-bg-card p-3">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-bg-soft text-[10px] text-slate-400">{i + 1}</span>
                  <div className="min-w-0">
                    <div className={cn('font-medium', tone)}>{n.title}</div>
                    {n.summary && <p className="mt-0.5 line-clamp-2 text-slate-400">{n.summary}</p>}
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
                      <span className="rounded bg-bg-soft px-1.5 py-0.5">{n.source}</span>
                      {n.symbols.slice(0, 3).map((s) => (
                        <span key={s} className="rounded border border-border bg-bg-soft px-1.5 py-0.5 font-mono text-accent">{s}</span>
                      ))}
                      <span>Önem {n.importance}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}
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
