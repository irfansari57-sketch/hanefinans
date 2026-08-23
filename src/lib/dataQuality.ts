/**
 * Data Quality Layer — merkezi veri doğrulama, güvenilirlik skorlama ve telemetri.
 *
 * Amaç: Yahoo Finance / TEFAS / Snapshot gibi tek kaynaklardan gelen verinin
 * yanıltıcı olmadığını doğrulamak. Bölünme/sermaye artırım/kupon kesintisi
 * sonrası snapshot prev_close yanlış kalabiliyor → -%10+ sahte düşüş oluşuyor.
 *
 * Katmanlar:
 *   1. validateStockQuote()  — hisse quote'unu doğrula, sapma tespiti
 *   2. validateFundData()    — TEFAS fon verisi sanity
 *   3. computeConfidence()   — 0-100 güvenilirlik skoru
 *   4. dqLog()               — telemetri (localStorage 24h buffer + backend flush)
 *
 * Kullanım:
 *   const dq = validateStockQuote({ price, changePct, prevClose }, historical);
 *   if (dq.corrected) { price = dq.corrected.price; changePct = dq.corrected.changePct; }
 *   dqLog('stock-quote', symbol, dq);
 */

// ============================================================================
// TIPLER
// ============================================================================

/** Veri güvenilirlik seviyesi — UI rozeti ve filtre için. */
export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'invalid';

export interface DataQualityResult {
  /** true = veri kullanilabilir, false = kullanma. */
  valid: boolean;
  /** 0-100 arasi guvenilirlik skoru. */
  confidence: number;
  /** UI rozeti icin seviye kategorisi. */
  level: ConfidenceLevel;
  /** Tespit edilen uyarilar (bos = temiz). */
  warnings: string[];
  /** Snapshot bozuksa duzeltilmis degerler (opsiyonel). */
  corrected?: {
    price?: number;
    changePct?: number;
    source?: string;
  };
  /** Log/dashboard icin ozgun anahtar. */
  key?: string;
}

export interface StockQuoteInput {
  symbol: string;
  price: number;
  changePct: number;
  prevClose?: number;
  updatedAt?: number;
  /** Historical bars son close'u — snapshot cross-check icin. */
  histLastClose?: number;
  /** Historical bars son bar tarihi (ms). Snapshot'tan >20 saat eski ise historical stale. */
  histLastDate?: number;
  /** Period returns 1G — snapshot cross-check icin. */
  period1G?: number;
}

export interface FundDataInput {
  code: string;
  nav?: number;
  navDate?: string;
  day?: number;
  week?: number;
  month?: number;
  historyLength?: number;
  tefasOpen?: boolean;
}

// ============================================================================
// SABITLER — piyasa kurallari
// ============================================================================

/** BIST günlük fiyat tavan yüzdesi (2026: %10). */
export const BIST_DAILY_LIMIT_PCT = 10;
/** Outlier eşiği: BIST tavan + küçük tolerans. */
export const BIST_OUTLIER_CAP_PCT = 11;
/** Snapshot ↔ period1G sapma eşiği (üstünde snapshot suspicious). */
export const SNAPSHOT_DEVIATION_THRESHOLD_PCT = 5;
/** Snapshot ↔ historical last close fiyat sapma eşiği. */
export const PRICE_DEVIATION_THRESHOLD_PCT = 3;
/** Stale timestamp eşiği (24 saat). */
export const STALE_MS = 24 * 60 * 60 * 1000;
/** Fund history minimum bar sayısı (haftalık için). */
export const MIN_FUND_HISTORY_BARS = 5;

// ============================================================================
// KATMAN 1: VALIDATORS
// ============================================================================

/**
 * Hisse quote'unu dogrula.
 * Cross-check icin historical bars son close ve period 1G opsiyonel.
 */
