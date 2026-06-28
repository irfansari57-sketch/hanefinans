/**
 * Cloudflare Pages Function — Doğal dil sorgudan filter spec üretir.
 *
 * POST /api/ai/screener
 * Body: { query: string, dataset?: 'stocks' | 'funds' }
 * Response: {
 *   ok: true, spec: ScreenerSpec, explanation: string, model: string,
 *   quota: { tier, limit, used, remaining, resetAt, windowSec }
 * }
 *
 * Kullanıcının "BIST'te son 1 ayda %5+ getirili bankacılık hisseleri" gibi
 * doğal dil sorgusunu yapılandırılmış filtre objesine çevirir.
 * Frontend bu filtreyi lokal hisse/fon datasine uygular — hızlı, ucuz.
 *
 * Tier-aware kota (#Ö pricing): Her tier'ın günlük sorgu hakkı farklı —
 *   anon (login değil)  → 1 deneme/gün/IP
 *   free                → 3 sorgu/gün/kullanıcı
 *   pro                 → 30 sorgu/gün/kullanıcı
 *   elite               → 150 sorgu/gün/kullanıcı
 * Limit aşılırsa 429 + JSON içinde quota bilgisi → frontend upgrade prompt gösterir.
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
   * BIST endeks kapsamı — "BIST 100" / "BIST 30" sorgularında AI buraya yazar.
   * Frontend `applySpec`'te BIST_100_SYMBOLS / BIST_30_SYMBOLS Set'iyle hard-filter.
   */
  scope?: 'XU100' | 'XU030';
}

interface AnthropicResponse {
  content: Array<{ text: string; type: string }>;
}

type Tier = 'anon' | 'free' | 'pro' | 'elite';

interface TierQuotaConfig {
  /** Günlük max sorgu sayısı. */
  limit: number;
  /** Pencere genişliği (saniye) — varsayılan 24 saat. */
  windowSec: number;
}

const TIER_QUOTAS: Record<Tier, TierQuotaConfig> = {
  anon:  { limit: 1,   windowSec: 60 * 60 * 24 },
  free:  { limit: 3,   windowSec: 60 * 60 * 24 },
  pro:   { limit: 30,  windowSec: 60 * 60 * 24 },
  elite: { limit: 150, windowSec: 60 * 60 * 24 },
};

const STOCK_FIELDS = `
HİSSE ALANLARI (dataset='stocks'):
- symbol (string): hisse kodu (örn: GARAN, THYAO)
- name (string): şirket adı
- sector (string): sektör (örn: "Bankacılık", "Holding", "Ulaşım", "Savunma", "Otomotiv")
- price (number): güncel fiyat (TL)
- changePct (number): bugün % değişim
- r1g (number): bugün % değişim (changePct ile aynı, alias)
- r1h (number): 1 haftalık % değişim
- r1a (number): 1 aylık % değişim
- r3a (number): 3 aylık % değişim
- r6a (number): 6 aylık % değişim
- r1y (number): 1 yıllık % değişim
`;

const FUND_FIELDS = `
FON ALANLARI (dataset='funds'):
- code (string): fon kodu
- name (string): fon adı
- category (string): "Katılım" | "Hisse Senedi" | "Borçlanma Araçları" | "Karma" | "Değişken" | "Kıymetli Madenler" | "Para Piyasası" | "Fon Sepeti" | "Serbest"
- day (number): bugün %
- week (number): 1 hafta %
- month (number): 1 ay %
- threeMonth (number): 3 ay %
- sixMonth (number): 6 ay %
- ytd (number): yıl başından bugüne %
- year (number): 1 yıl %
`;

