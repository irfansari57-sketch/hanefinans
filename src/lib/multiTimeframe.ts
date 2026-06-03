/**
 * Çoklu zaman dilimli trend analizi
 *
 * Her sembol için 3 zaman diliminde (1h, 4h, 1d) MA (basit hareketli ortalama) bazlı
 * long/short yön belirler. MA periyotları: 5, 8, 13, 21, 55, 200 (Fibonacci).
 * 5-8-13 kesişimi kısa vade al sinyali; fiyat 8 MA üstü öncü pozitif sinyal.
 * Büyük oyuncu eğilimini MACD + MA200 pozisyonu üzerinden hesaplar.
 */

import { sma, macd, type OHLC } from './indicators';
import type { OhlcvBar } from '@/data/api/yahoo';

export type Trend = 'long' | 'short' | 'neutral';

/** Genel piyasa rejimi — Fiyatın Günlük MA 200'e göre konumu */
export type MarketRegime = 'bull' | 'bear' | 'unknown';

/** Ana yön — Fiyatın Günlük MA 55'e göre konumu (kısa-orta vade) */
export type PriceTrend = 'up' | 'down' | 'sideways';

export interface TimeframeAnalysis {
  trend: Trend;
  /** MA dizilim notu (kaç MA üstte) */
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
 * Günlük MA 200'e göre boğa/ayı piyasası belirle.
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
 * Günlük MA 55'e göre kısa-orta vade trend belirle.
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
 * Verilen closes dizisinden MA dizilimi → trend hesabı
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
    const series = sma(closes, p);
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
  const sma200 = sma(closes, 200).at(-1);
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

  if (longCount === 3) return 'Tüm zaman dilimleri (1H/4H/Günlük) LONG yönlü — güçlü ve tutarlı yukarı yönlü trend, üç vade de aynı tarafta.';
  if (shortCount === 3) return 'Tüm zaman dilimleri (1H/4H/Günlük) SHORT yönlü — güçlü ve tutarlı aşağı yönlü baskı, satıcı tüm vadelerde hakim.';

  if (longCount === 2 && shortCount === 0) return 'İki zaman dilimi LONG, biri nötr — yukarı yönlü eğilim hakim ama tüm vadelerde teyit yok.';
  if (shortCount === 2 && longCount === 0) return 'İki zaman dilimi SHORT, biri nötr — aşağı yönlü baskı yaygın ama bir vadede kararsızlık var.';

  if (longCount === 1 && shortCount === 1) {
    if (t1d === 'long' && t1h === 'short') return 'Günlük LONG ama 1H SHORT — orta vadeli yükseliş trendi içinde kısa vadeli geri çekilme / düzeltme dalgası.';
    if (t1d === 'short' && t1h === 'long') return 'Günlük SHORT ama 1H LONG — orta vadeli düşüş trendi içinde kısa vadeli teknik sıçrama denemesi.';
    if (t4h === 'long' && t1h === 'short') return '4H LONG ama 1H SHORT — kısa vadeli aşağı yönlü düzeltme, 4H trend hâlâ pozitif.';
    if (t4h === 'short' && t1h === 'long') return '4H SHORT ama 1H LONG — kısa vadeli toparlanma denemesi, ana trend hâlâ negatif.';
    return 'Zaman dilimleri arasında uyumsuzluk var (bir LONG, bir SHORT, bir nötr) — yön belirsiz.';
  }

  if (longCount === 1) return 'Sadece bir zaman diliminde LONG sinyali, diğerleri nötr — trend henüz teyit edilmedi.';
  if (shortCount === 1) return 'Sadece bir zaman diliminde SHORT sinyali, diğerleri nötr — düşüş henüz yaygınlaşmadı.';
  return 'Tüm zaman dilimleri nötr — net yön yok, yatay (range) hareket baskın.';
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
    return 'Piyasa kapalı (hafta sonu) — son işlem günü Cuma kapanışı değerlendirmesi:';
  }

  // Açılış öncesi
  if (hour < 10) {
    return 'Açılış öncesi — gece offshore hareketleri ve Asya seansı dikkate alınarak:';
  }
  // Açılış-öğle (10:00-12:30)
  if (hour < 12 || (hour === 12 && min < 30)) {
    return 'Gün başı — açılış momentumu ve ilk seans yönü:';
  }
  // Öğle ortası (12:30-15:00)
  if (hour < 15) {
    return 'Gün ortası — sabah hareketinin testi, ABD verisi yaklaşıyor:';
  }
  // Kapanış öncesi (15:00-18:00)
  if (hour < 18) {
    return 'Gün sonu — kapanış öncesi pozisyon ayarı, hacim artışı:';
  }
  // Kapanış sonrası
  return 'Piyasa kapalı — bugünkü kapanış sonrası yarın açılışa hazırlık:';
}

