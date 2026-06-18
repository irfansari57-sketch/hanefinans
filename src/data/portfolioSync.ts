/**
 * Portfoy senkronizasyon katmani.
 *
 * Auth'lu kullanici (login olmus) -> Cloudflare D1 source of truth
 *   * GET /api/portfolio -> pozisyonlar + islem gecmisi
 *   * POST /api/portfolio -> yeni pozisyon (server agirlikli ortalama hesabi)
 *   * PUT/DELETE /api/portfolio/:id
 *
 * Anonim kullanici (login yok) -> Dexie (mevcut davranis)
 *
 * Frontend bu API'yi cagirir: useCloudPortfolio() veya direkt sync fonksiyonlari.
 * PortfolioPage ve FundsPanel auth durumuna gore karar verir:
 *   - auth varsa cloud kullan + ilk girise Dexie verisini yukle (one-time migration)
 *   - auth yoksa Dexie kullan
 */

import { useAuth } from '@/store/auth';
import { db, type PortfolioPosition, type PortfolioTxn } from './db';

export interface CloudPosition {
  id: number;
  user_id: number;
  kind: 'stock' | 'fund';
  symbol: string;
  lot: number;
  avg_price: number;
  note: string | null;
  added_at: number;
  updated_at: number;
}

export interface CloudTxn {
  id: number;
  position_id: number;
  user_id: number;
  kind: 'stock' | 'fund';
  symbol: string;
  lot: number;
  price: number;
  executed_at: number;
  note: string | null;
  created_at: number;
}

interface ApiResponse<T> {
  ok: boolean;
  error?: string;
  positionId?: number;
  positions?: CloudPosition[];
  txns?: CloudTxn[];
  [k: string]: T | unknown;
}

async function api<T = unknown>(url: string, init?: RequestInit): Promise<ApiResponse<T>> {
  const r = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  return r.json() as Promise<ApiResponse<T>>;
}

/** Cloud'dan tum pozisyonlari + islem gecmisini cek */
export async function cloudFetch(): Promise<{ positions: CloudPosition[]; txns: CloudTxn[] }> {
  const r = await api('/api/portfolio');
  if (!r.ok) throw new Error(r.error ?? 'Cloud fetch fail');
  return {
    positions: r.positions ?? [],
    txns: r.txns ?? [],
  };
}

/** Cloud'a yeni pozisyon ekle (server agirlikli ortalama yapar) */
export async function cloudAddPosition(input: {
  kind: 'stock' | 'fund';
  symbol: string;
  lot: number;
  avgPrice: number;
  note?: string;
  executedAt?: number;
}): Promise<number> {
  const r = await api('/api/portfolio', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!r.ok) throw new Error(r.error ?? 'Cloud add fail');
  return r.positionId ?? 0;
}

