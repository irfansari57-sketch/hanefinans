/**
 * POST /api/cron/rule-alerts
 *
 * Kural tabanlı alarmları (rule_alerts) günlük kapanış barlarıyla değerlendirir,
 * koşulu sağlananlar için kullanıcının push subscription'larına bildirim atar.
 *
 * Auth: X-Cron-Secret header = CRON_SECRET env (bist-warm / check-alerts kalıbı).
 * Tetikleyici: .github/workflows/rule-alerts.yml — bars-warm'dan 40 dk sonra.
 *
 * Akış:
 *   1) Aktif kuralları çek, sembole göre grupla
 *   2) Her sembol: bars_daily son 300 bar → computeMetrics (bugün + dün) + evaluateSignals
 *   3) evaluateRule (src/lib/ruleAlerts.ts — saf, testli) → matched?
 *   4) matched && last_eval_date != bar tarihi → tetikle:
 *        last_triggered_at = now, trigger_count++, push (kanıt satırlarıyla)
 *      Her durumda last_eval_date = bar tarihi (aynı gün ikinci çalıştırma tekrar üretmez)
 *   5) Push: check-alerts ile aynı yardımcı (sendPush), aynı expired/failed yönetimi
 *
 * Tablo yoksa 503 + migration hint.
 */

import { sendPush, type PushSubscriptionData, type PushVapidEnv } from '../../_push';
import { computeMetrics, type StockMetrics } from '../../../src/lib/metrics';
import { computeTrend } from '../../../src/lib/regime';
import { evaluateSignals, type Bar, type Signal } from '../../../src/lib/signals';
import { evaluateRule, parseRule, describeRule, type RuleEvaluation } from '../../../src/lib/ruleAlerts';

interface Env extends PushVapidEnv {
  DB: D1Database;
  CRON_SECRET?: string;
}

interface RuleRow {
  id: number;
  user_id: number;
  symbol: string;
  rule_kind: string;
  rule_json: string;
  last_eval_date: string | null;
}

interface BarRow { date: string; open: number; high: number; low: number; close: number; volume: number }
interface SubRow { endpoint: string; p256dh: string; auth: string }

const MIGRATION_HINT = 'rule_alerts tablosu yok → npx wrangler d1 execute hanefinans-db --remote --file=functions/migrations/021_rule_alerts.sql';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

interface SymbolCtx { today: StockMetrics | null; yesterday: StockMetrics | null; signals: Signal[] }

