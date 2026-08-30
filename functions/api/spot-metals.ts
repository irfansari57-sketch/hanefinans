/**
 * GET /api/spot-metals
 *
 * Phase 2: Backend D1 cache — XAU/XAG/XPT/XPD spot USD/ons fiyatlari.
 *
 * Kaynak: `metals_spot` tablosu, `/api/cron/metals-refresh` yaziyor
 * (GitHub Actions her 30dk hafta ici, 2h hafta sonu).
 *
 * Response shape frontend `src/data/api/spotMetals.ts` ile uyumlu:
 *   { ok, bundleUpdatedAt, XAU?, XAG?, XPT? }
 *   Her metal: { value, changePct, updatedAt, source }
 *
 * XPD ayni tabloda tutulur ama shape'in disinda extra field — frontend
 * `metalsapi.ts`'daki XPD kanali icin bagimsiz optional.
 *
 * TTL yok — D1 read hizli, cron zaten stale koruma yapiyor (12+ saat eski
 * ise updated_at 0 kalir ve frontend bunu stale sayar).
 */

interface Env {
  DB?: D1Database;
}

interface MetalRow {
  metal: string;
  price_usd: number;
  change_pct: number;
  source: string;
  updated_at: number;
}

interface SpotMetalQuote {
  value: number;
  changePct: number;
  updatedAt: string; // ISO
  source: string;
}

interface SpotMetalsResponse {
  ok: boolean;
  bundleUpdatedAt?: number;
  XAU?: SpotMetalQuote;
  XAG?: SpotMetalQuote;
  XPT?: SpotMetalQuote;
  XPD?: SpotMetalQuote;
}

function rowToQuote(row: MetalRow | null): SpotMetalQuote | undefined {
  if (!row || !row.price_usd || row.price_usd <= 0 || row.updated_at <= 0) return undefined;
  return {
    value: row.price_usd,
    changePct: row.change_pct ?? 0,
    updatedAt: new Date(row.updated_at).toISOString(),
    source: row.source ?? 'yahoo',
  };
}

export const onRequest: PagesFunction<Env> = async ({ env }) => {
  if (!env.DB) {
    return new Response(JSON.stringify({ ok: false, reason: 'no-db' } satisfies SpotMetalsResponse), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=60',
        'X-Source': 'no-db',
      },
    });
  }

  try {
    const stmt = await env.DB.prepare(
      `SELECT metal, price_usd, change_pct, source, updated_at
       FROM metals_spot
       WHERE metal IN ('XAU','XAG','XPT','XPD')`,
    ).all<MetalRow>();

    const rows = stmt.results ?? [];
    const xau = rowToQuote(rows.find((r) => r.metal === 'XAU') ?? null);
    const xag = rowToQuote(rows.find((r) => r.metal === 'XAG') ?? null);
    const xpt = rowToQuote(rows.find((r) => r.metal === 'XPT') ?? null);
    const xpd = rowToQuote(rows.find((r) => r.metal === 'XPD') ?? null);

    // Bundle updated = en yeni row'un updated_at'i (frontend stale check icin)
    const maxUpdated = rows.reduce((acc, r) => Math.max(acc, r.updated_at || 0), 0);
    const anyValid = !!(xau || xag || xpt || xpd);

    const body: SpotMetalsResponse = {
      ok: anyValid,
      bundleUpdatedAt: maxUpdated > 0 ? maxUpdated : undefined,
      XAU: xau,
      XAG: xag,
      XPT: xpt,
      XPD: xpd,
    };

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        // 60s edge cache — cron 30dk'da bir yazar, edge cache 60s ile kotayi
        // yormaz ama panel auto-refresh de guncel gorur.
        'Cache-Control': 'public, max-age=60, s-maxage=60',
        'X-Source': 'd1-metals-spot',
      },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, reason: `d1-error: ${(e as Error).message}` } satisfies SpotMetalsResponse),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
          'X-Source': 'error',
        },
      },
    );
  }
};
