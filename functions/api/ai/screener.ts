/**
 * Cloudflare Pages Function â€” DoÄŸal dil sorgudan filter spec Ã¼retir.
 *
 * POST /api/ai/screener
 * Body: { query: string, dataset?: 'stocks' | 'funds' }
 * Response: {
 *   ok: true, spec: ScreenerSpec, explanation: string, model: string,
 *   quota: { tier, limit, used, remaining, resetAt, windowSec }
 * }
 *
 * KullanÄ±cÄ±nÄ±n "BIST'te son 1 ayda %5+ getirili bankacÄ±lÄ±k hisseleri" gibi
 * doÄŸal dil sorgusunu yapÄ±landÄ±rÄ±lmÄ±ÅŸ filtre objesine Ã§evirir.
 * Frontend bu filtreyi lokal hisse/fon datasine uygular â€” hÄ±zlÄ±, ucuz.
 *
 * Tier-aware kota (#Ã– pricing): Her tier'Ä±n gÃ¼nlÃ¼k sorgu hakkÄ± farklÄ± â€”
 *   anon (login deÄŸil)  â†’ 1 deneme/gÃ¼n/IP
 *   free                â†’ 3 sorgu/gÃ¼n/kullanÄ±cÄ±
 *   pro                 â†’ 30 sorgu/gÃ¼n/kullanÄ±cÄ±
 *   elite               â†’ 150 sorgu/gÃ¼n/kullanÄ±cÄ±
 * Limit aÅŸÄ±lÄ±rsa 429 + JSON iÃ§inde quota bilgisi â†’ frontend upgrade prompt gÃ¶sterir.
 */

import { quotaCheck, getClientIp } from '../../_rate-limit';
import { getAuthedUser, type Env as AuthEnv } from '../auth/_utils';

interface Env extends AuthEnv {
  ANTHROPIC_API_KEY?: string;
  DB: D1Database;
}

type Op = '>' | '>=' | '<' | '<=' | '=' | '!=' | 'includes' | 'in';

interface ScreenerFilter {
  field: string;
  op: Op;
  value: number | string | string[];
}

interface ScreenerSpec {
  dataset: 'stocks' | 'funds';
  filters: ScreenerFilter[];
  sort?: { field: string; dir: 'asc' | 'desc' };
  limit: number;
  explanation: string;
  /**
   * BIST endeks kapsamÄ± â€” "BIST 100" / "BIST 30" sorgularÄ±nda AI buraya yazar.
   * Frontend `applySpec`'te BIST_100_SYMBOLS / BIST_30_SYMBOLS Set'iyle hard-filter.
   */
  scope?: 'XU100' | 'XU030';
}

interface AnthropicResponse {
  content: Array<{ text: string; type: string }>;
}

type Tier = 'anon' | 'free' | 'pro' | 'elite';

interface TierQuotaConfig {
  /** GÃ¼nlÃ¼k max sorgu sayÄ±sÄ±. */
  limit: number;
  /** Pencere geniÅŸliÄŸi (saniye) â€” varsayÄ±lan 24 saat. */
  windowSec: number;
}

const TIER_QUOTAS: Record<Tier, TierQuotaConfig> = {
  anon:  { limit: 1,   windowSec: 60 * 60 * 24 },
  free:  { limit: 3,   windowSec: 60 * 60 * 24 },
  pro:   { limit: 30,  windowSec: 60 * 60 * 24 },
  elite: { limit: 150, windowSec: 60 * 60 * 24 },
};

const STOCK_FIELDS = `
HÄ°SSE ALANLARI (dataset='stocks'):
- symbol (string): hisse kodu (Ã¶rn: GARAN, THYAO)
- name (string): ÅŸirket adÄ±
- sector (string): sektÃ¶r (Ã¶rn: "BankacÄ±lÄ±k", "Holding", "UlaÅŸÄ±m", "Savunma", "Otomotiv")
- price (number): gÃ¼ncel fiyat (TL)
- changePct (number): bugÃ¼n % deÄŸiÅŸim
- r1g (number): bugÃ¼n % deÄŸiÅŸim (changePct ile aynÄ±, alias)
- r1h (number): 1 haftalÄ±k % deÄŸiÅŸim
- r1a (number): 1 aylÄ±k % deÄŸiÅŸim
- r3a (number): 3 aylÄ±k % deÄŸiÅŸim
- r6a (number): 6 aylÄ±k % deÄŸiÅŸim
- r1y (number): 1 yÄ±llÄ±k % deÄŸiÅŸim
`;