export function validateStockQuote(input: StockQuoteInput, isUS: boolean = false): DataQualityResult {
  const warnings: string[] = [];
  let confidence = 100;
  let corrected: DataQualityResult['corrected'] | undefined;

  // 1. Base sanity — fiyat pozitif olmalı.
  // Fiyat 0 ise historical last close'a düş (varsa) — emtia sembollerinde
  // (XAGUSD=X, XAUUSD=X) snapshot bazen price=0 doner ama historical dolu.
  if (!(input.price > 0)) {
    if (input.histLastClose != null && input.histLastClose > 0) {
      return {
        valid: true,
        confidence: 60,
        level: 'medium',
        warnings: ['Snapshot fiyatı boş, historical son kapanış kullanıldı.'],
        corrected: {
          price: input.histLastClose,
          changePct:
            input.period1G != null && Number.isFinite(input.period1G)
              ? input.period1G
              : 0,
          source: 'historical-price-zero-fallback',
        },
        key: input.symbol,
      };
    }
    return {
      valid: false,
      confidence: 0,
      level: 'invalid',
      warnings: ['Fiyat 0 veya negatif — feed bozuk.'],
      key: input.symbol,
    };
  }

  // 2. NaN/Infinity changePct
  if (!Number.isFinite(input.changePct)) {
    warnings.push('Değişim yüzdesi hesaplanamadı (NaN).');
    confidence -= 20;
  }

  // 3. Outlier: BIST için |change| > 11%
  const outlierCap = isUS ? 50 : BIST_OUTLIER_CAP_PCT;
  if (Math.abs(input.changePct) > outlierCap) {
    warnings.push(
      `Günlük değişim ${input.changePct.toFixed(2)}% — BIST tavan ${BIST_DAILY_LIMIT_PCT}% aşıldı. ` +
        `Bölünme/sermaye artırım/kupon kesintisi olasılığı yüksek.`,
    );
    confidence -= 40;
  }

  // MIMARI: Snapshot D1 cache'den (cron warmer), Historical Yahoo'dan direkt gelir.
  // Her ikisi de stale olabilir — hangisi daha taze ise ona güven:
  //   - Historical stale (>20h eski) + Snapshot fresh → Snapshot doğru (mevcut BIMAS DEĞİL)
  //   - Snapshot stale (>20h eski) + Historical fresh → Historical doğru (BIMAS Aug 22 senaryo)
  //   - Her ikisi fresh → cross-check yap
  //   - Her ikisi stale → ikisini de göster + uyar
  const STALE_MS = 20 * 60 * 60 * 1000;
  const now = Date.now();
  const snapshotAge = input.updatedAt ? now - input.updatedAt : 0;
  const histAge = input.histLastDate ? now - input.histLastDate : Infinity;
  const snapshotIsStale = input.updatedAt != null && snapshotAge > STALE_MS;
  const historicalIsStale = input.histLastDate != null && histAge > STALE_MS;
  // Snapshot historical'dan çok daha eski ise snapshot stale (bizim D1 cache miss senaryosu)
  const snapshotMuchOlder =
    input.updatedAt != null &&
    input.histLastDate != null &&
    snapshotAge - histAge > STALE_MS;
  // Historical snapshot'tan çok daha eski ise historical stale (hafta sonu senaryosu)
  const historicalMuchOlder =
    input.updatedAt != null &&
    input.histLastDate != null &&
    histAge - snapshotAge > STALE_MS;

  // KARAR: Snapshot stale ise historical'ı tercih et → BIMAS 410.75 → 416.50 fix
  if (snapshotMuchOlder && input.histLastClose != null && input.histLastClose > 0) {
    const staleHours = Math.floor(snapshotAge / (60 * 60 * 1000));
    warnings.push(
      `Snapshot verisi ${staleHours} saat eski — historical (Yahoo canlı) daha güncel, ona güvenildi.`,
    );
    confidence -= 30;
    corrected = {
      price: input.histLastClose,
      changePct:
        input.period1G != null && Number.isFinite(input.period1G)
          ? input.period1G
          : undefined,
      source: 'historical-fresher-than-snapshot',
    };
  }
  // KARAR: Historical stale, snapshot fresh (hafta sonu Cuma kapanış senaryosu)
  else if (historicalMuchOlder) {
    const days = Math.floor(histAge / (24 * 60 * 60 * 1000));
    if (days >= 1) {
      warnings.push(`Historical bars ${days} gün eski — snapshot canlı fiyata güvenildi.`);
    }
    // corrected uygulanmaz — snapshot değeri kullanılır (default davranış)
  }
  // KARAR: Her ikisi de fresh — normal cross-check
  else if (!snapshotIsStale && !historicalIsStale) {
    if (
      input.period1G != null &&
      Number.isFinite(input.period1G) &&
      Number.isFinite(input.changePct)
    ) {
      const snapDeviation = Math.abs(input.changePct - input.period1G);
      if (snapDeviation > SNAPSHOT_DEVIATION_THRESHOLD_PCT) {
        warnings.push(
          `Snapshot günlük (${input.changePct.toFixed(2)}%) ile period 1G (${input.period1G.toFixed(2)}%) arasında ` +
            `${snapDeviation.toFixed(1)}% sapma — snapshot muhtemelen bozuk.`,
        );
        confidence -= 35;
        corrected = {
          changePct: input.period1G,
          source: 'period-1g-historical',
        };
      }
    }
    if (input.histLastClose != null && input.histLastClose > 0) {
      const priceDev = (Math.abs(input.price - input.histLastClose) / input.histLastClose) * 100;
      if (priceDev > PRICE_DEVIATION_THRESHOLD_PCT) {
        warnings.push(
          `Snapshot fiyatı (${input.price.toFixed(2)}) historical son close (${input.histLastClose.toFixed(2)}) ` +
            `ile ${priceDev.toFixed(1)}% sapıyor — snapshot muhtemelen bozuk.`,
        );
        confidence -= 25;
        corrected = {
          ...(corrected ?? {}),
          price: input.histLastClose,
          source: 'historical-last-close',
        };
      }
    }
  }
  // KARAR: Her ikisi de stale — uyar ama düzeltme yok (elde başka referans yok)
  else if (snapshotIsStale && historicalIsStale) {
    const snapHours = Math.floor(snapshotAge / (60 * 60 * 1000));
    warnings.push(`Hem snapshot (${snapHours}h) hem historical eski — piyasa uzun süre kapalı.`);
    confidence -= 15;
  }

  // 6. Staleness — son 24 saat guncellenmediyse uyar
  if (input.updatedAt) {
    const age = Date.now() - input.updatedAt;
    if (age > STALE_MS) {
      const days = Math.floor(age / STALE_MS);
      warnings.push(`Veri ${days}+ gün eski — piyasa kapalı olabilir veya feed durmuş.`);
      confidence -= Math.min(20, days * 5);
    }
  }

  // 7. Prev close mantığı (0'sa change hesaplanmıyor demek)
  if (input.prevClose != null && input.prevClose === 0) {
    warnings.push('Önceki kapanış 0 — snapshot prev_close eksik.');
    confidence -= 15;
  }

  confidence = Math.max(0, Math.min(100, confidence));
  const level = confidenceToLevel(confidence);
  const valid = level !== 'invalid';

  return { valid, confidence, level, warnings, corrected, key: input.symbol };
}