async function loadSymbolCtx(db: D1Database, symbol: string, indexTrend: ReturnType<typeof computeTrend>['regime'] | null): Promise<SymbolCtx> {
  const rows = await db
    .prepare('SELECT date, open, high, low, close, volume FROM bars_daily WHERE symbol = ? ORDER BY date DESC LIMIT 300')
    .bind(symbol)
    .all<BarRow>();
  const bars: Bar[] = (rows.results ?? []).reverse().map((r) => ({ date: r.date, open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume ?? 0 }));
  if (bars.length === 0) return { today: null, yesterday: null, signals: [] };
  const today = computeMetrics(symbol, bars, indexTrend);
  const yesterday = bars.length > 1 ? computeMetrics(symbol, bars.slice(0, -1), indexTrend) : null;
  const signals = evaluateSignals(bars, indexTrend);
  return { today, yesterday, signals };
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const provided = request.headers.get('X-Cron-Secret') ?? '';
  if (!env.CRON_SECRET || provided !== env.CRON_SECRET) return json({ ok: false, error: 'Yetkisiz' }, 401);
  if (!env.DB) return json({ ok: false, error: 'D1 binding eksik' }, 503);

  const stats = { rules: 0, symbols: 0, evaluated: 0, matched: 0, triggered: 0, alreadyToday: 0, skippedNoData: 0, invalidRule: 0, pushed: 0, expired: 0, failed: 0, noSubscription: 0 };
  const started = Date.now();

  // 1) Aktif kurallar
  let rules: RuleRow[];
  try {
    const res = await env.DB
      .prepare('SELECT id, user_id, symbol, rule_kind, rule_json, last_eval_date FROM rule_alerts WHERE active = 1 LIMIT 2000')
      .all<RuleRow>();
    rules = res.results ?? [];
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    if (/no such table/i.test(msg)) return json({ ok: false, error: 'rule_alerts tablosu yok', hint: MIGRATION_HINT }, 503);
    return json({ ok: false, error: `DB: ${msg.slice(0, 200)}` }, 500);
  }
  stats.rules = rules.length;
  if (rules.length === 0) return json({ ok: true, stats, elapsedMs: Date.now() - started });

  const bySymbol = new Map<string, RuleRow[]>();
  for (const r of rules) {
    const arr = bySymbol.get(r.symbol) ?? [];
    arr.push(r);
    bySymbol.set(r.symbol, arr);
  }
  stats.symbols = bySymbol.size;

  // Endeks rejimi (sinyal regimeFit için) — yoksa null
  let indexTrend: ReturnType<typeof computeTrend>['regime'] | null = null;
  try {
    const idx = await env.DB.prepare('SELECT close FROM bars_daily WHERE symbol = ? ORDER BY date DESC LIMIT 400').bind('XU100').all<{ close: number }>();
    const closes = (idx.results ?? []).map((r) => r.close).reverse();
    if (closes.length >= 60) indexTrend = computeTrend(closes).regime;
  } catch { /* opsiyonel */ }

  // 2-4) Değerlendir
  const now = Math.floor(Date.now() / 1000);
  interface Fired { rule: RuleRow; label: string; evaluation: RuleEvaluation; asOfDate: string }
  const userFired = new Map<number, Fired[]>();
  const updates: D1PreparedStatement[] = [];

  const BUDGET_MS = 20_000; // denetim: süre bütçesi — aşılırsa kalan semboller sonraki koşuya kalır
  let partial = false;
  for (const [symbol, symRules] of bySymbol) {
    if (Date.now() - started > BUDGET_MS) { partial = true; stats.skippedNoData += symRules.length; continue; }
    let ctx: SymbolCtx;
    try {
      ctx = await loadSymbolCtx(env.DB, symbol, indexTrend);
    } catch {
      stats.skippedNoData += symRules.length;
      continue;
    }
    if (!ctx.today) { stats.skippedNoData += symRules.length; continue; }
    const asOfDate = ctx.today.asOfDate;

    for (const row of symRules) {
      let rawJson: unknown = {};
      try { rawJson = JSON.parse(row.rule_json || '{}'); } catch { /* geçersiz */ }
      const rule = parseRule(row.rule_kind, rawJson);
      if (!rule) { stats.invalidRule++; continue; }

      const ev = evaluateRule(rule, ctx.today, ctx.yesterday, ctx.signals);
      stats.evaluated++;
      const alreadyToday = row.last_eval_date === asOfDate;

      if (ev.matched) {
        stats.matched++;
        if (alreadyToday) {
          stats.alreadyToday++;
        } else {
          stats.triggered++;
          updates.push(
            env.DB.prepare('UPDATE rule_alerts SET last_eval_date = ?, last_triggered_at = ?, trigger_count = trigger_count + 1 WHERE id = ?').bind(asOfDate, now, row.id),
          );
          const arr = userFired.get(row.user_id) ?? [];
          arr.push({ rule: row, label: describeRule(rule), evaluation: ev, asOfDate });
          userFired.set(row.user_id, arr);
          continue;
        }
      }
      if (!alreadyToday) {
        updates.push(env.DB.prepare('UPDATE rule_alerts SET last_eval_date = ? WHERE id = ?').bind(asOfDate, row.id));
      }
    }
  }

  // DB güncellemeleri (batch, chunk)
  for (let i = 0; i < updates.length; i += 80) {
    await env.DB.batch(updates.slice(i, i + 80)).catch(() => null);
  }

  // 5) Push — check-alerts ile aynı yardımcı ve aynı subscription yönetimi
  const expiredEndpoints: string[] = [];
  await Promise.all(
    Array.from(userFired.entries()).map(async ([userId, fired]) => {
      const subRes = await env.DB
        .prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?')
        .bind(userId)
        .all<SubRow>();
      const subs = subRes.results ?? [];
      if (subs.length === 0) { stats.noSubscription += fired.length; return; }

      const first = fired[0];
      const title = fired.length === 1
        ? `${first.rule.symbol}: koşul sağlandı`
        : `${fired.length} kural alarmında koşul sağlandı`;
      const evidenceLine = first.evaluation.evidence.slice(0, 2).map((e) => `${e.label}: ${e.value}`).join(' · ');
      const body = fired.length === 1
        ? `${first.label}${evidenceLine ? ` — ${evidenceLine}` : ''} (${first.asOfDate} kapanışı)`
        : fired.slice(0, 3).map((f) => `${f.rule.symbol}: ${f.label}`).join(' • ');

      const payload = JSON.stringify({
        title,
        body,
        url: `/stock/${first.rule.symbol}`,
        tag: `rule-${first.rule.id}-${first.asOfDate}`,
      });

      for (const sub of subs) {
        const subData: PushSubscriptionData = { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth };
        const r = await sendPush(subData, payload, env, { ttl: 6 * 3600, urgency: 'normal' });
        if (r.ok) {
          stats.pushed++;
          env.DB
            .prepare('UPDATE push_subscriptions SET last_used_at = ?, last_error = NULL, failure_count = 0 WHERE endpoint = ?')
            .bind(now, sub.endpoint)
            .run()
            .catch(() => null);
        } else if (r.expired) {
          stats.expired++;
          expiredEndpoints.push(sub.endpoint);
        } else {
          stats.failed++;
          env.DB
            .prepare('UPDATE push_subscriptions SET last_error = ?, failure_count = failure_count + 1 WHERE endpoint = ?')
            .bind((r.error ?? `HTTP ${r.status}`).slice(0, 200), sub.endpoint)
            .run()
            .catch(() => null);
        }
      }
    }),
  );

  if (expiredEndpoints.length > 0) {
    const placeholders = expiredEndpoints.map(() => '?').join(',');
    await env.DB
      .prepare(`DELETE FROM push_subscriptions WHERE endpoint IN (${placeholders})`)
      .bind(...expiredEndpoints)
      .run()
      .catch(() => null);
  }

  return json({ ok: true, stats, indexTrend, partial: partial || undefined, elapsedMs: Date.now() - started });
};