const FUND_FIELDS = `
FON ALANLARI (dataset='funds'):
- code (string): fon kodu
- name (string): fon adÄ±
- category (string): "KatÄ±lÄ±m" | "Hisse Senedi" | "BorÃ§lanma AraÃ§larÄ±" | "Karma" | "DeÄŸiÅŸken" | "KÄ±ymetli Madenler" | "Para PiyasasÄ±" | "Fon Sepeti" | "Serbest"
- day (number): bugÃ¼n %
- week (number): 1 hafta %
- month (number): 1 ay %
- threeMonth (number): 3 ay %
- sixMonth (number): 6 ay %
- ytd (number): yÄ±l baÅŸÄ±ndan bugÃ¼ne %
- year (number): 1 yÄ±l %
`;

const SYSTEM_PROMPT = `Sen TÃ¼rk yatÄ±rÄ±mcÄ±sÄ± iÃ§in doÄŸal dil sorgularÄ±nÄ± yapÄ±landÄ±rÄ±lmÄ±ÅŸ filtreye Ã§eviren bir yardÄ±mcÄ±sÄ±n.

KullanÄ±cÄ± TÃ¼rkÃ§e finansal sorgular yazar (Ã¶rn. "son 1 ayda %5+ getirili bankacÄ±lÄ±k hisseleri", "katÄ±lÄ±m fonlarÄ± arasÄ±nda 1 yÄ±l en iyi 10").

GÃ¶revin: sorguyu analiz et, hisse mi fon mu olduÄŸuna karar ver, filtreleri Ã§Ä±kar ve JSON dÃ¶ndÃ¼r.

${STOCK_FIELDS}

${FUND_FIELDS}

KURALLAR:
1) "dataset" mutlaka 'stocks' veya 'funds'. Belirsizse hisse varsay.
2) OperatÃ¶rler: '>', '>=', '<', '<=', '=', '!=', 'includes' (string contains), 'in' (string array iÃ§inde).
3) SektÃ¶r/kategori iÃ§in 'includes' veya '=' kullan. TÃ¼rkÃ§e ve Ä°ngilizce eÅŸanlamlÄ±larÄ± tanÄ± (bank/bankacÄ±lÄ±k, holding, savunma/defense, otomotiv vb.).
4) "En iyi/en yÃ¼ksek" â†’ sort dir='desc'. "En dÃ¼ÅŸÃ¼k/en kÃ¶tÃ¼" â†’ sort dir='asc'.
5) "top N", "en iyi N" â†’ limit=N. BelirtilmemiÅŸse hisse iÃ§in 20, fon iÃ§in 10.
6) SayÄ±sal deÄŸerleri normalize et: "%5" â†’ 5, "%5'ten fazla" â†’ > 5, "%5+" â†’ >= 5.
7) explanation alanÄ±na TÃ¼rkÃ§e kÄ±sa Ã¶zet (max 100 karakter).
8) BIST ENDEKS KAPSAMI: KullanÄ±cÄ± "BIST 100" / "XU100" / "ana endeks" derse â†’ scope:"XU100".
   "BIST 30" / "XU030" / "bÃ¼yÃ¼k 30" derse â†’ scope:"XU030". BelirtilmemiÅŸse scope alanÄ±nÄ± yazma (tÃ¼m BIST evreni).
   Endeks SEKTÃ–R DEÄžÄ°L â€” yani "BIST 100 bankacÄ±lÄ±k" derse: scope:"XU100" + filters[sector includes BankacÄ±lÄ±k].
   Endeks kapsamÄ± sektÃ¶r filtresinden BAÄžIMSIZ olarak Ã§alÄ±ÅŸÄ±r.

Ã‡IKTI: SADECE geÃ§erli JSON, baÅŸka metin yok. Ã–rnekler:
{"dataset":"stocks","filters":[{"field":"sector","op":"includes","value":"BankacÄ±lÄ±k"},{"field":"r1a","op":">=","value":5}],"sort":{"field":"r1a","dir":"desc"},"limit":20,"explanation":"Son 1 ayda %5+ getirili bankacÄ±lÄ±k hisseleri"}
{"dataset":"stocks","filters":[{"field":"r1a","op":">=","value":5}],"sort":{"field":"r1a","dir":"desc"},"limit":20,"scope":"XU100","explanation":"BIST 100'de son 1 ayda %5+ artmÄ±ÅŸ hisseler"}
{"dataset":"stocks","filters":[],"sort":{"field":"r1y","dir":"desc"},"limit":10,"scope":"XU030","explanation":"BIST 30'da yÄ±llÄ±k en iyi 10 hisse"}`;