/**
 * Üçlü MA dizilim sinyali — 5-8-13 birlikte yukarı kesişimi güçlü AL sinyali.
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
    return `${tfLabel} MA 5 > MA 8 > MA 13 ÜÇLÜ AL SİNYALİ taze oluştu — kısa vade güçlü yukarı dizilim, momentum tetiklendi.`;
  }

  // Üçlü düşüş: 5<8<13 ve önceki barda 5≥8
  const bearStack = v5 < v8 && v8 < v13;
  const wasNotBear = Number.isFinite(v5p) && Number.isFinite(v8p) &&
                     !((v5p as number) < (v8p as number));
  if (bearStack && wasNotBear) {
    return `${tfLabel} MA 5 < MA 8 < MA 13 ÜÇLÜ SAT SİNYALİ taze oluştu — kısa vade güçlü aşağı dizilim, momentum aşağı döndü.`;
  }

  if (bullStack && above8) {
    return `${tfLabel} fiyat MA 8 üstünde + üçlü dizilim (5>8>13) korunuyor — öncü pozitif: haber öncesi giriş için uygun konum.`;
  }
  if (bearStack) {
    return `${tfLabel} üçlü aşağı dizilim (5<8<13) sürüyor — yukarı tepki için 5/8 kesişimi beklenmeli.`;
  }
  return '';
}

/**
 * Kısa vade kesişim sinyali — günlükte MA 5 ile MA 8'in pozisyonu kısa vade
 * yön belirleyicisidir. Fresh cross (bir önceki barda diğer taraftaydı, bugün
 * tersine geçti) çok güçlü bir sinyal; sade pozisyon ise momentum bilgisi.
 *
 * - MA 5 yukarı kesişim → güçlü LONG sinyali (20 Kasım, 6 Ocak gibi noktalar)
 * - MA 5 aşağı kesişim  → güçlü SHORT sinyali
 */
function shortCrossLine(ta: TimeframeAnalysis, tfLabel: string): string {
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
    return `${tfLabel} MA 5 (${ema5Str}) bugün MA 8 (${ema8Str}) ÜSTÜNE KESTİ — kısa vade GÜÇLÜ LONG sinyali, kısa periyot pozisyon için uygun pencere açıldı.`;
  }

  // Fresh bear cross — bugün aşağı kesişti, güçlü SHORT sinyali
  if (!above && wasAbove) {
    return `${tfLabel} MA 5 (${ema5Str}) bugün MA 8 (${ema8Str}) ALTINA KESTİ — kısa vade GÜÇLÜ SHORT sinyali, long pozisyonlardan çıkış uyarısı; momentum aşağı dönüyor.`;
  }

  // Position only (no fresh cross)
  if (above) {
    return `${tfLabel} MA 5 (${ema5Str}), MA 8 (${ema8Str}) üstünde — kısa vade yukarı momentum sürüyor, mevcut long taraf korunuyor; aşağı kesişim olmadan trend bozulmaz.`;
  }
  // MA 5 MA 8 altında — aktif düşüş trendinde kullanıcıyı net uyar
  return `${tfLabel} MA 5 (${ema5Str}), MA 8 (${ema8Str}) ALTINDA — kısa vade aşağı trend aktif. ⚠️ Long pozisyon için günlük MA 5'in MA 8 üstüne kesişimi beklenmeli; bu pencerede long açmak yatırımcıyı zarara sokabilir.`;
}

/** Günün hareket büyüklüğüne göre karakter notu. */
function dailyMoveLine(changePct: number): string {
  if (!Number.isFinite(changePct)) return '';
  const sign = changePct >= 0 ? '+' : '';
  const abs = Math.abs(changePct);
  const word = changePct >= 0 ? 'alıcı' : 'satıcı';
  if (abs < 0.2) return `Bugünkü değişim ${sign}${changePct.toFixed(2)}% — sakin seyir, hacim ve istek sınırlı.`;
  if (abs < 0.7) return `Bugünkü değişim ${sign}${changePct.toFixed(2)}% — ılımlı ${word} ilgisi, momentum henüz oluşmadı.`;
  if (abs < 1.5) return `Bugünkü değişim ${sign}${changePct.toFixed(2)}% — belirgin ${word} baskısı, kısa vadeli yön netleşiyor.`;
  if (abs < 3)   return `Bugünkü değişim ${sign}${changePct.toFixed(2)}% — güçlü ${word} hareketi, momentum aktif.`;
  return `Bugünkü değişim ${sign}${changePct.toFixed(2)}% — agresif ${word} dalgası, volatilite yüksek; ani tersine dönüşlere dikkat.`;
}

