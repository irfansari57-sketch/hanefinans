/**
 * Cloudflare Pages Function — Günlük piyasa raporu Telegram'a otomatik gönderir.
 *
 * GitHub Actions cron tarafından sabah 08:00/09:00/10:00 TR (05/06/07 UTC) çağrılır.
 * Auth: X-Cron-Secret header'ında CRON_SECRET env var ile eşleşmeli.
 *
 * v3 (May 2026): KV idempotency eklendi
 *   - GitHub free tier cron tetiklemesi güvenilmez (1-2 saat gecikme ya da atlama)
 *   - Workflow 3 farklı saatte tetiklenir → ilk başarılı çalışma KV'ye yazar
 *   - Sonraki tetiklemeler KV check ile skip eder
 *   - KV anahtarı: briefing-sent:YYYY-MM-DD (TTL 25 saat)
 *   - ?force=1 query parametresi idempotency bypass (manuel test için)
 *
 * v2: Mevcut /api/agents/briefing endpoint'ini çağırır — 4 ajan (macro+news+sentiment+indicator)
 * birleşik bir Markdown brifing üretir. Bu brifing Telegram'a yollanır.
 */

interface Env {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_DAILY_RECIPIENTS?: string;
  VITE_TELEGRAM_CHAT_ID?: string;
  CRON_SECRET?: string;
  /** Idempotency için zaten projeye bağlı KV namespace'ini paylaşıyoruz */
  HANEFINANS_FUNDS?: KVNamespace;
}