const SYSTEM_PROMPT = `Sen Türk yatırımcısı için doğal dil sorgularını yapılandırılmış filtreye çeviren bir yardımcısın.

Kullanıcı Türkçe finansal sorgular yazar (örn. "son 1 ayda %5+ getirili bankacılık hisseleri", "katılım fonları arasında 1 yıl en iyi 10").

Görevin: sorguyu analiz et, hisse mi fon mu olduğuna karar ver, filtreleri çıkar ve JSON döndür.

${STOCK_FIELDS}

${FUND_FIELDS}

KURALLAR:
1) "dataset" mutlaka 'stocks' veya 'funds'. Belirsizse hisse varsay.
2) Operatörler: '>', '>=', '<', '<=', '=', '!=', 'includes' (string contains), 'in' (string array içinde).
3) Sektör/kategori için 'includes' veya '=' kullan. Türkçe ve İngilizce eşanlamlıları tanı (bank/bankacılık, holding, savunma/defense, otomotiv vb.).
4) "En iyi/en yüksek" → sort dir='desc'. "En düşük/en kötü" → sort dir='asc'.
5) "top N", "en iyi N" → limit=N. Belirtilmemişse hisse için 20, fon için 10.
6) Sayısal değerleri normalize et: "%5" → 5, "%5'ten fazla" → > 5, "%5+" → >= 5.
7) explanation alanına Türkçe kısa özet (max 100 karakter).
8) BIST ENDEKS KAPSAMI: Kullanıcı "BIST 100" / "XU100" / "ana endeks" derse → scope:"XU100".
   "BIST 30" / "XU030" / "büyük 30" derse → scope:"XU030". Belirtilmemişse scope alanını yazma (tüm BIST evreni).
   Endeks SEKTÖR DEĞİL — yani "BIST 100 bankacılık" derse: scope:"XU100" + filters[sector includes Bankacılık].
   Endeks kapsamı sektör filtresinden BAĞIMSIZ olarak çalışır.

ÇIKTI: SADECE geçerli JSON, başka metin yok. Örnekler:
{"dataset":"stocks","filters":[{"field":"sector","op":"includes","value":"Bankacılık"},{"field":"r1a","op":">=","value":5}],"sort":{"field":"r1a","dir":"desc"},"limit":20,"explanation":"Son 1 ayda %5+ getirili bankacılık hisseleri"}
{"dataset":"stocks","filters":[{"field":"r1a","op":">=","value":5}],"sort":{"field":"r1a","dir":"desc"},"limit":20,"scope":"XU100","explanation":"BIST 100'de son 1 ayda %5+ artmış hisseler"}
{"dataset":"stocks","filters":[],"sort":{"field":"r1y","dir":"desc"},"limit":10,"scope":"XU030","explanation":"BIST 30'da yıllık en iyi 10 hisse"}`;

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

  // D1 yoksa fail-open (dev/preview) — middleware zaten production'da fail-closed yapıyor.
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
          ? 'Ücretsiz deneme hakkın bitti. Üye ol, günlük 3 sorgu hakkı kazan.'
          : tier === 'free'
          ? `Günlük ${quotaConfig.limit} sorgu hakkın doldu. Pro\'ya geç, günlük ${TIER_QUOTAS.pro.limit} sorgu kullan.`
          : tier === 'pro'
          ? `Günlük ${quotaConfig.limit} sorgu hakkın doldu. Elite\'a geç, günlük ${TIER_QUOTAS.elite.limit} sorgu kullan.`
          : `Günlük ${quotaConfig.limit} sorgu hakkın doldu. ${formatResetHint(check.resetAt)} sonra yenilenir.`;

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

  // Çok uzun sorguları kes (prompt injection + maliyet kontrolü)
  const safeQuery = userQuery.slice(0, 500);
  const datasetHint = body.dataset ? `\n\n(Kullanıcı ipucu: dataset='${body.dataset}' olmalı.)` : '';

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
          { role: 'user', content: `Sorgu: "${safeQuery}"${datasetHint}\n\nJSON döndür:` },
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

    // JSON çıkar — bazen ```json bloklarıyla gelir, temizle
    let jsonText = raw;
    const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlock) jsonText = codeBlock[1].trim();
    // İlk { ve son } arasını al
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
        error: 'LLM JSON parse hatası',
        raw: raw.slice(0, 300),
        quota: quotaInfo,
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Güvenlik: spec sanity check
    if (!spec.dataset || !Array.isArray(spec.filters)) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'Geçersiz spec yapısı',
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

/** "3 saat", "23 dk", "12 sn" gibi insancıl reset ipucu üretir. */
function formatResetHint(resetAtSec: number): string {
  const now = Math.floor(Date.now() / 1000);
  const secs = Math.max(0, resetAtSec - now);
  if (secs >= 3600) return `${Math.ceil(secs / 3600)} saat`;
  if (secs >= 60) return `${Math.ceil(secs / 60)} dk`;
  return `${secs} sn`;
}
