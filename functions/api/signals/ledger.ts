/**
 * GET /api/signals/ledger?days=90|180|365&scope=bist100|all&kind=<SignalKind>
 *
 * Kanıt Defteri okuma (Sinyal Motoru Hafta 5, 22 Eki 2026). signal_ledger'daki
 * kayıtları kurala göre özetler: n, doldurulmuş n, ortalama/medyan 5/20/60g getiri,
 * pozitif oranı (hit rate), endekse göre ortalama fark (ret − XU100 ret) + son 50 kayıt.
 * Örneklem kuralı sunucuda: doldurulmuş n < 20 → insufficient:true (istatistik null).
 *
 * Edge cache 1 saat (barlar gece yazılır, defter günde bir dolar). Hata 503/500 no-store.
 * Public kova (functions/_rate-limit.ts: /api/signals/ zaten public).
 *
 * Bu bir performans ölçümüdür; geçmiş sonuç gelecek getiri garantisi değildir;
 * işlem maliyeti ve kayma dahil değildir. Yatırım tavsiyesi değildir.
 */

import { summarizeByKind, MIN_SAMPLE, LEDGER_WINDOWS, type KindStats } from '../../../src/lib/ledgerStats';
import { SIGNAL_LABELS } from '../../../src/lib/signals';
import { BIST_100_UNIVERSE } from '../_universe';

interface Env { DB: D1Database }

export interface LedgerRow {
  id: number; symbol: string; kind: string; direction: string; strength: number; regime_fit: string | null;
  signal_date: string; entry_close: number; index_entry_close: number | null;
  ret_5d: number | null; ret_20d: number | null; ret_60d: number | null;
  index_ret_5d: number | null; index_ret_20d: number | null; index_ret_60d: number | null;
  filled_at: number | null;
}

export interface LedgerResponse {
  ok: true;
  days: number; scope: 'bist100' | 'all'; kind: string | null;
  since: string; computedAt: string;
  total: number; filled60: number; minSample: number; windows: readonly number[];
  stats: Array<KindStats & { label: string }>;
  recent: LedgerRow[];
  method: { window: string; basis: string; excess: string; hitRate: string; caveat: string };
  disclaimer: string;
}

const ALLOWED_DAYS = [90, 180, 365] as const;
const MIGRATION_HINT = 'signal_ledger tablosu yok → npx wrangler d1 execute hanefinans-db --remote --file=functions/migrations/022_signal_ledger.sql';

function err(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ ok: false, ...body }), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const url = new URL(request.url);
  const daysRaw = Number(url.searchParams.get('days') ?? 90);
  const days: number = (ALLOWED_DAYS as readonly number[]).includes(daysRaw) ? daysRaw : 90;
  const scope = url.searchParams.get('scope') === 'all' ? 'all' : 'bist100';
  const kindRaw = url.searchParams.get('kind');
  const kind = kindRaw && kindRaw in SIGNAL_LABELS ? kindRaw : null;

  if (!env.DB) return err(503, { error: 'D1 not bound' });

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheUrl = new URL(request.url);
  cacheUrl.search = '';
  cacheUrl.searchParams.set('days', String(days));
  cacheUrl.searchParams.set('scope', scope);
  if (kind) cacheUrl.searchParams.set('kind', kind);
  cacheUrl.searchParams.set('cv', '1');
  const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });
  const hit = await cache.match(cacheKey);
  if (hit && hit.ok) return hit;

  const sinceD = new Date();
  sinceD.setUTCDate(sinceD.getUTCDate() - days);
  const since = sinceD.toISOString().slice(0, 10);

  try {
    const sql = `SELECT id, symbol, kind, direction, strength, regime_fit, signal_date, entry_close, index_entry_close,
                        ret_5d, ret_20d, ret_60d, index_ret_5d, index_ret_20d, index_ret_60d, filled_at
                 FROM signal_ledger WHERE signal_date >= ?${kind ? ' AND kind = ?' : ''}
                 ORDER BY signal_date DESC, id DESC
                 LIMIT 20000`; // denetim: sınırsız SELECT → 20k üst sınır
    const stmt = kind ? env.DB.prepare(sql).bind(since, kind) : env.DB.prepare(sql).bind(since);
    const res = await stmt.all<LedgerRow>();
    let rows = res.results ?? [];
    // Kapsam filtresi JS'te: D1 bound-param sınırı (100) IN(...) listesine yetmez
    if (scope === 'bist100') {
      const set = new Set(BIST_100_UNIVERSE);
      rows = rows.filter((r) => set.has(r.symbol));
    }

    const stats = summarizeByKind(rows)
      .map((s) => ({ ...s, label: SIGNAL_LABELS[s.kind as keyof typeof SIGNAL_LABELS] ?? s.kind }))
      .sort((a, b) => b.n - a.n);

    const body: LedgerResponse = {
      ok: true,
      days, scope, kind,
      since,
      computedAt: new Date().toISOString(),
      total: rows.length,
      filled60: rows.filter((r) => r.ret_60d != null).length,
      minSample: MIN_SAMPLE,
      windows: LEDGER_WINDOWS,
      stats,
      recent: rows.slice(0, 50),
      method: {
        window: 'N işlem günü = sinyal gününden sonraki N adet bars_daily barı (takvim günü değil).',
        basis: 'Kapanıştan kapanışa (sinyal günü düzeltilmiş kapanış → N. bar kapanışı); temettü düzeltmesi bars_daily kadar.',
        excess: 'Endekse göre fark = hisse getirisi − aynı pencerede XU100 getirisi (yüzde puan).',
        hitRate: 'Pozitif oranı = getirisi > 0 olan kayıt / doldurulmuş kayıt.',
        caveat: `Doldurulmuş n < ${MIN_SAMPLE} ise istatistik gösterilmez. İşlem maliyeti ve kayma dahil değildir.`,
      },
      disclaimer: 'Performans ölçümüdür; geçmiş sonuç gelecek getiri garantisi değildir. Yatırım tavsiyesi değildir.',
    };

    const resp = new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=3600' },
    });
    waitUntil(cache.put(cacheKey, resp.clone()).catch(() => { /* noop */ }));
    return resp;
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    if (/no such table/i.test(msg)) return err(503, { error: msg, hint: MIGRATION_HINT });
    return err(500, { error: msg });
  }
};
