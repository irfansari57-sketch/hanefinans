/**
 * Server-side price alerts client — /api/alerts CRUD.
 *
 * Eski IndexedDB tabanlı sistem (alertsRepo / Dexie) artık legacy:
 * - Sadece sekme açıkken çalışıyordu (AlertWatcher 60sn polling)
 * - Bu modül D1 + cron tabanlı yeni sisteme bağlanıyor → tarayıcı kapalıyken bile push
 *
 * Tüm endpoint'ler auth cookie ile çalışır (credentials: 'same-origin').
 */

export type AlertAssetType = 'stock' | 'fund' | 'crypto' | 'fx';
export type AlertDirection = 'above' | 'below';

export interface AlertItem {
  id: number;
  user_id: number;
  symbol: string;
  asset_type: AlertAssetType;
  direction: AlertDirection;
  threshold: number;
  note: string | null;
  active: 0 | 1;
  triggered_at: number | null;
  trigger_price: number | null;
  last_price: number | null;
  last_checked_at: number | null;
  created_at: number;
}

export interface CreateAlertInput {
  symbol: string;
  assetType: AlertAssetType;
  direction: AlertDirection;
  threshold: number;
  note?: string;
}

interface ApiResponse<T = unknown> {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

async function fetchJson<T = unknown>(input: RequestInfo, init?: RequestInit): Promise<ApiResponse & T> {
  try {
    const r = await fetch(input, { credentials: 'same-origin', ...init });
    const data = (await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }))) as ApiResponse & T;
    return data;
  } catch (e) {
    return { ok: false, error: (e as Error).message } as ApiResponse & T;
  }
}

/** Kullanıcının tüm alarmlarını çek (aktif + geçmiş). */
export async function listAlerts(): Promise<AlertItem[]> {
  const r = await fetchJson<{ alerts?: AlertItem[] }>('/api/alerts');
  return r.ok ? (r.alerts ?? []) : [];
}

/** Yeni alarm oluştur. */
export async function createAlert(input: CreateAlertInput): Promise<{ ok: boolean; id?: number; error?: string }> {
  const r = await fetchJson<{ id?: number }>('/api/alerts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return { ok: r.ok, id: r.id, error: r.error };
}

/** Alarmı sil. */
export async function deleteAlert(id: number): Promise<{ ok: boolean; error?: string }> {
  const r = await fetchJson(`/api/alerts/${id}`, { method: 'DELETE' });
  return { ok: r.ok, error: r.error };
}

/** Alarm toggle (active 0↔1) — re-enable triggered alarm da bu yolla. */
export async function toggleAlert(id: number, action?: 'enable' | 'disable'): Promise<{ ok: boolean; active?: 0 | 1; error?: string }> {
  const r = await fetchJson<{ active?: 0 | 1 }>(`/api/alerts/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(action ? { action } : {}),
  });
  return { ok: r.ok, active: r.active, error: r.error };
}
