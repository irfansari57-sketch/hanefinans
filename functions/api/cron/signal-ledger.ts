/**
 * POST /api/cron/signal-ledger?scope=bist100|all
 *
 * Kanıt Defteri (Sinyal Motoru Hafta 5, 22 Eki 2026). İki iş tek çağrıda:
 *   (a) KAYIT: evrenin son barlarıyla evaluateSignals çalıştırır, çıkan her sinyali
 *       signal_ledger'a INSERT OR IGNORE yazar (entry_close = sinyal günü kapanışı,
 *       index_entry_close = aynı gün XU100 kapanışı).
 *   (b) DOLDURMA: ret_60d boş kayıtlar için sinyal tarihinden 5/20/60 işlem günü
 *       sonraki kapanışı bars_daily'den bulur; getiri + aynı pencerede XU100 getirisi.
 *
 * Süre bütçesi: sembol başına TEK SELECT (son 400 bar, 20'şerli D1 batch); yazma
 * ≤50 ifade/batch. Hesap: src/lib/ledgerStats.ts (saf, test edilmiş).
 *
 * Auth: X-Cron-Secret header = CRON_SECRET env (bist-warm ile aynı kalıp).
 * Tetikleyici: .github/workflows/signal-ledger.yml (bars-warm'dan 30 dk sonra).
 * Tablo yoksa 503 + hint (functions/migrations/022_signal_ledger.sql).
 *
 * Bu bir performans ölçümüdür; yatırım tavsiyesi değildir.
 */

import { evaluateSignals, type Bar } from '../../../src/lib/signals';
import { computeTrend } from '../../../src/lib/regime';
import { computeForward, indexOfDate, type CloseBar } from '../../../src/lib/ledgerStats';
import { BIST_100_UNIVERSE } from '../_universe';

interface Env {
  DB: D1Database;
  CRON_SECRET?: string;
}