/** Büyük oyuncu eğilimini açıkla — sade, net yön. */
function bigPlayerLine(lean: 'alıcı' | 'satıcı' | 'kararsız'): string {
  if (lean === 'alıcı')   return 'Büyük oyuncular ALICI tarafta — kurumsal birikim sinyali.';
  if (lean === 'satıcı') return 'Büyük oyuncular SATICI tarafta — dağıtım / pozisyon küçültme eğilimi.';
  return 'Kurumsal taraf net pozisyon almıyor — yön belirsiz.';
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
    ? `Günlük MA 200${sma200Str ? ` (${sma200Str})` : ''} üstünde — **BOĞA PİYASASI** içindeyiz`
    : regime === 'bear'
      ? `Günlük MA 200${sma200Str ? ` (${sma200Str})` : ''} altında — **AYI PİYASASI** içindeyiz`
      : `Günlük MA 200${sma200Str ? ` (${sma200Str})` : ''} civarında — piyasa rejimi belirsiz`;

  const trendPart = trend === 'up'
    ? `ve MA 55${ema55Str ? ` (${ema55Str})` : ''} üstünde olduğu için **YÜKSELİŞ TRENDİ** sürüyor.`
    : trend === 'down'
      ? `ve MA 55${ema55Str ? ` (${ema55Str})` : ''} altında olduğu için **DÜŞÜŞ TRENDİ** baskın.`
      : `, MA 55${ema55Str ? ` (${ema55Str})` : ''} civarında yatay seyir.`;

  // Çelişki: bull ama down? Bunu da yumuşat
  if (regime === 'bull' && trend === 'down') {
    return `Günlük MA 200${sma200Str ? ` (${sma200Str})` : ''} üstünde — uzun vadeli **BOĞA PİYASASI** korunuyor, ama MA 55${ema55Str ? ` (${ema55Str})` : ''} altına sarkma var — kısa vadeli **düzeltme** dalgası.`;
  }
  if (regime === 'bear' && trend === 'up') {
    return `Günlük MA 200${sma200Str ? ` (${sma200Str})` : ''} altında — **AYI PİYASASI** sürüyor, ama MA 55${ema55Str ? ` (${ema55Str})` : ''} üstüne çıkış var — kısa vadeli **toparlanma** denemesi.`;
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
    if (lean === 'alıcı') return 'Aksiyon önerisi: Long pozisyon momentum yönünde — kâr al hedefleri trailing stop ile yönetilebilir; geri çekilmeler alım fırsatı.';
    return 'Aksiyon önerisi: Long trend güçlü ama kurumsal teyit zayıf — riski sıkı stop ile yönet, hızlı kâr realizasyonu mantıklı.';
  }
  if (t1h === 'short' && t4h === 'short' && t1d === 'short') {
    if (lean === 'satıcı') return 'Aksiyon önerisi: Trend dönüşü işareti yok — long pozisyon açma; mevcut shortlar korunuyor, kısa MA üstüne çıkış olmadan dönüş beklenmez.';
    return 'Aksiyon önerisi: Aşağı yönlü baskı sürüyor — long pozisyon riski yüksek, kısa MA kesişimi beklenmeli.';
  }
  if (lean === 'alıcı') return `Aksiyon önerisi: Karışık sinyaller ama kurumsal taraf alıcı — günlük MA 21${ema21Str} desteğinden bounce'lara öncelik verilebilir.`;
  if (lean === 'satıcı') return `Aksiyon önerisi: Karışık sinyaller + kurumsal satıcı — günlük MA 55${ema55Str} altına kalıcı geçişte short bias güçlenir.`;
  return 'Aksiyon önerisi: Yön karışık + kurumsal kararsız — net sinyal oluşmadan agresif giriş riskli; range stratejisi (destek alımı + direnç satışı) tercih edilebilir.';
}

/**
 * Tüm sinyalleri birleştirerek kullanıcıya 1 paragraflık net yorum üret.
 * Sıra: zaman bağlamı → ana yön → büyük oyuncu → üçlü MA dizilim → MA 5/8 → günlük hareket → TF coherence → aksiyon.
 */
export function buildVerdict(r: Omit<MultiTimeframeResult, 'verdict'>): string {
  const parts: string[] = [];

  // 0) Zaman bağlamı — gün başı/orta/sonu/kapalı
  parts.push(timeContextLine());

  // 1) ÖNCE KISA VADE — MA 5/8/13 üçlü dizilim ve fiyatın bunlara göre konumu.
  //    Kullanıcı talebi: günlük fiyat MA 5/8/13 önceliklendirilsin.
  if (r.tf1d) {
    const tri = triCrossLine(r.tf1d, 'Günlük', r.price);
    if (tri) parts.push(tri);
    const cross = shortCrossLine(r.tf1d, 'Günlük');
    if (cross) parts.push(cross);
  }

  // 2) Gün hareketi — bugünün momentumunu kısa vade ile birlikte oku
  const move = dailyMoveLine(r.changePct);
  if (move) parts.push(move);

  // 3) SONRA ANA TREND — MA 55 (orta vade) ve MA 200 (uzun vade / piyasa rejimi)
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
