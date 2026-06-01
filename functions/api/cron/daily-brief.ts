/**
 * Cloudflare Pages Function — Sabah AI Brief'i otomatik uretir + push gonderir.
 *
 * GitHub Actions cron tarafindan 07:30 TR (04:30 UTC) tetiklenir.
 * Auth: X-Cron-Secret header'inda CRON_SECRET env var ile eslesmeli.
 *
 * Akis:
 *   1. Idempotency check — bugun zaten brief uretildi mi (D1'de UNIQUE brief_date)
 *   2. /api/agents/briefing endpoint'i ile Markdown brief al (makro+haber+sentiment+indicator)
 *   3. D1 briefs tablosuna yaz (user_id=0 = global brief)
 *   4. Tum aktif push_subscriptions'a bildirim gonder (data.type='brief', url='/brief')
 *
 * MVP: Generic brief (herkes ayni) — gunluk 1 AI cagrisi, dusuk maliyet.
 * Gelecek: per-user kisisellestirme (watchlist D1 sync sonrasi).
 */

import { sendPush, type PushSubscriptionData, type PushVapidEnv } from '../../_push';

interface Env extends PushVapidEnv {
  DB?: D1Database;
  CRON_SECRET?: string;
  ANTHROPIC_API_KEY?: string;
}

interface BriefingPayload {
  ok: boolean;
  text?: string;
  generatedAt?: string;
}

function trDateToday(): string {
  // TR = UTC+3 yil boyu (DST yok)
  const now = new Date();
  const tr = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return tr.toISOString().slice(0, 10);
}

async function fetchBriefing(origin: string): Promise<string | null> {
  try {
    const r = await fetch(`${origin}/api/agents/briefing`, {
      headers: { Accept: 'application/json' },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as BriefingPayload;
    return j.ok && j.text ? j.text : null;
  } catch {
    return null;
  }
}

async function sendBriefPushes(
  db: D1Database,
  vapid: PushVapidEnv,
  briefDate: string,
): Promise<{ sent: number; failed: number; expired: number }> {
  // Tum aktif push subscriptions'i cek
  const rows = await db
    .prepare(`SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions`)
    .all<{ id: number; user_id: number; endpoint: string; p256dh: string; auth: string }>();

  if (!rows.results || rows.results.length === 0) {
    return { sent: 0, failed: 0, expired: 0 };
  }

  const payload = JSON.stringify({
    type: 'brief',
    title: 'Sabah brief\'iniz hazir',
    body: 'Bugunku BIST, makro ve haber ozeti seni bekliyor.',
    url: '/brief',
    timestamp: Date.now(),
  });

  let sent = 0;
  let failed = 0;
  let expired = 0;
  const expiredIds: number[] = [];

  // 5 paralel push (rate limit + push servisi yuku)
  const CONCURRENCY = 5;
  for (let i = 0; i < rows.results.length; i += CONCURRENCY) {
    const batch = rows.results.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (sub) => {
        const subData: PushSubscriptionData = {
          endpoint: sub.endpoint,
          p256dh: sub.p256dh,
          auth: sub.auth,
        };
        const r = await sendPush(subData, payload, vapid, {
          ttl: 6 * 60 * 60, // 6 saat (sabah brief'i ogleden sonra anlamsiz)
          urgency: 'normal',
          topic: `brief-${briefDate}`, // Ayni gun tekrar gelirse eskisini override eder
        });
        return { sub, result: r };
      }),
    );

    for (const { sub, result } of results) {
      if (result.ok) sent++;
      else if (result.expired) {
        expired++;
        expiredIds.push(sub.id);
      } else failed++;
    }
  }

  // Expired subscriptions'i temizle
  if (expiredIds.length > 0) {
    const placeholders = expiredIds.map(() => '?').join(',');
    await db
      .prepare(`DELETE FROM push_subscriptions WHERE id IN (${placeholders})`)
      .bind(...expiredIds)
      .run();
  }

  return { sent, failed, expired };
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  // --- Auth ---
  if (!env.CRON_SECRET) {
    return new Response(JSON.stringify({ ok: false, error: 'CRON_SECRET env not set' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
  const provided = request.headers.get('X-Cron-Secret');
  if (provided !== env.CRON_SECRET) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!env.DB) {
    return new Response(JSON.stringify({ ok: false, error: 'D1 not bound' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';
  const briefDate = trDateToday();

  // --- Idempotency (D1) ---
  if (!force) {
    const existing = await env.DB
      .prepare(`SELECT id, generated_at FROM briefs WHERE user_id=0 AND brief_date=?`)
      .bind(briefDate)
      .first<{ id: number; generated_at: number }>();
    if (existing) {
      return new Response(JSON.stringify({
        ok: true,
        skipped: true,
        reason: 'brief zaten bugun uretildi',
        briefDate,
        generatedAt: existing.generated_at,
      }), { headers: { 'Content-Type': 'application/json' } });
    }
  }

  // --- Brief icerigini al (mevcut briefing endpoint'i) ---
  const origin = new URL(request.url).origin;
  const contentMd = await fetchBriefing(origin);
  if (!contentMd) {
    return new Response(JSON.stringify({ ok: false, error: 'Briefing endpoint cevap vermedi' }), {
      status: 502, headers: { 'Content-Type': 'application/json' },
    });
  }

  // --- D1'e yaz ---
  const generatedAt = Date.now();
  const insertResult = await env.DB
    .prepare(`INSERT OR REPLACE INTO briefs
      (user_id, brief_date, content_md, model_version, generated_at, sent_count)
      VALUES (0, ?, ?, ?, ?, 0)`)
    .bind(briefDate, contentMd, 'briefing-agent-v1', generatedAt)
    .run();

  if (!insertResult.success) {
    return new Response(JSON.stringify({ ok: false, error: 'D1 insert failed' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  // --- Push notification ---
  let pushStats = { sent: 0, failed: 0, expired: 0 };
  try {
    pushStats = await sendBriefPushes(env.DB, env, briefDate);
    // sent_count'u guncelle
    await env.DB
      .prepare(`UPDATE briefs SET sent_count=? WHERE user_id=0 AND brief_date=?`)
      .bind(pushStats.sent, briefDate)
      .run();
  } catch (e) {
    console.error('Push send failed:', (e as Error).message);
  }

  return new Response(JSON.stringify({
    ok: true,
    briefDate,
    generatedAt,
    contentLength: contentMd.length,
    push: pushStats,
  }), { headers: { 'Content-Type': 'application/json' } });
};
