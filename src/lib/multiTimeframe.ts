/**
 * Çoklu zaman dilimli trend analizi
 *
 * Her sembol için 3 zaman diliminde (1h, 4h, 1d) EMA bazlı long/short yön belirler.
 * Büyük oyuncu eğilimini de MACD + EMA200 pozisyonu üzerinden hesaplar.
 */

import { ema, macd, type OHLC } from './indicators';
import type { OhlcvBar } from '@/data/api/yahoo';

export type Trend = 'long' | 'short' | 'neutral';

export interface TimeframeAnalysis {
  trend: Trend;
  /** EMA dizilim notu (kaç EMA üstte) */
  emaScore: number;
  /** Hangi periyotlar fiyat üzerinde */
  emasAbove: number[];
  /** Hangi periyotlar fiyat altında */
  emasBelow: number[];
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
  verdict: string;
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

  const emaValues = periods.map((p) => ({
    period: p,
    value: ema(closes, p).at(-1) ?? NaN,
  }));

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

  return { trend, emaScore: emasAbove.length, emasAbove, emasBelow };
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
 * EMA dizilimi okuması: hangi periyotlar üstte/altta + bunun anlamı.
 */
function emaStructureLine(ta: TimeframeAnalysis, tfLabel: string): string {
  const total = ta.emasAbove.length + ta.emasBelow.length;
  if (total === 0) return '';
  const aboveStr = ta.emasAbove.length > 0 ? ta.emasAbove.join('/') : '—';
  const belowStr = ta.emasBelow.length > 0 ? ta.emasBelow.join('/') : '—';

  if (ta.trend === 'long') {
    if (ta.emasBelow.length === 0) {
      return `${tfLabel} EMA dizilimi: fiyat tüm EMA'ların (${aboveStr}) üzerinde — destek katmanları sağlam, dip kademesi geniş.`;
    }
    return `${tfLabel} EMA dizilimi: fiyat ${ta.emasAbove.length}/${total} EMA'nın üstünde (üstte: ${aboveStr}; altta: ${belowStr}) — yukarı yönlü baskın ama tam dizilim henüz oturmamış.`;
  }

  if (ta.trend === 'short') {
    if (ta.emasAbove.length === 0) {
      return `${tfLabel} EMA dizilimi: fiyat tüm EMA'ların (${belowStr}) altında — direnç katmanları üst üste, toparlanmaya geçilemiyor.`;
    }
    return `${tfLabel} EMA dizilimi: fiyat ${ta.emasBelow.length}/${total} EMA'nın altında (altta: ${belowStr}; üstte: ${aboveStr}) — aşağı yönlü baskı; sadece kısa EMA'lar üstte kaldığı için kalıcı dönüş için daha güç gerek.`;
  }

  return `${tfLabel} EMA dizilimi karışık (üstte EMA ${aboveStr}, altta ${belowStr}) — kümeleşme yok, net trend yok.`;
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

/** Büyük oyuncu eğilimini açıkla. */
function bigPlayerLine(lean: 'alıcı' | 'satıcı' | 'kararsız'): string {
  if (lean === 'alıcı')   return 'Büyük oyuncular ALICI tarafta (fiyat EMA 200 üstünde + MACD pozitif) — kurumsal birikim sinyali, dipler korunuyor.';
  if (lean === 'satıcı') return 'Büyük oyuncular SATICI tarafta (fiyat EMA 200 altında + MACD negatif) — pozisyon küçültme / dağıtım eğilimi, tepe satışları gözleniyor.';
  return 'Kurumsal eğilim kararsız — büyük oyuncu net pozisyon almıyor, gözlem modu.';
}

/** Trend + büyük oyuncu kombinasyonuna göre net aksiyon ipucu. */
function actionHintLine(
  t1h: Trend | undefined,
  t4h: Trend | undefined,
  t1d: Trend | undefined,
  lean: 'alıcı' | 'satıcı' | 'kararsız',
): string {
  if (t1h === 'long' && t4h === 'long' && t1d === 'long') {
    if (lean === 'alıcı') return 'Aksiyon önerisi: Long pozisyon momentum yönünde — kâr al hedefleri trailing stop ile yönetilebilir; geri çekilmeler alım fırsatı.';
    return 'Aksiyon önerisi: Long trend güçlü ama kurumsal teyit zayıf — riski sıkı stop ile yönet, hızlı kâr realizasyonu mantıklı.';
  }
  if (t1h === 'short' && t4h === 'short' && t1d === 'short') {
    if (lean === 'satıcı') return 'Aksiyon önerisi: Trend dönüşü işareti yok — long pozisyon açma; mevcut shortlar korunuyor, kısa EMA üstüne çıkış olmadan dönüş beklenmez.';
    return 'Aksiyon önerisi: Aşağı yönlü baskı sürüyor ama kurumsal satıcı görünmüyor — kenarda durmak ya da çok küçük long denemeleri tercih edilebilir, agresif short riskli.';
  }
  if (t1d === 'long' && (t1h === 'short' || t4h === 'short')) {
    return 'Aksiyon önerisi: Ana trend yukarı, kısa vadeli geri çekilmede long fırsatı aranabilir — günlük EMA 21 destek bölgesi olarak takip; altına sarkma risk işareti.';
  }
  if (t1d === 'short' && (t1h === 'long' || t4h === 'long')) {
    return 'Aksiyon önerisi: Ana trend aşağı, kısa vadeli sıçramalar satış fırsatı; günlük EMA 55 üstüne çıkmadan kalıcı trend dönüşü beklenmez.';
  }
  if (lean === 'alıcı') return 'Aksiyon önerisi: Yön karışık ama kurumsal alıcı eğilimi var — sabırlı ol, net teyit (4H/Günlük long) gelince pozisyon büyüt.';
  if (lean === 'satıcı') return 'Aksiyon önerisi: Yön karışık ve kurumsal satıcı tarafta — alımdan kaçın, kenarda dur ya da çok küçük taktik shortlar dene.';
  return 'Aksiyon önerisi: Yön karışık + kurumsal kararsız — net sinyal oluşmadan agresif giriş riskli; range stratejisi (destek alımı + direnç satışı) tercih edilebilir.';
}

/**
 * Multi-timeframe sonucundan zengin Türkçe verdict üret.
 *
 * 5 cümle: (1) trend coherence (2) günlük EMA dizilimi detayı
 * (3) gün hareketi karakteri (4) büyük oyuncu yorumu (5) net aksiyon ipucu.
 */
export function buildVerdict(r: Omit<MultiTimeframeResult, 'verdict'>): string {
  const parts: string[] = [];

  const coherence = trendCoherenceLine(r.tf1h?.trend, r.tf4h?.trend, r.tf1d?.trend);
  if (coherence) parts.push(coherence);

  const focusTf = r.tf1d ?? r.tf4h ?? r.tf1h;
  const focusLabel = r.tf1d ? 'Günlük' : r.tf4h ? '4 saatlik' : '1 saatlik';
  if (focusTf) {
    const ema = emaStructureLine(focusTf, focusLabel);
    if (ema) parts.push(ema);
  }

  const move = dailyMoveLine(r.changePct);
  if (move) parts.push(move);

  parts.push(bigPlayerLine(r.bigPlayerLean));
  parts.push(actionHintLine(r.tf1h?.trend, r.tf4h?.trend, r.tf1d?.trend, r.bigPlayerLean));

  return parts.join(' ');
}