/** Cloud'da pozisyon guncelle */
export async function cloudUpdatePosition(
  id: number,
  input: { lot: number; avgPrice: number; note?: string },
): Promise<void> {
  const r = await api(`/api/portfolio/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
  if (!r.ok) throw new Error(r.error ?? 'Cloud update fail');
}

/** Cloud'da pozisyon sil (CASCADE: txn'ler de silinir) */
export async function cloudDeletePosition(id: number): Promise<void> {
  const r = await api(`/api/portfolio/${id}`, { method: 'DELETE' });
  if (!r.ok) throw new Error(r.error ?? 'Cloud delete fail');
}

/**
 * Ilk login: Dexie'deki mevcut pozisyonlari cloud'a tasi.
 * Sadece anonim kullaniciyken kaydedilmis veriyi koruma garantisi icin.
 * Tasinma sonrasi Dexie kayitlari KORUNUR (kullanicinin guvenligi icin).
 */
export async function migrateDexieToCloud(): Promise<{ migrated: number; failed: number }> {
  const positions = await db.portfolio.toArray();
  if (positions.length === 0) return { migrated: 0, failed: 0 };

  let migrated = 0;
  let failed = 0;
  for (const p of positions) {
    try {
      await cloudAddPosition({
        kind: (p.kind ?? 'stock') as 'stock' | 'fund',
        symbol: p.symbol,
        lot: p.lot,
        avgPrice: p.avgPrice,
        note: p.note,
        executedAt: p.addedAt,
      });
      migrated++;
    } catch {
      failed++;
    }
  }
  return { migrated, failed };
}

/** Cloud kaydini Dexie-uyumlu PortfolioPosition'a cevir */
export function cloudToDexiePosition(c: CloudPosition): PortfolioPosition & { id: number } {
  return {
    id: c.id,
    kind: c.kind,
    symbol: c.symbol,
    lot: c.lot,
    avgPrice: c.avg_price,
    note: c.note ?? undefined,
    addedAt: c.added_at,
  };
}

export function cloudToDexieTxn(c: CloudTxn): PortfolioTxn & { id: number } {
  return {
    id: c.id,
    positionId: c.position_id,
    kind: c.kind,
    symbol: c.symbol,
    lot: c.lot,
    price: c.price,
    executedAt: c.executed_at,
    note: c.note ?? undefined,
    createdAt: c.created_at,
  };
}

/** Kullanici auth'lu mu (cloud kullanmali mi)? Frontend hook'larda kullanilir. */
export function shouldUseCloud(): boolean {
  return !!useAuth.getState().user;
}

/**
 * Duplicate pozisyon tarama: ayni symbol + kind icin >1 kayit varsa onlari listele.
 * Returns: { totalDupes, groups } — groups[i] = [pos1, pos2, ...] (en az 2 elemanli)
 */
export function findDuplicateGroups(
  positions: PortfolioPosition[],
  kind: 'stock' | 'fund' | 'all' = 'all',
): { totalDupes: number; groups: PortfolioPosition[][] } {
  const map = new Map<string, PortfolioPosition[]>();
  for (const p of positions) {
    if (kind !== 'all' && (p.kind ?? 'stock') !== kind) continue;
    const key = `${p.kind ?? 'stock'}::${p.symbol}`;
    const list = map.get(key);
    if (list) list.push(p);
    else map.set(key, [p]);
  }
  const groups: PortfolioPosition[][] = [];
  let totalDupes = 0;
  for (const list of map.values()) {
    if (list.length > 1) {
      groups.push(list);
      totalDupes += list.length - 1;
    }
  }
  return { totalDupes, groups };
}

/**
 * Bir duplicate grubu birlestir:
 *   - lot = sum(lot_i)
 *   - avgPrice = weighted avg (sum(lot_i * price_i) / sum(lot_i))
 *   - Ilk pozisyon (en eski id) update edilir, geri kalanlar silinir
 *   - Cloud + Dexie ikisinde de senkron tutar
 */
export async function mergeDuplicateGroup(
  group: PortfolioPosition[],
): Promise<{ kept: number; removed: number }> {
  if (group.length < 2) return { kept: group.length, removed: 0 };

  let totalLot = 0;
  let weightedSum = 0;
  for (const p of group) {
    totalLot += p.lot;
    weightedSum += p.lot * p.avgPrice;
  }
  const weightedAvg = totalLot > 0 ? weightedSum / totalLot : 0;

  const sorted = [...group].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  const keeper = sorted[0];
  const drops = sorted.slice(1);
  if (!keeper?.id) return { kept: 0, removed: 0 };

  const useCloud = shouldUseCloud();
  if (useCloud) {
    try {
      await cloudUpdatePosition(keeper.id, {
        lot: totalLot,
        avgPrice: weightedAvg,
        note: keeper.note,
      });
      for (const d of drops) {
        if (d.id) await cloudDeletePosition(d.id);
      }
    } catch (e) {
      console.warn('[dedupe] cloud merge failed, Dexie fallback:', e);
    }
  }

  await db.transaction('rw', db.portfolio, async () => {
    await db.portfolio.update(keeper.id!, { lot: totalLot, avgPrice: weightedAvg });
    for (const d of drops) {
      if (d.id) await db.portfolio.delete(d.id);
    }
  });

  return { kept: 1, removed: drops.length };
}

/** Tum duplicate gruplari sirayla birlestir. UI banner'inda tek tikla calistirilir. */
export async function mergeAllDuplicates(
  positions: PortfolioPosition[],
  kind: 'stock' | 'fund' | 'all' = 'all',
): Promise<{ groupsMerged: number; positionsRemoved: number }> {
  const { groups } = findDuplicateGroups(positions, kind);
  let groupsMerged = 0;
  let positionsRemoved = 0;
  for (const g of groups) {
    const r = await mergeDuplicateGroup(g);
    if (r.removed > 0) {
      groupsMerged++;
      positionsRemoved += r.removed;
    }
  }
  return { groupsMerged, positionsRemoved };
}