/**
 * TEFAS fon verisini dogrula.
 */
export function validateFundData(input: FundDataInput): DataQualityResult {
  const warnings: string[] = [];
  let confidence = 100;

  if (input.nav != null && !(input.nav > 0)) {
    return {
      valid: false,
      confidence: 0,
      level: 'invalid',
      warnings: ['NAV değeri 0 veya negatif.'],
      key: input.code,
    };
  }

  // Historical veri yetersiz → haftalık hesaplanamaz
  if (input.historyLength != null && input.historyLength < MIN_FUND_HISTORY_BARS) {
    warnings.push(`Historical bar ${input.historyLength} < ${MIN_FUND_HISTORY_BARS} — haftalık hesaplama şüpheli.`);
    confidence -= 25;
  }

  // NAV date staleness (fon verisi max 7 gün eski olabilir hafta sonu için)
  if (input.navDate) {
    const navMs = new Date(input.navDate).getTime();
    const age = Date.now() - navMs;
    const maxAge = 7 * 24 * 60 * 60 * 1000;
    if (age > maxAge) {
      const days = Math.floor(age / (24 * 60 * 60 * 1000));
      warnings.push(`NAV tarihi ${days} gün eski — TEFAS feed durmuş olabilir.`);
      confidence -= Math.min(30, days * 5);
    }
  }

  // Fon getirileri makul aralıkta olmalı (günlük fon için ±%15 üzeri şüpheli)
  const returnChecks: Array<[string, number | undefined, number]> = [
    ['Günlük', input.day, 15],
    ['Haftalık', input.week, 30],
    ['Aylık', input.month, 60],
  ];
  for (const [label, value, cap] of returnChecks) {
    if (value != null && Number.isFinite(value) && Math.abs(value) > cap) {
      warnings.push(`${label} getiri ${value.toFixed(1)}% — fon için sıra dışı.`);
      confidence -= 15;
    }
  }

  confidence = Math.max(0, Math.min(100, confidence));
  const level = confidenceToLevel(confidence);
  return { valid: level !== 'invalid', confidence, level, warnings, key: input.code };
}

// ============================================================================
// KATMAN 2: CONFIDENCE HELPERS
// ============================================================================

export function confidenceToLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 80) return 'high';
  if (confidence >= 50) return 'medium';
  if (confidence > 0) return 'low';
  return 'invalid';
}