interface BriefingPayload {
  ok: boolean;
  text?: string;
  generatedAt?: string;
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

async function sendTelegram(token: string, chatId: string, text: string): Promise<boolean> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

type Session = 'morning' | 'midday' | 'evening';

/** Bugünün UTC tarihinden idempotency anahtarı üret. Session bazlı (her oturum ayrı). */
function todayKey(session: Session): string {
  return `briefing-sent:${new Date().toISOString().slice(0, 10)}:${session}`;
}

/** Session ID'sini normalize et — geçersizse 'morning' (geriye dönük uyumluluk). */
function normalizeSession(raw: string | null): Session {
  if (raw === 'midday' || raw === 'evening') return raw;
  return 'morning';
}

/** Session etiketi → Türkçe alt başlık (Brifingi'nin altına gelir). */
function sessionSubtitle(session: Session): string {
  if (session === 'midday') return '🕛 _Öğle Güncellemesi_';
  if (session === 'evening') return '🌆 _Kapanış Raporu_';
  return '🌅 _Sabah Raporu_';
}

/**
 * TR saatine göre o anda hangi session beklenir?
 * Pencereler — geç gelen cron'ları sessiz skip etmek için kullanılır.
 *   07:00–11:59 TR → morning
 *   12:00–15:59 TR → midday
 *   16:00–21:59 TR → evening
 *   diğer saatler → null (gönderme)
 */
function expectedSessionForTrTime(d: Date = new Date()): Session | null {
  // UTC saatini TR saatine (+3) çevir
  const trHour = (d.getUTCHours() + 3) % 24;
  if (trHour >= 7 && trHour < 12) return 'morning';
  if (trHour >= 12 && trHour < 16) return 'midday';
  if (trHour >= 16 && trHour < 22) return 'evening';
  return null;
}

/** Cron'un session ile gerçek saatin uyuşması — sapma varsa pencere dışı sayılır. */
function isSessionInWindow(session: Session, d: Date = new Date()): boolean {
  const expected = expectedSessionForTrTime(d);
  return expected !== null && expected === session;
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
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
  if (!env.TELEGRAM_BOT_TOKEN) {
    return new Response(JSON.stringify({ ok: false, error: 'TELEGRAM_BOT_TOKEN missing' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';
  const session = normalizeSession(url.searchParams.get('session'));
  const key = todayKey(session);

  // --- TIME WINDOW GUARD ---
  // GitHub Actions free-tier cron'u 1–10 saat gecikebiliyor.
  // "Sabah" cron'u akşam 18:59'da tetiklendiğinde, brifing "Sabah Raporu" başlığıyla
  // gecikmiş şekilde gönderiliyordu. Şimdi gerçek TR saatine bakıyoruz —
  // session için beklenen pencerede değilsek sessizce skip ediyoruz.
  // ?force=1 ile bypass mümkün.
  if (!force && !isSessionInWindow(session)) {
    return new Response(JSON.stringify({
      ok: true,
      skipped: true,
      reason: 'out of expected TR time window for session',
      session,
      trHour: (new Date().getUTCHours() + 3) % 24,
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  // --- IDEMPOTENCY CHECK ---
  // Multi-cron workflow (05/06/07 UTC) tetiklendiğinde, ilk başarılı çalışma
  // KV'ye yazar; sonraki tetiklemeler skip eder. ?force=1 ile bypass mümkün.
  if (env.HANEFINANS_FUNDS && !force) {
    try {
      const already = await env.HANEFINANS_FUNDS.get(key);
      if (already) {
        return new Response(JSON.stringify({
          ok: true,
          skipped: true,
          reason: 'already sent today (idempotency)',
          sentAt: already,
          key,
        }), { headers: { 'Content-Type': 'application/json' } });
      }
    } catch (e) {
      // KV erişiminde sorun varsa skip etme, devam et — daha güvenli
      console.error('KV read failed, continuing:', (e as Error).message);
    }
  }

  const recipients = new Set<string>();
  if (env.TELEGRAM_DAILY_RECIPIENTS) {
    env.TELEGRAM_DAILY_RECIPIENTS.split(',').map((s) => s.trim()).filter(Boolean).forEach((id) => recipients.add(id));
  }
  if (env.VITE_TELEGRAM_CHAT_ID) recipients.add(env.VITE_TELEGRAM_CHAT_ID);
  if (recipients.size === 0) {
    return new Response(JSON.stringify({ ok: false, error: 'No recipients configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Briefing endpoint'ini çağır
  const origin = new URL(request.url).origin;
  const text = await fetchBriefing(origin);
  if (!text) {
    return new Response(JSON.stringify({ ok: false, error: 'Briefing endpoint cevap vermedi' }), {
      status: 502, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Brifing kendi başlığını (📊 *Hane Finans Brifingi*) içeriyor — onun ALTINA session
  // alt başlığını yerleştir. Böylece Telegram bildirim önizlemesinde önce "Hane Finans
  // Brifingi" görünür, kullanıcı bildirimi hangi proje gönderdi anında anlar.
  const subtitle = sessionSubtitle(session);
  // İlk satır brifing başlığı, ikinci satır tarih → tarihten sonra session subtitle ekle.
  const lines = text.split('\n');
  if (lines.length >= 2 && lines[0].includes('Hane Finans Brifingi')) {
    // [0] = "📊 *Hane Finans Brifingi*"
    // [1] = "_22 Mayıs 2026 Cuma_"
    // session subtitle'ı [1]'in altına sokuştur
    lines.splice(2, 0, subtitle);
  } else {
    // Fallback: brifing format değiştiyse en üste prepend et
    lines.unshift(subtitle);
  }
  const fullText = lines.join('\n');

  const results = await Promise.all(
    Array.from(recipients).map(async (chatId) => ({
      chatId,
      ok: await sendTelegram(env.TELEGRAM_BOT_TOKEN!, chatId, fullText),
    })),
  );

  const okCount = results.filter((r) => r.ok).length;

  // --- KV WRITE on success ---
  // En az 1 alıcıya başarılı gönderim olduysa, bugün gönderildi olarak işaretle.
  // TTL 25 saat → ertesi gün sabah cron'u yine taze key görür.
  if (env.HANEFINANS_FUNDS && okCount > 0 && !force) {
    try {
      await env.HANEFINANS_FUNDS.put(key, new Date().toISOString(), {
        expirationTtl: 25 * 3600,
      });
    } catch (e) {
      console.error('KV write failed (mesaj yine de gitti):', (e as Error).message);
    }
  }

  return new Response(JSON.stringify({
    ok: okCount > 0,
    sent: okCount,
    total: results.length,
    results,
    session,
    reportPreview: fullText.slice(0, 200),
    key,
    forced: force,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
