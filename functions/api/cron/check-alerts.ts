/**
 * POST /api/cron/check-alerts
 *
 * Aktif tüm fiyat alarmlarını snapshot fiyatlarıyla karşılaştırır,
 * tetiklenenler için kullanıcının tüm push subscription'larına bildirim atar.
 *
 * Auth: X-Cron-Secret header = CRON_SECRET env value (GitHub Actions tetikler).
 *
 * Akış:
 *   1) D1'den aktif alarmları çek
 *   2) Sembolleri stock/fund/crypto/fx olarak grupla
 *   3) Stock için yahoo_cache (5d:1d), fund için TEFAS feed (proxy)
 *   4) Her alarm için direction check; geçen → tetikle:
 *      - active = 0, triggered_at + trigger_price set
 *      - kullanıcının push_subscriptions'larına payload at
 *   5) Stats dön ({ checked, triggered, failed, expired })
 *
 * Idempotency: tetiklenen alarm active=0 olur, sonraki cron'da tekrar fire etmez.
 */

import { sendPush, type PushSubscriptionData, type PushVapidEnv } from '../../_push';

interface Env extends PushVapidEnv {
  DB: D1Database;
  CRON_SECRET?: string;
  /** TEFAS proxy worker URL — sadece fund alarmları için lazım. */
  TEFAS_PROXY_URL?: string;
}

interface AlertRow {
  id: number;
  user_id: number;
  symbol: string;
  asset_type: 'stock' | 'fund' | 'crypto' | 'fx';
  direction: 'above' | 'below';
  threshold: number;
  note: string | null;
}

interface QuoteCacheRow {
  key: string;
  payload: string;
}

interface YahooChartResult {
  chart?: {
    result?: Array<{
      meta?: { regularMarketPrice?: number };
      indicators?: { quote?: Array<{ close?: (number | null)[] }> };
    }>;
  };
}

interface SubRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

function parseYahooPrice(payload: string): number | null {
  try {
    const j = JSON.parse(payload) as YahooChartResult;
    const meta = j.chart?.result?.[0]?.meta;
    if (meta?.regularMarketPrice != null && Number.isFinite(meta.regularMarketPrice) && meta.regularMarketPrice > 0) {
      return meta.regularMarketPrice;
    }
    const closes = j.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    for (let i = closes.length - 1; i >= 0; i--) {
      const c = closes[i];
      if (c != null && Number.isFinite(c) && (c as number) > 0) return c as number;
    }
    return null;
  } catch {
    return null;
  }
}

async function loadStockPrices(db: D1Database, symbols: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (symbols.length === 0) return out;
  // Symbol'larda BIST için ".IS" suffix var mı? alarm symbol'ü ham; yahoo_cache anahtarı "SYMBOL.IS:5d:1d"
  // Hem ham hem .IS varyantını dene
  const keys: string[] = [];
  for (const s of symbols) {
    keys.push(`${s}:5d:1d`, `${s}.IS:5d:1d`);
  }
  const placeholders = keys.map(() => '?').join(',');
  const rows = await db
    .prepare(`SELECT key, payload FROM yahoo_cache WHERE key IN (${placeholders})`)
    .bind(...keys)
    .all<QuoteCacheRow>();
  for (const r of rows.results ?? []) {
    const sym = r.key.split(':')[0].replace(/\.IS$/, '');
    if (out.has(sym)) continue;
    const price = parseYahooPrice(r.payload);
    if (price != null) out.set(sym, price);
  }
  return out;
}

interface TefasFund {
  code: string;
  nav: number;
}

interface TefasFeedResponse {
  ok?: boolean;
  funds?: TefasFund[];
}

async function loadFundPrices(env: Env, codes: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (codes.length === 0 || !env.TEFAS_PROXY_URL) return out;
  try {
    const r = await fetch(env.TEFAS_PROXY_URL, { headers: { Accept: 'application/json' } });
    if (!r.ok) return out;
    const j = (await r.json()) as TefasFeedResponse;
    const wanted = new Set(codes);
    for (const f of j.funds ?? []) {
      if (wanted.has(f.code) && Number.isFinite(f.nav) && f.nav > 0) {
        out.set(f.code, f.nav);
      }
    }
  } catch {
    /* sessizce — bu cron'da fund alarmları skip olur */
  }
  return out;
}

