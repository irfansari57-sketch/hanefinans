/**
 * /api/alerts/rules — Kural tabanlı alarmlar (Hafta 4b, 22 Eki 2026)
 *
 * GET  → kullanıcının tüm kural alarmları
 * POST → yeni kural alarmı { symbol, ruleKind, rule }  (kullanıcı başına max 30)
 *
 * Fiyat eşiğinden farklı: koşul bir gösterge durumudur (RSI eşiği, SMA kesişimi,
 * sinyal motoru kuralı, 52h zirveye yakınlık, tarayıcı filtresi). Değerlendirme
 * gece bars_daily yazıldıktan sonra /api/cron/rule-alerts tarafından yapılır.
 *
 * Tablo: functions/migrations/021_rule_alerts.sql — yoksa 503 + hint.
 * Rate limit: /api/alerts prefix'i 'session' kovasında (functions/_rate-limit.ts).
 */

import { getAuthedUser, type Env as AuthEnv, jsonResponse } from '../auth/_utils';
import { parseRule, RULE_KINDS, type RuleKind } from '../../../src/lib/ruleAlerts';

interface Env extends AuthEnv {
  DB: D1Database;
}

export interface RuleAlertRow {
  id: number;
  user_id: number;
  symbol: string;
  rule_kind: RuleKind;
  rule_json: string;
  active: 0 | 1;
  last_eval_date: string | null;
  last_triggered_at: number | null;
  trigger_count: number;
  created_at: number;
}

const MAX_RULES_PER_USER = 30;
const MIGRATION_HINT = 'rule_alerts tablosu yok → npx wrangler d1 execute hanefinans-db --remote --file=functions/migrations/021_rule_alerts.sql';

function dbError(e: unknown): Response {
  const msg = (e as Error).message ?? String(e);
  if (/no such table/i.test(msg)) {
    return jsonResponse({ ok: false, error: 'Kural alarmları tablosu henüz kurulmadı', hint: MIGRATION_HINT }, 503);
  }
  return jsonResponse({ ok: false, error: `DB: ${msg.slice(0, 100)}` }, 500);
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.AUTH_TOKEN_SECRET) return jsonResponse({ ok: false, error: 'AUTH_TOKEN_SECRET env eksik' }, 503);
  if (!env.DB) return jsonResponse({ ok: false, error: 'D1 binding eksik' }, 503);

  const auth = await getAuthedUser(request, env);
  if (!auth) return jsonResponse({ ok: false, error: 'Yetkisiz' }, 401);

  try {
    const rows = await env.DB
      .prepare(
        `SELECT id, user_id, symbol, rule_kind, rule_json, active, last_eval_date, last_triggered_at, trigger_count, created_at
         FROM rule_alerts WHERE user_id = ?
         ORDER BY active DESC, created_at DESC
         LIMIT 100`,
      )
      .bind(auth.user.id)
      .all<RuleAlertRow>();
    const rules = (rows.results ?? []).map((r) => {
      let rule: unknown = {};
      try { rule = JSON.parse(r.rule_json); } catch { /* bozuk json → boş */ }
      return { ...r, rule };
    });
    return jsonResponse({ ok: true, rules, limit: MAX_RULES_PER_USER });
  } catch (e) {
    return dbError(e);
  }
};

interface CreateBody {
  symbol?: string;
  ruleKind?: string;
  rule?: unknown;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.AUTH_TOKEN_SECRET) return jsonResponse({ ok: false, error: 'AUTH_TOKEN_SECRET env eksik' }, 503);
  if (!env.DB) return jsonResponse({ ok: false, error: 'D1 binding eksik' }, 503);

  const auth = await getAuthedUser(request, env);
  if (!auth) return jsonResponse({ ok: false, error: 'Yetkisiz — önce giriş yap' }, 401);

  let body: CreateBody;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Geçersiz JSON' }, 400);
  }

  const symbol = (body.symbol ?? '').trim().toUpperCase().replace(/\.IS$/, '');
  if (!/^[A-Z0-9]{2,6}$/.test(symbol)) {
    return jsonResponse({ ok: false, error: 'symbol BIST kodu olmalı (2-6 harf/rakam)' }, 400);
  }
  const ruleKind = (body.ruleKind ?? '').trim();
  if (!RULE_KINDS.includes(ruleKind as RuleKind)) {
    return jsonResponse({ ok: false, error: `ruleKind ${RULE_KINDS.join('|')} olmalı` }, 400);
  }
  const parsed = parseRule(ruleKind, body.rule);
  if (!parsed) {
    return jsonResponse({ ok: false, error: 'rule geçersiz — eşik/parametre kontrol et (RSI 1-99, maxPct 0-50, boş filtre kabul edilmez)' }, 400);
  }
  const ruleJson = JSON.stringify(parsed.params);
  if (ruleJson.length > 2000) return jsonResponse({ ok: false, error: 'rule çok büyük' }, 400);

  try {
    const countRow = await env.DB
      .prepare('SELECT COUNT(*) AS c FROM rule_alerts WHERE user_id = ?')
      .bind(auth.user.id)
      .first<{ c: number }>();
    if ((countRow?.c ?? 0) >= MAX_RULES_PER_USER) {
      return jsonResponse({ ok: false, error: `En fazla ${MAX_RULES_PER_USER} kural alarmı kurulabilir. Eskilerini sil.`, code: 'RULE_QUOTA_EXCEEDED', limit: MAX_RULES_PER_USER }, 400);
    }

    const now = Math.floor(Date.now() / 1000);
    const result = await env.DB
      .prepare(
        `INSERT INTO rule_alerts (user_id, symbol, rule_kind, rule_json, active, trigger_count, created_at)
         VALUES (?, ?, ?, ?, 1, 0, ?) RETURNING id`,
      )
      .bind(auth.user.id, symbol, parsed.kind, ruleJson, now)
      .first<{ id: number }>();
    return jsonResponse({ ok: true, id: result?.id });
  } catch (e) {
    return dbError(e);
  }
};
