/**
 * Kural tabanlı alarm istemcisi — /api/alerts/rules CRUD (Hafta 4b).
 *
 * Fiyat alarmından (alertsClient) farkı: koşul bir gösterge durumudur ve günde
 * bir kez (gece kapanış barı yazıldıktan sonra) değerlendirilir. Auth cookie ile
 * çalışır (credentials: 'same-origin'). Yatırım tavsiyesi değildir.
 */
import type { RuleKind, RuleAlertRule } from '@/lib/ruleAlerts';

export interface RuleAlertItem {
  id: number;
  user_id: number;
  symbol: string;
  rule_kind: RuleKind;
  /** Ham rule_json (sunucu parse etmiş) — parseRule ile tiplenir. */
  rule: unknown;
  active: 0 | 1;
  last_eval_date: string | null;
  last_triggered_at: number | null;
  trigger_count: number;
  created_at: number;
}

export interface CreateRuleAlertInput {
  symbol: string;
  ruleKind: RuleKind;
  rule: RuleAlertRule['params'];
}

interface ApiResponse {
  ok: boolean;
  error?: string;
  hint?: string;
  [key: string]: unknown;
}

async function fetchJson<T = Record<string, unknown>>(input: RequestInfo, init?: RequestInit): Promise<ApiResponse & T> {
  try {
    const r = await fetch(input, { credentials: 'same-origin', ...init });
    return (await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }))) as ApiResponse & T;
  } catch (e) {
    return { ok: false, error: (e as Error).message } as ApiResponse & T;
  }
}

export async function listRuleAlerts(): Promise<{ ok: boolean; rules: RuleAlertItem[]; limit: number; error?: string; hint?: string }> {
  const r = await fetchJson<{ rules?: RuleAlertItem[]; limit?: number }>('/api/alerts/rules');
  return { ok: r.ok, rules: r.ok ? (r.rules ?? []) : [], limit: r.limit ?? 30, error: r.error, hint: r.hint };
}

export async function createRuleAlert(input: CreateRuleAlertInput): Promise<{ ok: boolean; id?: number; error?: string }> {
  const r = await fetchJson<{ id?: number }>('/api/alerts/rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return { ok: r.ok, id: r.id, error: r.error };
}

export async function deleteRuleAlert(id: number): Promise<{ ok: boolean; error?: string }> {
  const r = await fetchJson(`/api/alerts/rules/${id}`, { method: 'DELETE' });
  return { ok: r.ok, error: r.error };
}

export async function setRuleAlertActive(id: number, active: boolean): Promise<{ ok: boolean; active?: 0 | 1; error?: string }> {
  const r = await fetchJson<{ active?: 0 | 1 }>(`/api/alerts/rules/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active }),
  });
  return { ok: r.ok, active: r.active, error: r.error };
}
