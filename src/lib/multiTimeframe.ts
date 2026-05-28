/**
 * Çoklu zaman dilimli trend analizi
 *
 * Her sembol için 3 zaman diliminde (1h, 4h, 1d) EMA bazlı long/short yön belirler.
 * Büyük oyuncu eğilimini de MACD + EMA200 pozisyonu üzerinden hesaplar.
 */

import { ema, macd, type OHLC } from './indicators';
import type { OhlcvBar } from '@/data/api/yahoo';

export type Trend = 'long' | 'short' | 'neutral';

/** Genel piyasa rejimi — Fiyatın Günlük EMA 200'e göre konumu */
export type MarketRegime = 'bull' | 'bear' | 'unknown';

/** Ana yön — Fiyatın Günlük EMA 55'e göre konumu (kısa-orta vade) */
export type PriceTrend = 'up' | 'down' | 'sideways';

export interface TimeframeAnalysis {
  trend: Trend;
  /** EMA dizilim notu (kaç EMA üstte) */
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
  /** EMA 200 üstü → bull, altı → bear (Günlük). Verilmezse buildVerdict günlük EMA'lardan otomatik türetir. */
  marketRegime?: MarketRegime;
  /** EMA 55 üstü → up, altı → down (Günlük). Verilmezse buildVerdict günlük EMA'lardan otomatik türetir. */
  priceTrend?: PriceTrend;
  verdict: string;
}

/**
 * Günlük EMA 200'e göre boğa/ayı piyasası belirle.
 * Sade ve net — kullanıcıya "ana yönde" ne olduğunu anında bildirir.
 */
export function computeMarketRegime(price: number, ema200Daily: number | undefined): MarketRegime {
  if (!Number.isFinite(ema200Daily) || !Number.isFinite(price)) return 'unknown';
  // EMA 200'e %0.5'ten yakınsa "unknown" — çok marjinal pozisyon karışıklık yaratır
  const margin = (ema200Daily as number) * 0.005;
  if (price > (ema200Daily as number) + margin) return 'bull';
  if (price < (ema200Daily as number) - margin) return 'bear';
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
  const ema200 = ema(closes, 200).at(-1);
  const macdR = macd(closes);
  const histLast = macdR.histogram.at(-1) ?? 0;
  const histPrev = macdR.histogram.at(-2) ?? 0;

  if (!Number.isFinite(ema200)) return 'kararsız';
  const above200 = last > (ema200 as number);
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
 * Kısa vade kesişim sinyali — günlükte EMA 5 ile EMA 8'in pozisyonu kısa vade
 * yön belirleyicisidir. Fresh cross (bir önceki barda diğer taraftaydı, bugün
 * tersine geçti) çok güçlü bir sinyal; sade pozisyon ise momentum bilgisi.
 *
 * - EMA 5 yukarı kesişim → güçlü LONG sinyali (20 Kasım, 6 Ocak gibi noktalar)
 * - EMA 5 aşağı kesişim  → güçlü SHORT sinyali
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
  const wasAbove = Number.isFinite(e5p) && Number.isFinite(e8p) && e5p > e8p;
  const wasBelow = Number.isFinite(e5p) && Number.isFinite(e8p) && e5p < e8p;

  // Fresh bull cross — bugün yukarı kesişti, güçlü LONG sinyali
  if (above && wasBelow) {
    return `${tfLabel} EMA 5 (${ema5Str}) bugün EMA 8 (${ema8Str}) ÜSTÜNE KESTİ — kısa vade güçlü LONG sinyali, momentum yukarı dönüyor.`;
  }

  // Fresh bear cross — bugün aşağı kesişti, güçlü SHORT sinyali
  if (!above && wasAbove) {
    return `${tfLabel} EMA 5 (${ema5Str}) bugün EMA 8 (${ema8Str}) ALTINA KESTİ — kısa vade güçlü SHORT sinyali, momentum aşağı dönüyor.`;
  }

  // Position only (no fresh cross)
  if (above) {
    return `${tfLabel} EMA 5 (${ema5Str}), EMA 8 (${ema8Str}) üstünde — kısa vade yukarı momentum sürüyor; aşağı kesişime kadar long taraf bozulmadı.`;
  }
  return `${tfLabel} EMA 5 (${ema5Str}), EMA 8 (${ema8Str}) altında — kısa vade aşağı momentum sürüyor; yukarı kesişim olmadan kalıcı long beklenmez.`;
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
  ema200?: number,
  ema55?: number,
): string {
  const ema200Str = Number.isFinite(ema200) ? fmtPrice(ema200 as number) : null;
  const ema55Str = Number.isFinite(ema55) ? fmtPrice(ema55 as number) : null;

  const regimePart = regime === 'bull'
    ? `Günlük EMA 200${ema200Str ? ` (${ema200Str})` : ''} üstünde — **BOĞA PİYASASI** içindeyiz`
    : regime === 'bear'
      ? `Günlük EMA 200${ema200Str ? ` (${ema200Str})` : ''} altında — **AYI PİYASASI** içindeyiz`
      : `Günlük EMA 200${ema200Str ? ` (${ema200Str})` : ''} civarında — piyasa rejimi belirsiz`;

  const trendPart = trend === 'up'
    ? `ve EMA 55${ema55Str ? ` (${ema55Str})` : ''} üstünde olduğu için **YÜKSELİŞ TRENDİ** sürüyor.`
    : trend === 'down'
      ? `ve EMA 55${ema55Str ? ` (${ema55Str})` : ''} altında olduğu için **DÜŞÜŞ TRENDİ** baskın.`
      : `, EMA 55${ema55Str ? ` (${ema55Str})` : ''} civarında yatay seyir.`;

  // Çelişki: bull ama down? Bunu da yumuşat
  if (regime === 'bull' && trend === 'down') {
    return `Günlük EMA 200${ema200Str ? ` (${ema200Str})` : ''} üstünde — uzun vadeli **BOĞA PİYASASI** korunuyor, ama EMA 55${ema55Str ? ` (${ema55Str})` : ''} altına sarkma var — kısa vadeli **düzeltme** dalgası.`;
  }
  if (regime === 'bear' && trend === 'up') {
    return `Günlük EMA 200${ema200Str ? ` (${ema200Str})` : ''} altında — **AYI PİYASASI** sürüyor, ama EMA 55${ema55Str ? ` (${ema55Str})` : ''} üstüne çıkış var — kısa vadeli **toparlanma** denemesi.`;
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
    if (lean === 'satıcı') return 'Aksiyon önerisi: Trend dönüşü işareti yok — long pozisyon açma; mevcut shortlar korunuyor, kısa EMA üstüne çıkış olmadan dönüş beklenmez.';
    return 'Aksiyon önerisi: Aşağı yönlü baskı sürüyor ama kurumsal satıcı görünmüyor — kenarda durmak ya da çok küçük long denemeleri tercih edilebilir, agresif short riskli.';
  }
  if (t1d === 'long' && (t1h === 'short' || t4h === 'short')) {
    return `Aksiyon önerisi: Ana trend yukarı, kısa vadeli geri çekilmede long fırsatı aranabilir — günlük EMA 21${ema21Str} destek bölgesi olarak takip; altına sarkma risk işareti.`;
  }
  if (t1d === 'short' && (t1h === 'long' || t4h === 'long')) {
    return `Aksiyon önerisi: Ana trend aşağı, kısa vadeli sıçramalar satış fırsatı; günlük EMA 55${ema55Str} üstüne çıkmadan kalıcı trend dönüşü beklenmez.`;
  }
  if (lean === 'alıcı') return 'Aksiyon önerisi: Yön karışık ama kurumsal alıcı eğilimi var — sabırlı ol, net teyit (4H/Günlük long) gelince pozisyon büyüt.';
  if (lean === 'satıcı') return 'Aksiyon önerisi: Yön karışık ve kurumsal satıcı tarafta — alımdan kaçın, kenarda dur ya da çok küçük taktik shortlar dene.';
  return 'Aksiyon önerisi: Yön karışık + kurumsal kararsız — net sinyal oluşmadan agresif giriş riskli; range stratejisi (destek alımı + direnç satışı) tercih edilebilir.';
}

