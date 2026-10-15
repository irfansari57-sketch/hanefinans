/**
 * Sinyal kütüphanesi — Sinyal Motoru Hafta 3 (15 Eki 2026).
 *
 * Girdi: günlük OHLCV barları (eski → yeni, KAPANMIŞ barlar) + isteğe bağlı endeks
 * rejimi. Çıktı: tanımlı kurallardan geçen "teknik durumlar". Her sinyal:
 *   - kural adı ve YÖN (yukarı / aşağı / uyarı) — al/sat DİLİ KULLANILMAZ (SPK)
 *   - güç 1-3 (kuralın ne kadar net sağlandığı, tahmin değil)
 *   - kanıt satırları (hangi sayı hangi eşiği geçti)
 *   - rejim uyumu: endeks rejimiyle aynı yönde mi (uyumlu / karşı / nötr)
 *
 * Eşikler görünür ve sabittir (SIGNAL_THRESHOLDS). Kurallar standart tanımlardır;
 * geriye dönük performans iddiası YOKTUR — Kanıt Defteri (Hafta 5) ölçecek.
 */
import { sma, rsi, macd } from './indicators';
import type { TrendRegime } from './regime';

export interface Bar { date: string; open: number; high: number; low: number; close: number; volume: number }

export type SignalKind =
  | 'momentum'        // kapanış > SMA20 > SMA50, RSI 55-70, 20g getiri > 0
  | 'kirilim'         // 20g en yüksek üstünde kapanış + hacim teyidi
  | 'hacim-patlamasi' // hacim ≥ 3× 20g ort. ve |değişim| ≥ %3
  | 'asiri-satim-donusu' // RSI 30 altından yukarı dönüş
  | 'asiri-alim'      // RSI > 75 (uyarı)
  | 'macd-kesisim'    // MACD sinyal çizgisini son 3 barda kesti
  | '52h-yakin';      // 52 haftalık zirveye ≤ %2

export type SignalDirection = 'yukarı' | 'aşağı' | 'uyarı';
export type RegimeFit = 'uyumlu' | 'karşı' | 'nötr';

export interface SignalEvidence { label: string; value: string; source?: string }

export interface Signal {
  kind: SignalKind;
  title: string;
  direction: SignalDirection;
  strength: 1 | 2 | 3;
  asOfDate: string;
  evidence: SignalEvidence[];
  regimeFit: RegimeFit;
}

export const SIGNAL_THRESHOLDS = {
  minBars: 60,
  momentumRsiLow: 55,
  momentumRsiHigh: 70,
  breakoutLookback: 20,
  breakoutVolMult: 1.5,
  volumeSpikeMult: 3,
  volumeSpikeMinMovePct: 3,
  oversold: 30,
  overbought: 75,
  macdLookbackBars: 3,
  near52wPct: 2,
} as const;

export const SIGNAL_LABELS: Record<SignalKind, string> = {
  momentum: 'Momentum',
  kirilim: '20 günlük kırılım',
  'hacim-patlamasi': 'Hacim patlaması',
  'asiri-satim-donusu': 'Aşırı satımdan dönüş',
  'asiri-alim': 'Aşırı alım bölgesi',
  'macd-kesisim': 'MACD kesişimi',
  '52h-yakin': '52 haftalık zirveye yakın',
};

const f2 = (v: number) => v.toFixed(2);
const fmtN = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 2 });

function fit(direction: SignalDirection, indexTrend?: TrendRegime | null): RegimeFit {
  if (!indexTrend || direction === 'uyarı') return 'nötr';
  if (indexTrend === 'yatay') return 'nötr';
  const up = direction === 'yukarı';
  return (up && indexTrend === 'yükseliş') || (!up && indexTrend === 'düşüş') ? 'uyumlu' : 'karşı';
}

