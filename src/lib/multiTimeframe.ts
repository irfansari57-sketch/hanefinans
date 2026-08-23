/**
 * Çoklu zaman dilimli trend analizi
 *
 * Her sembol için 3 zaman diliminde (1h, 4h, 1d) MA (basit hareketli ortalama) bazlı
 * long/short yön belirler. MA periyotları: 5, 8, 13, 21, 55, 200 (Fibonacci).
 * 5-8-13 kesişimi kısa vade al sinyali; fiyat 8 MA üstü öncü pozitif sinyal.
 * Büyük oyuncu eğilimini MACD + MA200 pozisyonu üzerinden hesaplar.
 */

import { sma, ema, macd, type OHLC } from './indicators';
import type { OhlcvBar } from '@/data/api/yahoo';

export type Trend = 'long' | 'short' | 'neutral';

/** Genel piyasa rejimi — Fiyatın Günlük EMA 200'e göre konumu */
export type MarketRegime = 'bull' | 'bear' | 'unknown';

/** Ana yön — Fiyatın Günlük EMA 55'e göre konumu (kısa-orta vade) */
export type PriceTrend = 'up' | 'down' | 'sideways';

export interface TimeframeAnalysis {
  trend: Trend;
  /** EMA dizilim notu (kaç MA üstte) */
  emaScore: number;
  /** Hangi periyotlar fiyat üzerinde */
  emasAbove: number[];
  /** Hangi periyotlar fiyat altında */
  emasBelow: number[];
  /** Her EMA periyodunun son fiyat değeri (period -> value). */
  emaValues: Record<number, number>;
  /**
   * Bir önceki barın EMA değerleri — kesişim algılaması için.
   * Optional: eski cache'lenmiş datada olmayabilir, kullanım yerinde null-safe oku.
   */
  emaValuesPrev?: Record<number, number>;
}

export interface MultiTimeframeResult {
  symbol: string;
  label: string;
  price: number;
  changePct: number;
  tf1h: TimeframeAnalysis | null;
  tf4h: TimeframeAnalysis | null;
  tf1d: TimeframeAnalysis | null;
  bigPlayerLean: 'alıcı' | 'satıcı' | 'kararsız';
  /** MA 200 üstü → bull, altı → bear (Günlük). Verilmezse buildVerdict günlük EMA'lardan otomatik türetir. */
  marketRegime?: MarketRegime;
  /** MA 55 üstü → up, altı → down (Günlük). Verilmezse buildVerdict günlük EMA'lardan otomatik türetir. */
  priceTrend?: PriceTrend;
  verdict: string;
}

/**
 * Günlük EMA 200'e göre boğa/ayı piyasası belirle.
 * Sade ve net — kullanıcıya "ana yönde" ne olduğunu anında bildirir.
 */
export function computeMarketRegime(price: number, sma200Daily: number | undefined): MarketRegime {
  if (!Number.isFinite(sma200Daily) || !Number.isFinite(price)) return 'unknown';
  // MA 200'e %0.5'ten yakınsa "unknown" — çok marjinal pozisyon karışıklık yaratır
  const margin = (sma200Daily as number) * 0.005;
  if (price > (sma200Daily as number) + margin) return 'bull';
  if (price < (sma200Daily as number) - margin) return 'bear';
  return 'unknown';
}

/**
 * Günlük EMA 55'e göre kısa-orta vade trend belirle.
 * up: fiyat 55 EMA üstünde, down: altında, sideways: marjinal yakın.
 */
export function computePriceTrend(price: number, ema55Daily: number | undefined): PriceTrend {
  if (!Number.isFinite(ema55Daily) || !Number.isFinite(price)) return 'sideways';
  const margin = (ema55Daily as number) * 0.005;
  if (price > (ema55Daily as number) + margin) return 'up';
  if (price < (ema55Daily as number) - margin) return 'down';
  return 'sideways';
}

/** Kullanıcıya görünür sade etiketler — buildVerdict ve kart için. */
export function regimeLabel(r: MarketRegime): string {
  return r === 'bull' ? 'Boğa Piyasası' : r === 'bear' ? 'Ayı Piyasası' : 'Belirsiz Piyasa';
}
export function trendLabel(t: PriceTrend): string {
  return t === 'up' ? 'Yükseliş Trendi' : t === 'down' ? 'Düşüş Trendi' : 'Yatay Seyir';
}