function isTriggered(direction: 'above' | 'below', threshold: number, price: number): boolean {
  return direction === 'above' ? price >= threshold : price <= threshold;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // Auth — cron secret kontrolü
  const provided = request.headers.get('X-Cron-Secret') ?? '';
  if (!env.CRON_SECRET || provided !== env.CRON_SECRET) {
    return new Response(JSON.stringify({ ok: false, error: 'Yetkisiz' }), { status: 401 });
  }
  if (!env.DB) {
    return new Response(JSON.stringify({ ok: false, error: 'D1 binding eksik' }), { status: 503 });
  }

  const stats = { checked: 0, triggered: 0, pushed: 0, expired: 0, failed: 0, skippedNoPrice: 0 };

  // 1) Aktif alarmları çek
  const alertsRes = await env.DB
    .prepare(
      `SELECT id, user_id, symbol, asset_type, direction, threshold, note
       FROM price_alerts
       WHERE active = 1
       LIMIT 500`,
    )
    .all<AlertRow>();
  const alerts = alertsRes.results ?? [];
  stats.checked = alerts.length;

  if (alerts.length === 0) {
    return new Response(JSON.stringify({ ok: true, stats }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 2) Sembolleri grupla
  const stockSyms = new Set<string>();
  const fundCodes = new Set<string>();
  for (const a of alerts) {
    if (a.asset_type === 'stock' || a.asset_type === 'crypto' || a.asset_type === 'fx') {
      stockSyms.add(a.symbol);
    } else if (a.asset_type === 'fund') {
      fundCodes.add(a.symbol);
    }
  }

  // 3) Fiyatları yükle (stocks D1 cache, funds TEFAS proxy)
  const [stockPrices, fundPrices] = await Promise.all([
    loadStockPrices(env.DB, Array.from(stockSyms)),
    loadFundPrices(env, Array.from(fundCodes)),
  ]);

  // 4) Triggered olanları topla, kullanıcı bazlı grupla
  const now = Math.floor(Date.now() / 1000);
  interface FiredAlert { alert: AlertRow; price: number; }
  const fired: FiredAlert[] = [];
  const userFired = new Map<number, FiredAlert[]>(); // user_id → []

  for (const a of alerts) {
    const price = (a.asset_type === 'fund' ? fundPrices : stockPrices).get(a.symbol);
    if (price == null) { stats.skippedNoPrice++; continue; }

    // last_price + last_checked_at güncelle (her zaman, tetiklenmese de)
    // best-effort; ana SQL'in altında batch olarak çalıştırılabilir ama basit tutalım
    env.DB
      .prepare('UPDATE price_alerts SET last_price = ?, last_checked_at = ? WHERE id = ?')
      .bind(price, now, a.id)
      .run()
      .catch(() => null);

    if (!isTriggered(a.direction, a.threshold, price)) continue;
    fired.push({ alert: a, price });
    const arr = userFired.get(a.user_id) ?? [];
    arr.push({ alert: a, price });
    userFired.set(a.user_id, arr);
  }
  stats.triggered = fired.length;

  if (fired.length === 0) {
    return new Response(JSON.stringify({ ok: true, stats }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 5) DB güncelle — triggered alarmları deaktif et + trigger_price set
  for (const f of fired) {
    await env.DB
      .prepare(
        `UPDATE price_alerts
         SET active = 0, triggered_at = ?, trigger_price = ?, last_price = ?, last_checked_at = ?
         WHERE id = ?`,
      )
      .bind(now, f.price, f.price, now, f.alert.id)
      .run()
      .catch(() => null);
  }

  // 6) Her kullanıcı için push gönder
  const expiredEndpoints: string[] = [];
  await Promise.all(
    Array.from(userFired.entries()).map(async ([userId, alerts]) => {
      // Kullanıcının push subscription'larını çek
      const subRes = await env.DB
        .prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?')
        .bind(userId)
        .all<SubRow>();
      const subs = subRes.results ?? [];
      if (subs.length === 0) return;

      // Payload — birden fazla alarm aynı anda tetiklenmişse ilkini başlığa koy, gerisini body'ye
      const first = alerts[0];
      const title = alerts.length === 1
        ? `${first.alert.symbol} alarmı tetiklendi`
        : `${alerts.length} alarm tetiklendi`;
      const fmtPrice = (p: number) => p < 10 ? p.toFixed(4) : p < 100 ? p.toFixed(2) : p.toFixed(2);
      const body = alerts.length === 1
        ? `${first.alert.direction === 'above' ? '≥' : '≤'} ${first.alert.threshold} • Mevcut: ${fmtPrice(first.price)}`
        : alerts.slice(0, 3).map((f) => `${f.alert.symbol}: ${fmtPrice(f.price)}`).join(' • ');

      const url = first.alert.asset_type === 'fund'
        ? `/fund/${first.alert.symbol}`
        : first.alert.asset_type === 'crypto'
        ? `/kripto/${first.alert.symbol}`
        : `/stock/${first.alert.symbol}`;

      const payload = JSON.stringify({
        title,
        body,
        url,
        tag: `alert-${first.alert.id}`,
      });

      for (const sub of subs) {
        const subData: PushSubscriptionData = {
          endpoint: sub.endpoint,
          p256dh: sub.p256dh,
          auth: sub.auth,
        };
        const r = await sendPush(subData, payload, env, { ttl: 300, urgency: 'high' });
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

  // 7) Expired subscription'ları temizle
  if (expiredEndpoints.length > 0) {
    const placeholders = expiredEndpoints.map(() => '?').join(',');
    await env.DB
      .prepare(`DELETE FROM push_subscriptions WHERE endpoint IN (${placeholders})`)
      .bind(...expiredEndpoints)
      .run()
      .catch(() => null);
  }

  return new Response(JSON.stringify({ ok: true, stats }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