function tierFromUser(user: { tier?: 'free' | 'pro' | 'elite' } | null): Tier {
  if (!user) return 'anon';
  return user.tier ?? 'free';
}

function quotaPayload(tier: Tier, used: number, resetAt: number, config: TierQuotaConfig) {
  return {
    tier,
    limit: config.limit,
    used,
    remaining: Math.max(0, config.limit - used),
    resetAt,
    windowSec: config.windowSec,
  };
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // === DIAGNOSTIC: handler'a ulasiyor mu? ===
  // Body'de {debug: true} varsa erken JSON 200 don. 502 hala HTML'se sorun
  // Pages Functions level'da (bundle, routing). 200 JSON donerse handler ici sorun.
  try {
    const rawBody = await request.clone().json().catch(() => ({} as { debug?: boolean }));
    if ((rawBody as { debug?: boolean })?.debug === true) {
      return new Response(JSON.stringify({
        ok: true,
        diagnostic: 'handler_reached',
        hasAnthropicKey: !!env.ANTHROPIC_API_KEY,
        hasDb: !!env.DB,
        timestamp: Date.now(),
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  } catch (e) {
    return new Response(JSON.stringify({
      ok: false, error: `early_diagnostic_error: ${(e as Error).message}`,
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  // === BUYUK try/catch - hicbir exception 502 HTML page'e cikmasin ===
  try {

  if (!env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ ok: false, error: 'ANTHROPIC_API_KEY not set' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: { query?: string; dataset?: 'stocks' | 'funds' };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const userQuery = (body.query ?? '').trim();
  if (!userQuery) {
    return new Response(JSON.stringify({ ok: false, error: 'query zorunlu' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // --- Tier-aware quota: auth varsa user, yoksa IP key'i kullan ---
  const auth = await getAuthedUser(request, env).catch(() => null);
  const tier: Tier = tierFromUser(auth?.user ?? null);
  const identifier = auth?.user ? `u:${auth.user.id}` : `ip:${getClientIp(request)}`;
  const quotaConfig = TIER_QUOTAS[tier];

  // D1 yoksa fail-open (dev/preview) â€” middleware zaten production'da fail-closed yapÄ±yor.
  let quotaInfo;
  if (env.DB) {
    const check = await quotaCheck(
      env.DB,
      'screener',
      tier,
      identifier,
      quotaConfig.limit,
      quotaConfig.windowSec,
    );
    quotaInfo = quotaPayload(tier, check.count, check.resetAt, quotaConfig);

    if (!check.allowed) {
      const errorMsg =
        tier === 'anon'
          ? 'Ãœcretsiz deneme hakkÄ±n bitti. Ãœye ol, gÃ¼nlÃ¼k 3 sorgu hakkÄ± kazan.'
          : tier === 'free'
          ? `GÃ¼nlÃ¼k ${quotaConfig.limit} sorgu hakkÄ±n doldu. Pro\'ya geÃ§, gÃ¼nlÃ¼k ${TIER_QUOTAS.pro.limit} sorgu kullan.`
          : tier === 'pro'
          ? `GÃ¼nlÃ¼k ${quotaConfig.limit} sorgu hakkÄ±n doldu. Elite\'a geÃ§, gÃ¼nlÃ¼k ${TIER_QUOTAS.elite.limit} sorgu kullan.`
          : `GÃ¼nlÃ¼k ${quotaConfig.limit} sorgu hakkÄ±n doldu. ${formatResetHint(check.resetAt)} sonra yenilenir.`;

      return new Response(
        JSON.stringify({
          ok: false,
          error: errorMsg,
          code: 'QUOTA_EXCEEDED',
          quota: quotaInfo,
          retryAfter: check.retryAfter,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            'Retry-After': String(check.retryAfter),
            'X-Quota-Tier': tier,
            'X-Quota-Limit': String(quotaConfig.limit),
            'X-Quota-Used': String(check.count),
            'X-Quota-Reset': String(check.resetAt),
          },
        },
      );
    }
  }

  // Ã‡ok uzun sorgularÄ± kes (prompt injection + maliyet kontrolÃ¼)
  const safeQuery = userQuery.slice(0, 500);
  const datasetHint = body.dataset ? `\n\n(KullanÄ±cÄ± ipucu: dataset='${body.dataset}' olmalÄ±.)` : '';

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-latest',
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: `Sorgu: "${safeQuery}"${datasetHint}\n\nJSON dÃ¶ndÃ¼r:` },
        ],
      }),
    });

    if (!r.ok) {
      const errText = await r.text();
      return new Response(JSON.stringify({
        ok: false,
        error: `Anthropic ${r.status}: ${errText.slice(0, 200)}`,
        quota: quotaInfo,
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const aiRes = await r.json() as AnthropicResponse;
    const raw = aiRes.content?.[0]?.text?.trim() ?? '';

    // JSON Ã§Ä±kar â€” bazen ```json bloklarÄ±yla gelir, temizle
    let jsonText = raw;
    const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlock) jsonText = codeBlock[1].trim();
    // Ä°lk { ve son } arasÄ±nÄ± al
    const firstBrace = jsonText.indexOf('{');
    const lastBrace = jsonText.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      jsonText = jsonText.slice(firstBrace, lastBrace + 1);
    }

    let spec: ScreenerSpec;
    try {
      spec = JSON.parse(jsonText) as ScreenerSpec;
    } catch (e) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'LLM JSON parse hatasÄ±',
        raw: raw.slice(0, 300),
        quota: quotaInfo,
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // GÃ¼venlik: spec sanity check
    if (!spec.dataset || !Array.isArray(spec.filters)) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'GeÃ§ersiz spec yapÄ±sÄ±',
        spec,
        quota: quotaInfo,
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (spec.dataset !== 'stocks' && spec.dataset !== 'funds') {
      spec.dataset = 'stocks';
    }
    if (!spec.limit || spec.limit > 100) spec.limit = spec.dataset === 'stocks' ? 20 : 10;

    return new Response(JSON.stringify({
      ok: true,
      spec,
      model: 'claude-3-5-haiku-latest',
      quota: quotaInfo,
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...(quotaInfo
          ? {
              'X-Quota-Tier': quotaInfo.tier,
              'X-Quota-Limit': String(quotaInfo.limit),
              'X-Quota-Used': String(quotaInfo.used),
              'X-Quota-Reset': String(quotaInfo.resetAt),
            }
          : {}),
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({
      ok: false,
      error: `Network error: ${(e as Error).message}`,
      quota: quotaInfo,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  } catch (outerErr) {
    // ANY uncaught exception -> JSON 500 (CF 502 HTML yerine)
    return new Response(JSON.stringify({
      ok: false,
      error: 'screener_uncaught',
      message: (outerErr as Error)?.message ?? String(outerErr),
      stack: ((outerErr as Error)?.stack ?? '').split('\n').slice(0, 3).join(' | '),
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

/** "3 saat", "23 dk", "12 sn" gibi insancÄ±l reset ipucu Ã¼retir. */
function formatResetHint(resetAtSec: number): string {
  const now = Math.floor(Date.now() / 1000);
  const secs = Math.max(0, resetAtSec - now);
  if (secs >= 3600) return `${Math.ceil(secs / 3600)} saat`;
  if (secs >= 60) return `${Math.ceil(secs / 60)} dk`;
  return `${secs} sn`;
}