/** Level → UI renk sınıfı. */
export function levelColor(level: ConfidenceLevel): string {
  switch (level) {
    case 'high': return 'text-success bg-success/10 border-success/20';
    case 'medium': return 'text-warning bg-warning/10 border-warning/20';
    case 'low': return 'text-danger bg-danger/10 border-danger/20';
    case 'invalid': return 'text-slate-500 bg-slate-500/10 border-slate-500/20';
  }
}

/** Level → küçük etiket. */
export function levelLabel(level: ConfidenceLevel): string {
  switch (level) {
    case 'high': return 'Doğrulandı';
    case 'medium': return 'Kısmi doğrulama';
    case 'low': return 'Şüpheli';
    case 'invalid': return 'Bozuk';
  }
}

// ============================================================================
// KATMAN 3: TELEMETRY
// ============================================================================

const TELEMETRY_KEY = 'investliq.dq.log';
const MAX_LOG_ENTRIES = 500;
const TELEMETRY_TTL_MS = 24 * 60 * 60 * 1000; // 24 saat

export interface DQLogEntry {
  ts: number;
  kind: 'stock-quote' | 'fund-data' | 'macro' | 'metal' | 'crypto';
  symbol: string;
  confidence: number;
  level: ConfidenceLevel;
  warnings: string[];
  correctedApplied: boolean;
}

/** Data quality event'ini localStorage'a yazar. Backend flush ileride eklenebilir. */
export function dqLog(kind: DQLogEntry['kind'], symbol: string, result: DataQualityResult): void {
  // Sadece uyari/duzeltme icerenleri logla — spam olmasin
  if (result.warnings.length === 0 && !result.corrected) return;
  try {
    const raw = localStorage.getItem(TELEMETRY_KEY);
    const entries: DQLogEntry[] = raw ? JSON.parse(raw) : [];
    const now = Date.now();
    // TTL uygula — 24 saatten eski entry'leri temizle
    const fresh = entries.filter((e) => now - e.ts < TELEMETRY_TTL_MS);
    fresh.push({
      ts: now,
      kind,
      symbol,
      confidence: result.confidence,
      level: result.level,
      warnings: result.warnings,
      correctedApplied: !!result.corrected,
    });
    // Cap
    const capped = fresh.slice(-MAX_LOG_ENTRIES);
    localStorage.setItem(TELEMETRY_KEY, JSON.stringify(capped));
  } catch {
    /* sessizce — localStorage dolu vs. */
  }
}

/** Son 24 saatteki data quality event'lerini oku. */
export function getDQLog(): DQLogEntry[] {
  try {
    const raw = localStorage.getItem(TELEMETRY_KEY);
    if (!raw) return [];
    const entries: DQLogEntry[] = JSON.parse(raw);
    const now = Date.now();
    return entries.filter((e) => now - e.ts < TELEMETRY_TTL_MS);
  } catch {
    return [];
  }
}

/** Log'u temizle (admin manual reset). */
export function clearDQLog(): void {
  try {
    localStorage.removeItem(TELEMETRY_KEY);
  } catch {
    /* ignore */
  }
}

/** Ozet istatistikler — admin dashboard icin. */
export interface DQSummary {
  total: number;
  byLevel: Record<ConfidenceLevel, number>;
  byKind: Record<string, number>;
  topProblemSymbols: Array<{ symbol: string; count: number; avgConfidence: number }>;
  correctionRate: number; // 0-100
}

export function summarizeDQLog(): DQSummary {
  const entries = getDQLog();
  const byLevel: Record<ConfidenceLevel, number> = { high: 0, medium: 0, low: 0, invalid: 0 };
  const byKind: Record<string, number> = {};
  const symbolStats: Record<string, { count: number; totalConf: number }> = {};
  let correctionCount = 0;

  for (const e of entries) {
    byLevel[e.level]++;
    byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
    if (!symbolStats[e.symbol]) symbolStats[e.symbol] = { count: 0, totalConf: 0 };
    symbolStats[e.symbol].count++;
    symbolStats[e.symbol].totalConf += e.confidence;
    if (e.correctedApplied) correctionCount++;
  }

  const topProblemSymbols = Object.entries(symbolStats)
    .map(([symbol, s]) => ({
      symbol,
      count: s.count,
      avgConfidence: s.count > 0 ? s.totalConf / s.count : 0,
    }))
    .sort((a, b) => a.avgConfidence - b.avgConfidence || b.count - a.count)
    .slice(0, 20);

  return {
    total: entries.length,
    byLevel,
    byKind,
    topProblemSymbols,
    correctionRate: entries.length > 0 ? (correctionCount / entries.length) * 100 : 0,
  };
}
