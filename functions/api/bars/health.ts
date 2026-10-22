/**
 * GET /api/bars/health
 *
 * bars_daily kapsama özeti: sembol sayısı, toplam bar, en eski/yeni tarih,
 * son 3 iş gününde güncellenmemiş semboller, hata kaydı olanlar. Cron sonrası
 * doğrulama ve Hafta 1 kapısı ("100 sembolde 3 yıl") için.
 */

interface Env { DB: D1Database }

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  if (!env.DB) {
    return new Response(JSON.stringify({ ok: false, error: 'D1 not bound' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
  try {
    const totals = await env.DB.prepare(
      'SELECT COUNT(DISTINCT symbol) AS symbols, COUNT(*) AS bars, MIN(date) AS first_date, MAX(date) AS last_date FROM bars_daily',
    ).first<{ symbols: number; bars: number; first_date: string | null; last_date: string | null }>();
    type MetaRow = { symbol: string; first_date: string | null; last_date: string | null; bar_count: number; last_run_at: number; last_error: string | null; healed_count?: number | null; last_heal_at?: number | null };
    // Migration 023 (healed_count, last_heal_at) uygulanmamış olabilir → kolonsuz sorguya düş
    let healColumns = true;
    const meta = await env.DB.prepare(
      'SELECT symbol, first_date, last_date, bar_count, last_run_at, last_error, healed_count, last_heal_at FROM bars_meta ORDER BY symbol',
    ).all<MetaRow>().catch(async () => {
      healColumns = false;
      return env.DB.prepare(
        'SELECT symbol, first_date, last_date, bar_count, last_run_at, last_error FROM bars_meta ORDER BY symbol',
      ).all<MetaRow>();
    });
    const rows = meta.results ?? [];
    // bars_daily.source != 'yahoo' olan son-bar sayısı (İş Yatırım ile tamamlanan)
    const healedBars = await env.DB.prepare(
      "SELECT COUNT(*) AS n, MAX(date) AS d FROM bars_daily WHERE source = 'isyatirim-close'",
    ).first<{ n: number; d: string | null }>().catch(() => null);
    const dayAgo = Date.now() - 86_400_000;
    const healedRows = rows.filter((r) => (r.healed_count ?? 0) > 0);
    const latest = totals?.last_date ?? null;
    const stale = rows.filter((r) => latest && r.last_date && r.last_date < latest).map((r) => ({ symbol: r.symbol, lastDate: r.last_date }));
    const errored = rows.filter((r) => r.last_error).map((r) => ({ symbol: r.symbol, error: r.last_error }));
    const shortHistory = rows.filter((r) => r.bar_count < 500).map((r) => ({ symbol: r.symbol, bars: r.bar_count }));
    const body = {
      ok: true,
      asOf: new Date().toISOString(),
      symbols: totals?.symbols ?? 0,
      bars: totals?.bars ?? 0,
      firstDate: totals?.first_date,
      lastDate: latest,
      coverage: {
        full3y: rows.filter((r) => r.bar_count >= 700).length,
        shortHistory: shortHistory.length,
        staleSymbols: stale.length,
        errored: errored.length,
      },
      /** Self-heal özeti (bars-warm → İş Yatırım kapanışı). metaColumns=false ise migration 023 bekleniyor. */
      healed: {
        metaColumns: healColumns,
        symbols: healedRows.length,
        last24h: healedRows.filter((r) => (r.last_heal_at ?? 0) >= dayAgo).length,
        isyatirimBars: healedBars?.n ?? 0,
        lastHealedBarDate: healedBars?.d ?? null,
        recent: healedRows
          .sort((a, b) => (b.last_heal_at ?? 0) - (a.last_heal_at ?? 0))
          .slice(0, 20)
          .map((r) => ({ symbol: r.symbol, count: r.healed_count ?? 0, lastHealAt: r.last_heal_at ?? null })),
      },
      stale: stale.slice(0, 50),
      errored: errored.slice(0, 50),
      shortHistory: shortHistory.slice(0, 50),
    };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=120' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: `D1: ${(e as Error).message.slice(0, 120)}` }), { status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }
};
