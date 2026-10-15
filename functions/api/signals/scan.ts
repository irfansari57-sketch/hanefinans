/**
 * GET /api/signals/scan?scope=bist100
 *
 * Sinyal taraması (Hafta 3, 15 Eki 2026). bars_daily'den BIST 100 evreninin son
 * 300 barını okur, src/lib/signals.ts kurallarını XU100 rejim bağlamıyla değerlendirir.
 * Yanıt: sembol → sinyaller (+ her birinin kanıt satırları). Edge cache 30 dk
 * (barlar gece yazılır; gün içi değişmez).
 *
 * Al/sat dili yok; "teknik durum" listesidir. Yatırım tavsiyesi değildir.
 */

import { evaluateSignals, type Bar, type Signal } from '../../../src/lib/signals';
import { computeTrend } from '../../../src/lib/regime';
import { BIST_100_UNIVERSE } from '../_universe';

interface Env { DB: D1Database }
interface Row { symbol: string; date: string; open: number; high: number; low: number; close: number; volume: number }

export interface ScanItem { symbol: string; asOfDate: string; close: number; changePct: number | null; signals: Signal[] }

export const onRequestGet: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const url = new URL(request.url);
  const scope = url.searchParams.get('scope') === 'all' ? 'all' : 'bist100';
  if (!env.DB) {
    return new Response(JSON.stringify({ ok: false, error: 'D1 not bound' }), { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheUrl = new URL(request.url);
  cacheUrl.search = '';
  cacheUrl.searchParams.set('scope', scope);
  cacheUrl.searchParams.set('cv', '1');
  const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });
  const hit = await cache.match(cacheKey);
  if (hit && hit.ok) return hit;

  const started = Date.now();
  try {
    // Evren: bist100 sabit liste; 'all' = bars_meta'daki tüm semboller (endeksler hariç)
    let universe: string[] = BIST_100_UNIVERSE;
    if (scope === 'all') {
      const r = await env.DB.prepare("SELECT symbol FROM bars_meta WHERE bar_count >= 60 AND symbol NOT LIKE 'XU%'").all<{ symbol: string }>();
      universe = (r.results ?? []).map((x) => x.symbol);
    }

    // XU100 rejimi (trend) — bağlam
    const idxRows = await env.DB.prepare('SELECT close FROM bars_daily WHERE symbol = ? ORDER BY date DESC LIMIT 400').bind('XU100').all<{ close: number }>();
    const idxCloses = (idxRows.results ?? []).map((r) => r.close).reverse();
    const indexTrend = idxCloses.length >= 60 ? computeTrend(idxCloses).regime : null;

    // Barlar: sembol başına son 300 — D1 batch (20'şerli)
    const bySym = new Map<string, Bar[]>();
    const CH = 20;
    for (let i = 0; i < universe.length; i += CH) {
      const slice = universe.slice(i, i + CH);
      const stmts = slice.map((sym) =>
        env.DB.prepare('SELECT symbol, date, open, high, low, close, volume FROM bars_daily WHERE symbol = ? ORDER BY date DESC LIMIT 300').bind(sym),
      );
      const results = await env.DB.batch<Row>(stmts);
      for (const res of results) {
        const rows = (res.results ?? []).reverse();
        if (rows.length === 0) continue;
        bySym.set(rows[0].symbol, rows.map((r) => ({ date: r.date, open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume ?? 0 })));
      }
    }

    const items: ScanItem[] = [];
    let evaluated = 0;
    for (const [symbol, bars] of bySym) {
      if (bars.length < 60) continue;
      evaluated++;
      const sigs = evaluateSignals(bars, indexTrend, 'bars_daily');
      if (sigs.length === 0) continue;
      const last = bars[bars.length - 1], prev = bars[bars.length - 2];
      items.push({
        symbol, asOfDate: last.date, close: last.close,
        changePct: prev && prev.close > 0 ? ((last.close - prev.close) / prev.close) * 100 : null,
        signals: sigs,
      });
    }
    // Sıra: güç toplamı, sonra rejime uyumlu olanlar
    items.sort((a, b) => {
      const sa = a.signals.reduce((x, s) => x + s.strength + (s.regimeFit === 'uyumlu' ? 0.5 : 0), 0);
      const sb = b.signals.reduce((x, s) => x + s.strength + (s.regimeFit === 'uyumlu' ? 0.5 : 0), 0);
      return sb - sa;
    });

    const counts: Record<string, number> = {};
    for (const it of items) for (const s of it.signals) counts[s.kind] = (counts[s.kind] ?? 0) + 1;

    const body = {
      ok: true,
      scope,
      computedAt: new Date().toISOString(),
      indexTrend,
      universe: universe.length,
      evaluated,
      withSignals: items.length,
      counts,
      elapsedMs: Date.now() - started,
      items,
      disclaimer: 'Tanımlı teknik kurallardan geçen durumlar; yatırım tavsiyesi değildir.',
    };
    const resp = new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=600, s-maxage=1800, stale-while-revalidate=3600' },
    });
    if (evaluated > 0) waitUntil(cache.put(cacheKey, resp.clone()).catch(() => { /* noop */ }));
    return resp;
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
};