/** 1h barlardan 4h barlar üret (4 bar = 1 4h bar). */
export function aggregateTo4h(bars1h: OhlcvBar[]): OhlcvBar[] {
  const bars4h: OhlcvBar[] = [];
  for (let i = 0; i < bars1h.length; i += 4) {
    const chunk = bars1h.slice(i, Math.min(i + 4, bars1h.length));
    if (chunk.length === 0) continue;
    bars4h.push({
      time: chunk[0].time,
      open: chunk[0].open,
      high: Math.max(...chunk.map((c) => c.high)),
      low: Math.min(...chunk.map((c) => c.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((s, c) => s + (c.volume ?? 0), 0),
    });
  }
  return bars4h;
}

/**
 * Verilen closes dizisinden EMA dizilimi → trend hesabı
 * Kısa zaman dilimleri için periods=[5,8,13,21,55]
 * Günlük için periods=[5,8,13,21,55,200]
 */
export function analyzeTimeframe(
  closes: number[],
  periods: number[] = [5, 8, 13, 21, 55],
): TimeframeAnalysis | null {
  if (closes.length < Math.max(...periods)) return null;
  const last = closes[closes.length - 1];

  const emaValues = periods.map((p) => {
    const series = ema(closes, p);
    return {
      period: p,
      value: series.at(-1) ?? NaN,
      prev: series.at(-2) ?? NaN,
    };
  });

  const validEmas = emaValues.filter((e) => Number.isFinite(e.value));
  if (validEmas.length === 0) return null;

  const emasAbove: number[] = [];
  const emasBelow: number[] = [];
  for (const e of validEmas) {
    if (last >= e.value) emasAbove.push(e.period);
    else emasBelow.push(e.period);
  }

  const score = emasAbove.length / validEmas.length;
  let trend: Trend = 'neutral';
  if (score >= 0.8) trend = 'long';
  else if (score <= 0.2) trend = 'short';

  const valuesMap: Record<number, number> = {};
  const prevMap: Record<number, number> = {};
  for (const e of validEmas) {
    valuesMap[e.period] = e.value;
    prevMap[e.period] = e.prev;
  }
  return { trend, emaScore: emasAbove.length, emasAbove, emasBelow, emaValues: valuesMap, emaValuesPrev: prevMap };
}

/**
 * Büyük oyuncu eğilimi: MACD histogram + EMA200 pozisyonu
 * Daily bar üzerinden hesaplanır
 */
export function computeBigPlayerLean(bars: OHLC[]): 'alıcı' | 'satıcı' | 'kararsız' {
  if (bars.length < 200) return 'kararsız';
  const closes = bars.map((b) => b.close);
  const last = closes[closes.length - 1];
  const sma200 = ema(closes, 200).at(-1);  // EMA 200 (kullanıcı talebiyle EMA'ya geçildi)
  const macdR = macd(closes);
  const histLast = macdR.histogram.at(-1) ?? 0;
  const histPrev = macdR.histogram.at(-2) ?? 0;

  if (!Number.isFinite(sma200)) return 'kararsız';
  const above200 = last > (sma200 as number);
  const histRising = histLast > histPrev;

  // Güçlü alıcı: 200 üstünde + MACD pozitif + yükseliyor
  if (above200 && histLast > 0 && histRising) return 'alıcı';
  if (above200 && histLast > 0) return 'alıcı';
  // Güçlü satıcı: 200 altında + MACD negatif + düşüyor
  if (!above200 && histLast < 0 && !histRising) return 'satıcı';
  if (!above200 && histLast < 0) return 'satıcı';
  return 'kararsız';
}

/**
 * Trend coherence: 3 zaman diliminin trend kombinasyonunu okunaklı bir cümleye çevir.
 */
function trendCoherenceLine(
  t1h: Trend | undefined,
  t4h: Trend | undefined,
  t1d: Trend | undefined,
): string {
  const trends = [t1h, t4h, t1d].filter((t): t is Trend => Boolean(t));
  if (trends.length === 0) return '';
  const longCount = trends.filter((t) => t === 'long').length;
  const shortCount = trends.filter((t) => t === 'short').length;

  if (longCount === 3) return 'Kısa, orta ve uzun vadenin üçü de aynı yönde: piyasa genelinde yukarı bakış hakim.';
  if (shortCount === 3) return 'Her üç vadede de aşağı yön ağır basıyor — satıcı tarafın hakim olduğu bir dönem.';

  if (longCount === 2 && shortCount === 0) return 'İki vadede yukarı eğilim, birinde kararsızlık — genel görüntü olumlu ama tam teyit yok.';
  if (shortCount === 2 && longCount === 0) return 'İki vadede aşağı baskı, birinde kararsızlık — genel görüntü zayıf.';

  if (longCount === 1 && shortCount === 1) {
    if (t1d === 'long' && t1h === 'short') return 'Uzun vadede yön yukarı, ama son saatlerde geri çekilme var — ana eğilim korunuyor.';
    if (t1d === 'short' && t1h === 'long') return 'Uzun vadede yön aşağı, kısa vadede kısmi toparlanma denemesi görülüyor.';
    if (t4h === 'long' && t1h === 'short') return 'Orta vadeli görünüm yukarı, kısa vadede küçük bir mola var.';
    if (t4h === 'short' && t1h === 'long') return 'Orta vadeli görünüm aşağı, kısa vadede tepki alımları var.';
    return 'Vadeler arasında yön ayrışması var — genel resim henüz netleşmedi.';
  }

  // Karma / belirsiz durumlar — kullanıcıyı gereksiz uyarmadan, izleme diliyle geç
  if (longCount === 1) return 'Yön tam netleşmemiş; kısa vadede pozitif işaret var, izlenmeye değer bir görüntü.';
  if (shortCount === 1) return 'Yön tam netleşmemiş; kısa vadede zayıflık işareti var, temkinli izleme dönemi.';
  return 'Belirgin bir yön yok — piyasa dar bir aralıkta yatay seyrediyor.';
}

/**
 * Fiyat formatı — büyüklüğe göre otomatik (binlik ayraç, ondalık basamak).
 * BIST endeksleri için tam sayı, kurlar için 2 ondalık vb.
 */
function fmtPrice(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  let digits = 2;
  if (abs >= 1000) digits = 0;
  else if (abs >= 100) digits = 1;
  else if (abs >= 1) digits = 2;
  else digits = 4;
  return n.toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/**
 * TR saatine göre gün başı / orta / sonu / piyasa kapalı bağlamı.
 * BIST seans: 10:00-18:00. Açılış-öğle (10-13), öğle-15, 15-18 (kapanış).
 * Yorumun başında konum bilgisi vererek "geriden gelen yorum" hissini önler.
 */
function timeContextLine(): string {
  const now = new Date();
  // TR = UTC+3 (DST yok)
  const tr = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const day = tr.getUTCDay(); // 0 Sun, 6 Sat
  const hour = tr.getUTCHours();
  const min = tr.getUTCMinutes();

  // Hafta sonu
  if (day === 0 || day === 6) {
    return 'Piyasa hafta sonu kapalı, Cuma kapanış verileri üzerinden değerlendirme:';
  }

  // Açılış öncesi
  if (hour < 10) {
    return 'Açılış öncesi görüntü — gece dünya piyasalarındaki hareket ışığında:';
  }
  // Açılış-öğle (10:00-12:30)
  if (hour < 12 || (hour === 12 && min < 30)) {
    return 'Sabah seansı — açılışın ilk saatlerinde piyasa yönü:';
  }
  // Öğle ortası (12:30-15:00)
  if (hour < 15) {
    return 'Öğle saatleri — sabah hareketinin test edildiği ara dönem:';
  }
  // Kapanış öncesi (15:00-18:00)
  if (hour < 18) {
    return 'Kapanış öncesi — günün son hareketleri ve hacim yoğunlaşıyor:';
  }
  // Kapanış sonrası
  return 'Piyasa günlük seansı kapattı, kapanış verilerine göre:';
}

/**
 * Üçlü EMA dizilim sinyali — 5-8-13 birlikte yukarı kesişimi güçlü AL sinyali.
 * Fiyat 8 MA üstü öncü pozitif (haber öncesi giriş, momentum kanıtı).
 */
function triCrossLine(ta: TimeframeAnalysis, tfLabel: string, price: number): string {
  const v5 = ta.emaValues?.[5];
  const v8 = ta.emaValues?.[8];
  const v13 = ta.emaValues?.[13];
  if (!Number.isFinite(v5) || !Number.isFinite(v8) || !Number.isFinite(v13)) return '';

  const v5p = ta.emaValuesPrev?.[5];
  const v8p = ta.emaValuesPrev?.[8];
  const v13p = ta.emaValuesPrev?.[13];

  // Üçlü AL: 5>8>13 ve önceki barda 5≤8 (taze kesişim)
  const bullStack = v5 > v8 && v8 > v13;
  const wasNotBull = Number.isFinite(v5p) && Number.isFinite(v8p) &&
                     !((v5p as number) > (v8p as number));
  const above8 = Number.isFinite(price) && price > (v8 as number);

  if (bullStack && wasNotBull) {
    return `${tfLabel} vadede kısa periyot ortalamalar yeni yukarı dizildi — momentum tazelendi, olumlu bir başlangıç görüntüsü.`;
  }

  // Üçlü düşüş: 5<8<13 ve önceki barda 5≥8
  const bearStack = v5 < v8 && v8 < v13;
  const wasNotBear = Number.isFinite(v5p) && Number.isFinite(v8p) &&
                     !((v5p as number) < (v8p as number));
  if (bearStack && wasNotBear) {
    return `${tfLabel} vadede kısa periyot ortalamalar aşağı döndü — momentum yön değiştirdi, kısa vadede zayıflama işareti.`;
  }

  if (bullStack && above8) {
    return `${tfLabel} vadede fiyat kısa vadeli ortalamaların üzerinde ve dizilim yukarıyı destekliyor — genel görüntü olumlu.`;
  }
  if (bearStack) {
    return `${tfLabel} vadede kısa vadeli ortalamalar aşağı dizili — toparlanma için yön değişimi beklenmeli.`;
  }
  return '';
}

/**
 * Kısa vade kesişim sinyali — günlükte EMA 5 ile EMA 8'in pozisyonu kısa vade
 * yön belirleyicisidir. Fresh cross (bir önceki barda diğer taraftaydı, bugün
 * tersine geçti) çok güçlü bir sinyal; sade pozisyon ise momentum bilgisi.
 *
 * - EMA 5 yukarı kesişim → güçlü LONG sinyali (20 Kasım, 6 Ocak gibi noktalar)
 * - EMA 5 aşağı kesişim  → güçlü SHORT sinyali
 */
function shortCrossLine(ta: TimeframeAnalysis, tfLabel: string, price?: number): string {
  const e5 = ta.emaValues?.[5];
  const e8 = ta.emaValues?.[8];
  const e5p = ta.emaValuesPrev?.[5];
  const e8p = ta.emaValuesPrev?.[8];

  if (!Number.isFinite(e5) || !Number.isFinite(e8)) return '';

  const ema5Str = fmtPrice(e5);
  const ema8Str = fmtPrice(e8);
  const above = e5 > e8;
  // e5p/e8p number | undefined olabilir; once tanımlı + finite kontrolü, sonra karşılaştırma
  const hasPrev = typeof e5p === 'number' && Number.isFinite(e5p) && typeof e8p === 'number' && Number.isFinite(e8p);
  const wasAbove = hasPrev && (e5p as number) > (e8p as number);
  const wasBelow = hasPrev && (e5p as number) < (e8p as number);

  // Fresh bull cross — bugün yukarı kesişti, güçlü LONG sinyali
  if (above && wasBelow) {
    return `${tfLabel} vadede kısa periyot ortalamalar bugün yukarı yönlü kesişti (${ema5Str} / ${ema8Str}) — yön değişikliği sinyali, kısa vade toparlanıyor.`;
  }

  // Fresh bear cross — bugün aşağı kesişti, güçlü SHORT sinyali
  if (!above && wasAbove) {
    return `${tfLabel} vadede kısa periyot ortalamalar bugün aşağı yönlü kesişti (${ema5Str} / ${ema8Str}) — momentum aşağı döndü, kısa vadede zayıflık başladı.`;
  }

  // Position only (no fresh cross)
  const priceBelowBothEmas = typeof price === 'number' && Number.isFinite(price) &&
    (price as number) < (e8 as number) && (price as number) < (e5 as number);

  if (above && !priceBelowBothEmas) {
    return `${tfLabel} vadede fiyat kısa vadeli ortalamaların üzerinde (${ema5Str} / ${ema8Str}) — yukarı görüntü korunuyor, momentum tarafında bir kırılma yok.`;
  }
  if (above && priceBelowBothEmas) {
    return `${tfLabel} vadede ortalamalar hâlâ yukarı dizili görünse de fiyat bunların altına sarktı (${ema5Str} / ${ema8Str}) — satıcı baskısı öne çıktı, dikkat gerektiren bir görüntü.`;
  }
  // EMA 5 < EMA 8 ve fiyat altında — aktif düşüş trendinde kullanıcıyı net uyar
  return `${tfLabel} vadede fiyat kısa vadeli ortalamaların altında (${ema5Str} / ${ema8Str}) — yön aşağı, toparlanma için önce ortalamaların üzerine çıkış görülmeli.`;
}

/** Günün hareket büyüklüğüne göre karakter notu. */
function dailyMoveLine(changePct: number): string {
  if (!Number.isFinite(changePct)) return '';
  const sign = changePct >= 0 ? '+' : '';
  const abs = Math.abs(changePct);
  const word = changePct >= 0 ? 'alıcı' : 'satıcı';
  if (abs < 0.2) return `Günlük değişim ${sign}${changePct.toFixed(2)}% — sakin bir seyir, işlem iştahı sınırlı.`;
  if (abs < 0.7) return `Günlük değişim ${sign}${changePct.toFixed(2)}% — hafif ${word} ilgisi, belirgin bir yön yok.`;
  if (abs < 1.5) return `Günlük değişim ${sign}${changePct.toFixed(2)}% — ${word} tarafın ağırlığı hissediliyor.`;
  if (abs < 3)   return `Günlük değişim ${sign}${changePct.toFixed(2)}% — güçlü ${word} hareketi, hareketlilik yüksek.`;
  return `Günlük değişim ${sign}${changePct.toFixed(2)}% — sert ${word} dalgası, oynaklık çok yüksek, ani yön değişimlerine açık.`;
}

/** Büyük oyuncu eğilimini açıkla — sade, net yön. */
function bigPlayerLine(lean: 'alıcı' | 'satıcı' | 'kararsız'): string {
  if (lean === 'alıcı')   return 'Kurumsal tarafta alıcı ağırlığı hissediliyor.';
  if (lean === 'satıcı') return 'Kurumsal tarafta satıcı ağırlığı hissediliyor.';
  return 'Kurumsal tarafta belirgin bir taraf yok.';
}

/**
 * Ana yön özeti: Boğa/Ayı + Yükseliş/Düşüş + dayanak EMA seviyeleri.
 * En önemli cümle — en başta gelir, kullanıcı tek bakışta yön bilgisini alır.
 */
function mainDirectionLine(
  price: number,
  regime: MarketRegime,
  trend: PriceTrend,
  sma200?: number,
  ema55?: number,
): string {
  const sma200Str = Number.isFinite(sma200) ? fmtPrice(sma200 as number) : null;
  const ema55Str = Number.isFinite(ema55) ? fmtPrice(ema55 as number) : null;

  const regimePart = regime === 'bull'
    ? `Uzun vadeli görüntü olumlu${sma200Str ? ` (uzun vadeli ortalama ${sma200Str})` : ''} — genel yön yukarı bakıyor`
    : regime === 'bear'
      ? `Uzun vadeli görüntü zayıf${sma200Str ? ` (uzun vadeli ortalama ${sma200Str})` : ''} — genel yön aşağı bakıyor`
      : `Uzun vadeli yön belirsiz${sma200Str ? ` (uzun vadeli ortalama ${sma200Str})` : ''}`;

  const trendPart = trend === 'up'
    ? `ve orta vadeli ortalamanın${ema55Str ? ` (${ema55Str})` : ''} üzerinde olduğu için kısa-orta vadede de yukarı eğilim sürüyor.`
    : trend === 'down'
      ? `ve orta vadeli ortalamanın${ema55Str ? ` (${ema55Str})` : ''} altında kaldığı için kısa-orta vadede zayıflık öne çıkıyor.`
      : `, orta vadeli ortalama${ema55Str ? ` (${ema55Str})` : ''} civarında yatay bir seyir hakim.`;

  // Çelişki: bull ama down? Bunu da yumuşat
  if (regime === 'bull' && trend === 'down') {
    return `Uzun vadede genel görüntü olumlu${sma200Str ? ` (uzun vadeli ortalama ${sma200Str})` : ''} olsa da orta vadeli ortalamanın${ema55Str ? ` (${ema55Str})` : ''} altına sarkma var — büyük eğilim korunuyor, kısa vadede geri çekilme yaşanıyor.`;
  }
  if (regime === 'bear' && trend === 'up') {
    return `Uzun vadede genel görüntü zayıf${sma200Str ? ` (uzun vadeli ortalama ${sma200Str})` : ''} olsa da orta vadeli ortalamanın${ema55Str ? ` (${ema55Str})` : ''} üzerine çıkış var — büyük eğilim aşağı, kısa vadede toparlanma denemesi görülüyor.`;
  }
  return `${regimePart} ${trendPart}`.replace(/\s+/g, ' ');
}

/** Trend + büyük oyuncu kombinasyonuna göre net aksiyon ipucu. */
function actionHintLine(
  t1h: Trend | undefined,
  t4h: Trend | undefined,
  t1d: Trend | undefined,
  lean: 'alıcı' | 'satıcı' | 'kararsız',
  emaDailyValues?: Record<number, number>,
): string {
  const ema21 = emaDailyValues?.[21];
  const ema55 = emaDailyValues?.[55];
  const ema21Str = Number.isFinite(ema21) ? ` (${fmtPrice(ema21 as number)})` : '';
  const ema55Str = Number.isFinite(ema55) ? ` (${fmtPrice(ema55 as number)})` : '';
  if (t1h === 'long' && t4h === 'long' && t1d === 'long') {
    if (lean === 'alıcı') return 'Genel değerlendirme: Kısa, orta ve uzun vadenin üçünde de yön yukarı; kurumsal taraf da alıcı — piyasa görüntüsü belirgin şekilde olumlu.';
    return 'Genel değerlendirme: Vadelerin tamamında yön yukarı, ancak kurumsal tarafta güçlü bir teyit henüz yok — olumlu görüntü sürüyor.';
  }
  if (t1h === 'short' && t4h === 'short' && t1d === 'short') {
    if (lean === 'satıcı') return 'Genel değerlendirme: Vadelerin tamamında yön aşağı, kurumsal taraf da satıcı — piyasa görüntüsü baskı altında.';
    return 'Genel değerlendirme: Vadelerin tamamında yön aşağı — piyasada zayıflık ön planda, yön değişimi için henüz erken görüntü.';
  }
  if (lean === 'alıcı') return `Genel değerlendirme: Yön karışık ama kurumsal tarafta alıcı ilgisi var; orta vadeli destek bölgesi${ema21Str} yakın takip ediliyor.`;
  if (lean === 'satıcı') return `Genel değerlendirme: Yön karışık, kurumsal tarafta satıcı ağırlığı hissediliyor; orta vadeli seviye${ema55Str} kritik bir eşik.`;
  return 'Genel değerlendirme: Net bir yön yok, piyasa dar bir bantta hareket ediyor — belirsizlik döneminde ölçülü izleme uygun.';
}

/**
 * Tüm sinyalleri birleştirerek kullanıcıya 1 paragraflık net yorum üret.
 * Sıra: zaman bağlamı → ana yön → büyük oyuncu → üçlü EMA dizilim → EMA 5/8 → günlük hareket → TF coherence → aksiyon.
 */
export function buildVerdict(r: Omit<MultiTimeframeResult, 'verdict'>): string {
  const parts: string[] = [];

  // 0) Zaman bağlamı — gün başı/orta/sonu/kapalı
  parts.push(timeContextLine());

  // 1) ÖNCE KISA VADE — EMA 5/8/13 üçlü dizilim ve fiyatın bunlara göre konumu.
  //    Kullanıcı talebi: günlük fiyat EMA 5/8/13 önceliklendirilsin.
  if (r.tf1d) {
    const tri = triCrossLine(r.tf1d, 'Günlük', r.price);
    if (tri) parts.push(tri);
    const cross = shortCrossLine(r.tf1d, 'Günlük', r.price);
    if (cross) parts.push(cross);
  }

  // 2) Gün hareketi — bugünün momentumunu kısa vade ile birlikte oku
  const move = dailyMoveLine(r.changePct);
  if (move) parts.push(move);

  // 3) SONRA ANA TREND — EMA 55 (orta vade) ve EMA 200 (uzun vade / piyasa rejimi)
  const sma200 = r.tf1d?.emaValues?.[200];
  const sma55 = r.tf1d?.emaValues?.[55];
  const regime = r.marketRegime ?? computeMarketRegime(r.price, sma200);
  const trend = r.priceTrend ?? computePriceTrend(r.price, sma55);
  parts.push(mainDirectionLine(r.price, regime, trend, sma200, sma55));

  // 4) TF coherence — 1H/4H/Günlük uyumu (kısa-orta-uzun)
  const coherence = trendCoherenceLine(r.tf1h?.trend, r.tf4h?.trend, r.tf1d?.trend);
  if (coherence) parts.push(coherence);

  // 5) Aksiyon önerisi — kombinasyonlara göre net giriş/çıkış ipucu
  parts.push(actionHintLine(r.tf1h?.trend, r.tf4h?.trend, r.tf1d?.trend, r.bigPlayerLean, r.tf1d?.emaValues));

  return parts.join(' ');
}