/** Tüm kuralları tek seferde değerlendirir. Veri yetersizse boş dizi döner (hata değil). */
export function evaluateSignals(bars: Bar[], indexTrend?: TrendRegime | null, src = 'bars_daily'): Signal[] {
  const n = bars.length;
  if (n < SIGNAL_THRESHOLDS.minBars) return [];
  const closes = bars.map((b) => b.close);
  const vols = bars.map((b) => b.volume ?? 0);
  const last = bars[n - 1];
  const prev = bars[n - 2];
  const asOfDate = last.date;
  const out: Signal[] = [];

  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const r = rsi(closes, 14);
  const rsiNow = r[n - 1];
  const rsiPrev = r[n - 2];
  const vol20 = sma(vols, 20);
  const avgVol = vol20[n - 2]; // bugünkü hacmi, önceki 20 günün ortalamasıyla kıyasla
  const ret20 = closes[n - 21] > 0 ? ((last.close - closes[n - 21]) / closes[n - 21]) * 100 : NaN;
  const dayChg = prev.close > 0 ? ((last.close - prev.close) / prev.close) * 100 : NaN;

  // 1) Momentum
  if (Number.isFinite(sma20[n - 1]) && Number.isFinite(sma50[n - 1]) && Number.isFinite(rsiNow)) {
    const ok = last.close > sma20[n - 1] && sma20[n - 1] > sma50[n - 1]
      && rsiNow >= SIGNAL_THRESHOLDS.momentumRsiLow && rsiNow <= SIGNAL_THRESHOLDS.momentumRsiHigh
      && ret20 > 0;
    if (ok) {
      const strength: 1 | 2 | 3 = ret20 >= 10 ? 3 : ret20 >= 5 ? 2 : 1;
      out.push({
        kind: 'momentum', title: SIGNAL_LABELS.momentum, direction: 'yukarı', strength, asOfDate,
        regimeFit: fit('yukarı', indexTrend),
        evidence: [
          { label: 'Kapanış > SMA20 > SMA50', value: `${fmtN(last.close)} > ${fmtN(sma20[n - 1])} > ${fmtN(sma50[n - 1])}`, source: src },
          { label: 'RSI(14)', value: f2(rsiNow), source: `${SIGNAL_THRESHOLDS.momentumRsiLow}–${SIGNAL_THRESHOLDS.momentumRsiHigh} bandı` },
          { label: '20 günlük getiri', value: `${ret20 >= 0 ? '+' : ''}${f2(ret20)}%` },
        ],
      });
    }
  }

  // 2) 20g kırılım + hacim teyidi
  {
    const lb = SIGNAL_THRESHOLDS.breakoutLookback;
    if (n > lb + 1) {
      let hi = -Infinity;
      for (let i = n - 1 - lb; i < n - 1; i++) hi = Math.max(hi, bars[i].high);
      const volOk = Number.isFinite(avgVol) && avgVol > 0 && last.volume >= avgVol * SIGNAL_THRESHOLDS.breakoutVolMult;
      if (last.close > hi && Number.isFinite(hi)) {
        const volMult = avgVol > 0 ? last.volume / avgVol : NaN;
        out.push({
          kind: 'kirilim', title: SIGNAL_LABELS.kirilim, direction: 'yukarı',
          strength: volOk ? (volMult >= 2.5 ? 3 : 2) : 1, asOfDate, regimeFit: fit('yukarı', indexTrend),
          evidence: [
            { label: `Önceki ${lb} gün en yüksek`, value: fmtN(hi), source: src },
            { label: 'Kapanış', value: fmtN(last.close) },
            { label: 'Hacim / 20g ort.', value: Number.isFinite(volMult) ? `${f2(volMult)}×` : '—', source: `teyit eşiği ${SIGNAL_THRESHOLDS.breakoutVolMult}×` },
          ],
        });
      }
    }
  }

  // 3) Hacim patlaması
  if (Number.isFinite(avgVol) && avgVol > 0 && Number.isFinite(dayChg)) {
    const mult = last.volume / avgVol;
    if (mult >= SIGNAL_THRESHOLDS.volumeSpikeMult && Math.abs(dayChg) >= SIGNAL_THRESHOLDS.volumeSpikeMinMovePct) {
      const direction: SignalDirection = dayChg > 0 ? 'yukarı' : 'aşağı';
      out.push({
        kind: 'hacim-patlamasi', title: SIGNAL_LABELS['hacim-patlamasi'], direction,
        strength: mult >= 6 ? 3 : mult >= 4 ? 2 : 1, asOfDate, regimeFit: fit(direction, indexTrend),
        evidence: [
          { label: 'Hacim / 20g ort.', value: `${f2(mult)}×`, source: `eşik ${SIGNAL_THRESHOLDS.volumeSpikeMult}×` },
          { label: 'Günlük değişim', value: `${dayChg >= 0 ? '+' : ''}${f2(dayChg)}%`, source: `eşik ±${SIGNAL_THRESHOLDS.volumeSpikeMinMovePct}%` },
          { label: 'Hacim (lot)', value: last.volume.toLocaleString('tr-TR'), source: src },
        ],
      });
    }
  }

  // 4) Aşırı satımdan dönüş
  if (Number.isFinite(rsiNow) && Number.isFinite(rsiPrev)) {
    if (rsiPrev < SIGNAL_THRESHOLDS.oversold && rsiNow >= SIGNAL_THRESHOLDS.oversold && last.close > prev.close) {
      out.push({
        kind: 'asiri-satim-donusu', title: SIGNAL_LABELS['asiri-satim-donusu'], direction: 'yukarı',
        strength: rsiNow - rsiPrev >= 8 ? 3 : rsiNow - rsiPrev >= 4 ? 2 : 1, asOfDate, regimeFit: fit('yukarı', indexTrend),
        evidence: [
          { label: 'RSI(14) dün → bugün', value: `${f2(rsiPrev)} → ${f2(rsiNow)}`, source: `eşik ${SIGNAL_THRESHOLDS.oversold}` },
          { label: 'Kapanış dün → bugün', value: `${fmtN(prev.close)} → ${fmtN(last.close)}`, source: src },
        ],
      });
    }
    // 5) Aşırı alım uyarısı
    if (rsiNow > SIGNAL_THRESHOLDS.overbought) {
      out.push({
        kind: 'asiri-alim', title: SIGNAL_LABELS['asiri-alim'], direction: 'uyarı',
        strength: rsiNow >= 85 ? 3 : rsiNow >= 80 ? 2 : 1, asOfDate, regimeFit: 'nötr',
        evidence: [{ label: 'RSI(14)', value: f2(rsiNow), source: `eşik ${SIGNAL_THRESHOLDS.overbought}` }],
      });
    }
  }

  // 6) MACD kesişimi (son N bar)
  {
    const m = macd(closes);
    const lb = SIGNAL_THRESHOLDS.macdLookbackBars;
    for (let i = n - 1; i >= Math.max(1, n - lb); i--) {
      const h0 = m.histogram[i], h1 = m.histogram[i - 1];
      if (!Number.isFinite(h0) || !Number.isFinite(h1)) continue;
      if (h1 <= 0 && h0 > 0) {
        out.push({
          kind: 'macd-kesisim', title: `${SIGNAL_LABELS['macd-kesisim']} (yukarı)`, direction: 'yukarı',
          strength: i === n - 1 ? 2 : 1, asOfDate, regimeFit: fit('yukarı', indexTrend),
          evidence: [
            { label: 'Kesişim tarihi', value: bars[i].date, source: src },
            { label: 'MACD / sinyal', value: `${f2(m.macd[i])} / ${f2(m.signal[i])}` },
          ],
        });
        break;
      }
      if (h1 >= 0 && h0 < 0) {
        out.push({
          kind: 'macd-kesisim', title: `${SIGNAL_LABELS['macd-kesisim']} (aşağı)`, direction: 'aşağı',
          strength: i === n - 1 ? 2 : 1, asOfDate, regimeFit: fit('aşağı', indexTrend),
          evidence: [
            { label: 'Kesişim tarihi', value: bars[i].date, source: src },
            { label: 'MACD / sinyal', value: `${f2(m.macd[i])} / ${f2(m.signal[i])}` },
          ],
        });
        break;
      }
    }
  }

  // 7) 52h zirveye yakın
  if (n >= 200) {
    let hi = -Infinity;
    for (let i = Math.max(0, n - 252); i < n; i++) hi = Math.max(hi, bars[i].high);
    const dist = ((hi - last.close) / hi) * 100;
    if (Number.isFinite(dist) && dist <= SIGNAL_THRESHOLDS.near52wPct) {
      out.push({
        kind: '52h-yakin', title: SIGNAL_LABELS['52h-yakin'], direction: 'yukarı',
        strength: dist <= 0.5 ? 3 : dist <= 1 ? 2 : 1, asOfDate, regimeFit: fit('yukarı', indexTrend),
        evidence: [
          { label: '52h en yüksek', value: fmtN(hi), source: src },
          { label: 'Zirveye uzaklık', value: `%${f2(dist)}`, source: `eşik ≤ %${SIGNAL_THRESHOLDS.near52wPct}` },
        ],
      });
    }
  }

  return out;
}

/** Sinyal listesini tek satırlık özete çevirir (tablo/sekme için). */
export function summarizeSignals(sigs: Signal[]): string {
  if (sigs.length === 0) return 'Tanımlı kurallardan geçen sinyal yok';
  return sigs.map((s) => `${s.title}${s.regimeFit === 'karşı' ? ' (rejime karşı)' : ''}`).join(' · ');
}