interface BarRow { symbol: string; date: string; open: number; high: number; low: number; close: number; volume: number }
interface PendingRow {
  id: number; symbol: string; signal_date: string; entry_close: number; index_entry_close: number | null;
  ret_5d: number | null; ret_20d: number | null; ret_60d: number | null;
}

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const MIGRATION_HINT = 'signal_ledger tablosu yok → npx wrangler d1 execute hanefinans-db --remote --file=functions/migrations/022_signal_ledger.sql';
const BARS_PER_SYMBOL = 400;
const READ_CH = 20;
const WRITE_CH = 50;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // Auth — bist-warm.ts kalıbı
  const secret = request.headers.get('x-cron-secret');
  if (!env.CRON_SECRET || secret !== env.CRON_SECRET) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!env.DB) return json({ ok: false, error: 'D1 not bound' }, 503);

  const started = Date.now();
  const url = new URL(request.url);
  const scope = url.searchParams.get('scope') === 'all' ? 'all' : 'bist100';
  const now = Date.now();

  try {
    // Evren
    let universe: string[] = Array.from(new Set(BIST_100_UNIVERSE));
    if (scope === 'all') {
      const r = await env.DB.prepare("SELECT symbol FROM bars_meta WHERE bar_count >= 60 AND symbol NOT LIKE 'XU%'").all<{ symbol: string }>();
      const all = (r.results ?? []).map((x) => x.symbol);
      if (all.length > 0) universe = Array.from(new Set([...universe, ...all]));
    }

    // Bekleyen kayıtlar (ret_60d boş) — sembolleri evrene ekle ki barları tek seferde okunsun
    const pendingRes = await env.DB.prepare(
      'SELECT id, symbol, signal_date, entry_close, index_entry_close, ret_5d, ret_20d, ret_60d FROM signal_ledger WHERE ret_60d IS NULL',
    ).all<PendingRow>();
    const pending = pendingRes.results ?? [];
    const pendingBySym = new Map<string, PendingRow[]>();
    for (const p of pending) {
      const g = pendingBySym.get(p.symbol);
      if (g) g.push(p); else pendingBySym.set(p.symbol, [p]);
    }
    const symbols = Array.from(new Set([...universe, ...pendingBySym.keys()]));

    // XU100: rejim bağlamı + endeks giriş/ileri kapanışları
    const idxRes = await env.DB.prepare('SELECT date, close FROM bars_daily WHERE symbol = ? ORDER BY date DESC LIMIT ?')
      .bind('XU100', BARS_PER_SYMBOL).all<{ date: string; close: number }>();
    const idxBars: CloseBar[] = (idxRes.results ?? []).reverse();
    const idxCloses = idxBars.map((b) => b.close);
    const indexTrend = idxCloses.length >= 60 ? computeTrend(idxCloses).regime : null;
    const idxEntryClose = (date: string): number | null => {
      const i = indexOfDate(idxBars, date);
      return i >= 0 && idxBars[i].date === date ? idxBars[i].close : null;
    };

    // Barlar: sembol başına tek SELECT (son 400), 20'şerli batch
    const bySym = new Map<string, Bar[]>();
    for (let i = 0; i < symbols.length; i += READ_CH) {
      const slice = symbols.slice(i, i + READ_CH);
      const stmts = slice.map((sym) =>
        env.DB.prepare('SELECT symbol, date, open, high, low, close, volume FROM bars_daily WHERE symbol = ? ORDER BY date DESC LIMIT ?')
          .bind(sym, BARS_PER_SYMBOL),
      );
      const results = await env.DB.batch<BarRow>(stmts);
      for (const res of results) {
        const rows = (res.results ?? []).reverse();
        if (rows.length === 0) continue;
        bySym.set(rows[0].symbol, rows.map((r) => ({ date: r.date, open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume ?? 0 })));
      }
    }

    // (a) KAYIT
    const inserts: D1PreparedStatement[] = [];
    let evaluated = 0;
    for (const sym of universe) {
      const bars = bySym.get(sym);
      if (!bars || bars.length < 60) continue;
      evaluated++;
      const sigs = evaluateSignals(bars, indexTrend, 'bars_daily');
      if (sigs.length === 0) continue;
      const last = bars[bars.length - 1];
      const ixc = idxEntryClose(last.date);
      for (const s of sigs) {
        inserts.push(
          env.DB.prepare(
            `INSERT OR IGNORE INTO signal_ledger
               (symbol, kind, direction, strength, regime_fit, signal_date, entry_close, index_entry_close, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).bind(sym, s.kind, s.direction, s.strength, s.regimeFit, s.asOfDate, last.close, ixc, now),
        );
      }
    }

    // (b) DOLDURMA — yalnızca yeni değer çıkan kayıtlar için UPDATE
    const updates: D1PreparedStatement[] = [];
    for (const [sym, rows] of pendingBySym) {
      const bars = bySym.get(sym);
      if (!bars || bars.length === 0) continue;
      for (const p of rows) {
        const ixc = p.index_entry_close ?? idxEntryClose(p.signal_date);
        const f = computeForward(bars, p.signal_date, p.entry_close, idxBars, ixc);
        const gained =
          (p.ret_5d == null && f.ret_5d != null) ||
          (p.ret_20d == null && f.ret_20d != null) ||
          (p.ret_60d == null && f.ret_60d != null);
        if (!gained) continue;
        updates.push(
          env.DB.prepare(
            `UPDATE signal_ledger SET
               index_entry_close = COALESCE(index_entry_close, ?),
               close_5d = ?, close_20d = ?, close_60d = ?,
               ret_5d = ?, ret_20d = ?, ret_60d = ?,
               index_ret_5d = ?, index_ret_20d = ?, index_ret_60d = ?,
               filled_at = ?
             WHERE id = ?`,
          ).bind(
            ixc,
            f.close_5d, f.close_20d, f.close_60d,
            f.ret_5d, f.ret_20d, f.ret_60d,
            f.index_ret_5d, f.index_ret_20d, f.index_ret_60d,
            now, p.id,
          ),
        );
      }
    }

    // Yazma: ≤50 ifade/batch; INSERT OR IGNORE'da changes=0 → tekrar sayılmaz
    let inserted = 0;
    for (let i = 0; i < inserts.length; i += WRITE_CH) {
      const res = await env.DB.batch(inserts.slice(i, i + WRITE_CH));
      for (const r of res) inserted += r.meta?.changes ?? 0;
    }
    let filled = 0;
    for (let i = 0; i < updates.length; i += WRITE_CH) {
      const res = await env.DB.batch(updates.slice(i, i + WRITE_CH));
      for (const r of res) filled += r.meta?.changes ?? 0;
    }

    return json({
      ok: true,
      scope,
      universe: universe.length,
      evaluated,
      signalsSeen: inserts.length,
      inserted,
      pending: pending.length,
      filled,
      indexTrend,
      elapsedMs: Date.now() - started,
    });
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    const missing = /no such table/i.test(msg);
    return json({
      ok: false,
      error: msg,
      hint: missing ? MIGRATION_HINT : undefined,
      elapsedMs: Date.now() - started,
    }, missing ? 503 : 500);
  }
};