/**
 * Multi-timeframe sonucundan zengin Türkçe verdict üret.
 *
 * Sıralama (önemden niceliğe):
 *   1) ANA YÖN — Boğa/Ayı + Yükseliş/Düşüş (EMA 200 + EMA 55 odaklı)
 *   2) Büyük oyuncu özeti
 *   3) Gün hareketi karakteri
 *   4) Zaman dilimi tutarlılığı (1H/4H/Günlük long-short uyum)
 *   5) Net aksiyon ipucu
 *   6) EMA 5/8/13/21 detayı — yalnızca momentum nüansı için, sonda
 */
export function buildVerdict(r: Omit<MultiTimeframeResult, 'verdict'>): string {
  const parts: string[] = [];

  // marketRegime/priceTrend verilmemişse günlük EMA'lardan otomatik türet — eski çağrı yerleri bozulmasın
  const regime: MarketRegime = r.marketRegime ?? computeMarketRegime(r.price, r.tf1d?.emaValues[200]);
  const trend: PriceTrend = r.priceTrend ?? computePriceTrend(r.price, r.tf1d?.emaValues[55]);

  // 1) ANA YÖN — en önemli bilgi başta
  const main = mainDirectionLine(
    r.price,
    regime,
    trend,
    r.tf1d?.emaValues[200],
    r.tf1d?.emaValues[55],
  );
  parts.push(main);

  // 2) Büyük oyuncu
  parts.push(bigPlayerLine(r.bigPlayerLean));

  // 3) Gün hareketi
  const move = dailyMoveLine(r.changePct);
  if (move) parts.push(move);

  // 4) TF coherence
  const coherence = trendCoherenceLine(r.tf1h?.trend, r.tf4h?.trend, r.tf1d?.trend);
  if (coherence) parts.push(coherence);

  // 5) Aksiyon
  parts.push(actionHintLine(r.tf1h?.trend, r.tf4h?.trend, r.tf1d?.trend, r.bigPlayerLean, r.tf1d?.emaValues));

  // 6) EMA 5/8 kesişim sinyali — kısa vade yön belirleyicisi
  const focusTf = r.tf1d ?? r.tf4h ?? r.tf1h;
  const focusLabel = r.tf1d ? 'Günlük' : r.tf4h ? '4 saatlik' : '1 saatlik';
  if (focusTf) {
    const cross = shortCrossLine(focusTf, focusLabel);
    if (cross) parts.push(cross);
  }

  return parts.join(' ');
}
