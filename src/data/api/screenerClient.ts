/**
 * Doğal dil sorgudan filter spec üreten /api/ai/screener endpoint'inin client wrapper'ı.
 */

import { BIST_100_SYMBOLS, BIST_30_SYMBOLS } from '@/data/bistIndices';

export type ScreenerOp = '>' | '>=' | '<' | '<=' | '=' | '!=' | 'includes' | 'in';

export interface ScreenerFilter {
  field: string;
  op: ScreenerOp;
  value: number | string | string[];
}

export interface ScreenerSpec {
  dataset: 'stocks' | 'funds';
  filters: ScreenerFilter[];
  sort?: { field: string; dir: 'asc' | 'desc' };
  limit: number;
  explanation: string;
  /**
   * BIST endeks kapsamı — kullanıcı "BIST 100" / "BIST 30" derse AI buraya yazar.
   * applySpec'te symbol Set kontrolüyle hard-filter uygulanır.
   * - "XU100" → BIST 100 sembolleri
   * - "XU030" → BIST 30 sembolleri
   * - tanımlı değil → tüm BIST evreni
   */
  scope?: 'XU100' | 'XU030';
}

export type QuotaTier = 'anon' | 'free' | 'pro' | 'elite';

export interface QuotaInfo {
  tier: QuotaTier;
  /** Tier'a göre günlük max sorgu. */
  limit: number;
  /** Bu pencerede kullanılmış sorgu (bu istek dahil). */
  used: number;
  /** Geriye kalan sorgu (≥0). */
  remaining: number;
  /** Pencerenin sıfırlanacağı unix saniye. */
  resetAt: number;
  /** Pencere genişliği (saniye). 86400 = 24 saat. */
  windowSec: number;
}

export interface ScreenerResponse {
  ok: boolean;
  spec?: ScreenerSpec;
  error?: string;
  /** 'QUOTA_EXCEEDED' → kullanıcı tier limitine takıldı. */
  code?: 'QUOTA_EXCEEDED' | string;
  model?: string;
  raw?: string;
  quota?: QuotaInfo;
  retryAfter?: number;
}

export async function fetchScreenerSpec(query: string, datasetHint?: 'stocks' | 'funds'): Promise<ScreenerResponse | null> {
  try {
    const r = await fetch('/api/ai/screener', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, dataset: datasetHint }),
    });
    // 429 (quota) ve 502 (LLM hata) durumlarında body içinde anlamlı bilgi var — parse et.
    if (!r.ok && r.status !== 429 && r.status !== 502) {
      const errText = await r.text().catch(() => '');
      return { ok: false, error: `HTTP ${r.status}: ${errText.slice(0, 120)}` };
    }
    return await r.json() as ScreenerResponse;
  } catch (e) {
    return { ok: false, error: `Network: ${(e as Error).message}` };
  }
}

/**
 * Tek bir filtreyi item üzerine uygula. Alan adları stocks ve funds için farklı
 * olabilir — caller tarafında uygun item shape verilmeli.
 */
export function applyFilter(item: Record<string, unknown>, filter: ScreenerFilter): boolean {
  const v = item[filter.field];
  if (v == null) return false;
  const fv = filter.value;
  switch (filter.op) {
    case '>':  return typeof v === 'number' && typeof fv === 'number' && v > fv;
    case '>=': return typeof v === 'number' && typeof fv === 'number' && v >= fv;
    case '<':  return typeof v === 'number' && typeof fv === 'number' && v < fv;
    case '<=': return typeof v === 'number' && typeof fv === 'number' && v <= fv;
    case '=':
      if (typeof v === 'string' && typeof fv === 'string') return v.toLowerCase() === fv.toLowerCase();
      return v === fv;
    case '!=':
      if (typeof v === 'string' && typeof fv === 'string') return v.toLowerCase() !== fv.toLowerCase();
      return v !== fv;
    case 'includes':
      return typeof v === 'string' && typeof fv === 'string' && v.toLowerCase().includes(fv.toLowerCase());
    case 'in':
      if (Array.isArray(fv)) return fv.some((x) => typeof v === 'string' && typeof x === 'string' && v.toLowerCase() === x.toLowerCase());
      return false;
    default:
      return false;
  }
}

/** Spec'in tamamını applyFilter ile geç + scope + sort + limit uygula. */
export function applySpec<T extends Record<string, unknown>>(items: T[], spec: ScreenerSpec): T[] {
  let out = items.filter((item) => spec.filters.every((f) => applyFilter(item, f)));

  // BIST endeks kapsamı (XU100 / XU030) — sadece hisse dataset'i için anlamlı.
  // Sembol stocks'ta `symbol`, funds'ta `code`. Funds için scope no-op gibi davranır.
  if (spec.scope === 'XU100' || spec.scope === 'XU030') {
    const allowSet = spec.scope === 'XU030' ? BIST_30_SYMBOLS : BIST_100_SYMBOLS;
    out = out.filter((item) => {
      const sym = (item['symbol'] ?? item['code']) as unknown;
      return typeof sym === 'string' && allowSet.has(sym);
    });
  }

  if (spec.sort) {
    const { field, dir } = spec.sort;
    out = [...out].sort((a, b) => {
      const va = a[field];
      const vb = b[field];
      const an = typeof va === 'number' && Number.isFinite(va) ? va : -Infinity;
      const bn = typeof vb === 'number' && Number.isFinite(vb) ? vb : -Infinity;
      return dir === 'asc' ? an - bn : bn - an;
    });
  }
  return out.slice(0, spec.limit);
}
