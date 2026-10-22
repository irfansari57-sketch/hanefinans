import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SeoHead } from '@/components/seo/SeoHead';
import { EvidenceLink, type EvidenceRow } from '@/components/ui/EvidenceLink';
import { SIGNAL_LABELS, type SignalKind } from '@/lib/signals';
import { MIN_SAMPLE, type KindStats, type WindowStats } from '@/lib/ledgerStats';
import { cn } from '@/lib/utils';

/**
 * Kanıt Defteri — Sinyal Motoru Hafta 5 (22 Eki 2026).
 * Sinyallerin sonradan ne yaptığını ÖLÇER: kural başına n, pozitif oranı,
 * ortalama 5/20/60 işlem günü getirisi, endekse (XU100) göre fark.
 * SPK dili: performans ölçümü; al/sat yok; yatırım tavsiyesi değildir.
 */

interface LedgerRow {
  id: number; symbol: string; kind: string; direction: string; strength: number; regime_fit: string | null;
  signal_date: string; entry_close: number; index_entry_close: number | null;
  ret_5d: number | null; ret_20d: number | null; ret_60d: number | null;
  index_ret_5d: number | null; index_ret_20d: number | null; index_ret_60d: number | null;
}
interface LedgerResponse {
  ok: boolean; days: number; scope: string; kind: string | null; since: string; computedAt: string;
  total: number; filled60: number; minSample: number;
  stats: Array<KindStats & { label: string }>;
  recent: LedgerRow[];
  method: { window: string; basis: string; excess: string; hitRate: string; caveat: string };
  disclaimer: string;
}

type Days = 90 | 180 | 365;
const KINDS = Object.keys(SIGNAL_LABELS) as SignalKind[];

const pct = (v: number | null | undefined, digits = 2) =>
  v == null || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(digits)}%`;
const pp = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)} pp`;
const ratio = (v: number | null | undefined) => (v == null ? '—' : `%${Math.round(v * 100)}`);
const tone = (v: number | null | undefined) =>
  v == null ? 'text-fg-3' : v > 0 ? 'text-success' : v < 0 ? 'text-danger' : 'text-fg-2';

function methodRows(m: LedgerResponse['method'] | undefined): EvidenceRow[] {
  if (!m) return [];
  return [
    { label: 'Pencere', value: '5 / 20 / 60 işlem günü', source: m.window },
    { label: 'Getiri', value: 'kapanış → kapanış', source: m.basis },
    { label: 'Endeks farkı', value: 'ret − XU100 ret', source: m.excess },
    { label: 'Pozitif oranı', value: 'ret > 0 / dolu n', source: m.hitRate },
    { label: 'Örneklem eşiği', value: `n ≥ ${MIN_SAMPLE}`, source: m.caveat },
    { label: 'Düzeltme', value: 'bars_daily düzeltilmiş kapanış (bedelsiz/temettü düzeltmesi kaynak kadar)', source: 'maliyet/kayma yok' },
  ];
}

function WindowLine({ n, w }: { n: number; w: WindowStats }) {
  if (w.insufficient) {
    return (
      <div className="flex items-baseline justify-between gap-2 py-1 text-xs">
        <span className="text-fg-2">{n}g</span>
        <span className="text-fg-3">örneklem yetersiz <span className="font-mono">({w.filled}/{MIN_SAMPLE})</span></span>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[28px_1fr_1fr_1fr_1fr] items-baseline gap-2 py-1 text-xs">
      <span className="text-fg-2">{n}g</span>
      <span className="text-right font-mono text-fg" title="Pozitif oranı">{ratio(w.hitRate)}</span>
      <span className={cn('text-right font-mono', tone(w.mean))} title="Ortalama getiri">{pct(w.mean)}</span>
      <span className={cn('text-right font-mono', tone(w.median))} title="Medyan getiri">{pct(w.median)}</span>
      <span className={cn('text-right font-mono', tone(w.meanExcess))} title="Endekse göre ortalama fark">{pp(w.meanExcess)}</span>
    </div>
  );
}

function KindCard({ s, label, method }: { s: KindStats | null; label: string; method: LedgerResponse['method'] | undefined }) {
  const n = s?.n ?? 0;
  return (
    <div className="rounded-xl border border-border bg-bg-soft p-3">
      <div className="mb-1 flex items-baseline gap-2">
        <h2 className="text-[13px] font-semibold text-fg">{label}</h2>
        <EvidenceLink title={`${label} — hesap yöntemi`} rows={methodRows(method)} />
        <span className="ml-auto text-[11px] text-fg-3">n = <span className="font-mono text-fg">{n}</span></span>
      </div>
      {!s || s.insufficient ? (
        <p className="py-2 text-xs text-fg-3">
          {n === 0 ? 'Bu dönemde kayıt yok.' : <>Örneklem yetersiz (<span className="font-mono">{n}</span> &lt; {MIN_SAMPLE}) — istatistik gösterilmez.</>}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-[28px_1fr_1fr_1fr_1fr] gap-2 border-b border-border pb-1 text-[10px] uppercase tracking-wider text-fg-3">
            <span />
            <span className="text-right">Pozitif</span>
            <span className="text-right">Ort.</span>
            <span className="text-right">Medyan</span>
            <span className="text-right">vs XU100</span>
          </div>
          <div className="divide-y divide-border/60">
            <WindowLine n={5} w={s.w5} />
            <WindowLine n={20} w={s.w20} />
            <WindowLine n={60} w={s.w60} />
          </div>
        </>
      )}
    </div>
  );
}

export function LedgerPage() {
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [scope, setScope] = useState<'bist100' | 'all'>('bist100');
  const [days, setDays] = useState<Days>(90);
  const [kind, setKind] = useState<'' | SignalKind>('');

  useEffect(() => {
    let alive = true;
    setData(null); setErr(null);
    const q = new URLSearchParams({ scope, days: String(days) });
    if (kind) q.set('kind', kind);
    fetch(`/api/signals/ledger?${q.toString()}`)
      .then(async (r) => {
        const j = (await r.json()) as LedgerResponse & { error?: string; hint?: string };
        if (!alive) return;
        if (!r.ok || !j.ok) { setErr(j.hint ?? j.error ?? `HTTP ${r.status}`); return; }
        setData(j);
      })
      .catch((e) => alive && setErr((e as Error).message));
    return () => { alive = false; };
  }, [scope, days, kind]);

  const statsByKind = useMemo(() => {
    const m = new Map<string, KindStats & { label: string }>();
    for (const s of data?.stats ?? []) m.set(s.kind, s);
    return m;
  }, [data]);
  const visibleKinds = kind ? [kind] : KINDS;

  return (
    <>
      <SeoHead title="Kanıt Defteri" description="Sinyal kurallarının sonradan ne yaptığının ölçümü: 5/20/60 işlem günü getiri, pozitif oranı, XU100'e göre fark." path="/signals/defter" />
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h1 className="text-[22px] font-semibold leading-[30px] text-fg">Kanıt Defteri</h1>
        <Link to="/signals" className="text-[12px] text-fg-2 hover:text-accent">← Sinyaller</Link>
        {data && (
          <span className="text-[12px] text-fg-2">
            <span className="font-mono text-fg">{data.total}</span> kayıt · <span className="font-mono text-fg">{data.filled60}</span> tanesi 60g dolu
            {' '}· {data.since} sonrası
          </span>
        )}
        <span className="ml-auto inline-flex h-7 overflow-hidden rounded-md border border-border bg-bg-soft">
          {([90, 180, 365] as Days[]).map((d) => (
            <button key={d} type="button" onClick={() => setDays(d)} className={cn('px-2.5 text-xs', days === d ? 'bg-bg-card text-fg' : 'text-fg-2 hover:text-fg')}>{d} gün</button>
          ))}
        </span>
        <span className="inline-flex h-7 overflow-hidden rounded-md border border-border bg-bg-soft">
          {(['bist100', 'all'] as const).map((s) => (
            <button key={s} type="button" onClick={() => setScope(s)} className={cn('px-2.5 text-xs', scope === s ? 'bg-bg-card text-fg' : 'text-fg-2 hover:text-fg')}>{s === 'bist100' ? 'BIST 100' : 'BIST Tüm'}</button>
          ))}
        </span>
      </div>

      <div className="mb-3 rounded-md border border-border bg-bg-soft px-3 py-2 text-[11px] leading-relaxed text-fg-2">
        <span className="font-semibold text-fg">Metodoloji.</span> Bu bir performans ölçümüdür; geçmiş sonuç gelecek getiri garantisi değildir;
        işlem maliyeti ve kayma dahil değildir. Getiri, sinyal günü kapanışından N işlem günü sonraki kapanışa (kapanıştan kapanışa, kaynak verideki düzeltmeyle) hesaplanır;
        endeks farkı aynı pencerede XU100 getirisinin çıkarılmasıdır. Doldurulmuş örneklem {MIN_SAMPLE}'nin altındaysa istatistik gösterilmez.
        Yatırım tavsiyesi değildir.
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as '' | SignalKind)}
          className="h-7 rounded-md border border-border bg-bg-soft px-2 text-xs text-fg"
          aria-label="Kural"
        >
          <option value="">Tüm kurallar</option>
          {KINDS.map((k) => <option key={k} value={k}>{SIGNAL_LABELS[k]}</option>)}
        </select>
        {data && <span className="ml-auto text-[11px] text-fg-3">hesaplandı {new Date(data.computedAt).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>}
      </div>

      {err && <div className="mb-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">Defter alınamadı: {err}</div>}
      {!data && !err && <div className="py-8 text-center text-xs text-fg-3">Defter yükleniyor…</div>}

      {data && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibleKinds.map((k) => (
              <KindCard key={k} s={statsByKind.get(k) ?? null} label={SIGNAL_LABELS[k]} method={data.method} />
            ))}
          </div>

          <h2 className="mb-2 text-[13px] font-semibold text-fg">Son kayıtlar <span className="font-normal text-fg-3">({data.recent.length})</span></h2>
          {data.recent.length === 0 ? (
            <div className="py-6 text-center text-xs text-fg-3">Bu filtrede kayıt yok. Defter her iş günü gece dolar; ilk 60g getirileri ~3 ay sonra görünür.</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-bg-soft">
              <table className="w-full min-w-[720px] text-table">
                <thead className="border-b border-border text-[11px] uppercase tracking-wider text-fg-2">
                  <tr>
                    <th className="h-8 px-3 text-left">Sembol</th>
                    <th className="h-8 px-2 text-left">Kural</th>
                    <th className="h-8 px-2 text-right">Tarih</th>
                    <th className="h-8 px-2 text-right">Giriş kapanışı</th>
                    <th className="h-8 px-2 text-right">5g</th>
                    <th className="h-8 px-2 text-right">20g</th>
                    <th className="h-8 px-2 text-right">60g</th>
                    <th className="h-8 px-2 text-right" title="60g (yoksa 20g, yoksa 5g) penceresinde hisse − XU100">vs XU100</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((r) => {
                    const ex =
                      r.ret_60d != null && r.index_ret_60d != null ? r.ret_60d - r.index_ret_60d
                      : r.ret_20d != null && r.index_ret_20d != null ? r.ret_20d - r.index_ret_20d
                      : r.ret_5d != null && r.index_ret_5d != null ? r.ret_5d - r.index_ret_5d
                      : null;
                    const exWin = r.ret_60d != null && r.index_ret_60d != null ? '60g' : r.ret_20d != null && r.index_ret_20d != null ? '20g' : r.ret_5d != null && r.index_ret_5d != null ? '5g' : '';
                    return (
                      <tr key={r.id} className="h-row border-b border-border/60 last:border-0 hover:bg-bg-card">
                        <td className="px-3">
                          <Link to={`/stock/${r.symbol}`} className="font-mono text-table font-bold text-fg hover:text-accent">{r.symbol}</Link>
                        </td>
                        <td className="px-2 text-[12px] text-fg">
                          {SIGNAL_LABELS[r.kind as SignalKind] ?? r.kind}
                          <span className={cn('ml-1 text-[10px]', r.direction === 'yukarı' ? 'text-success' : r.direction === 'aşağı' ? 'text-danger' : 'text-warning')}>
                            {r.direction === 'yukarı' ? '▲' : r.direction === 'aşağı' ? '▼' : '!'}
                          </span>
                        </td>
                        <td className="px-2 text-right font-mono text-[11px] text-fg-3">{r.signal_date}</td>
                        <td className="px-2 text-right font-mono text-fg">{r.entry_close.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className={cn('px-2 text-right font-mono', tone(r.ret_5d))}>{pct(r.ret_5d)}</td>
                        <td className={cn('px-2 text-right font-mono', tone(r.ret_20d))}>{pct(r.ret_20d)}</td>
                        <td className={cn('px-2 text-right font-mono', tone(r.ret_60d))}>{pct(r.ret_60d)}</td>
                        <td className={cn('px-2 text-right font-mono', tone(ex))}>
                          {pp(ex)}{exWin && <span className="ml-1 text-[10px] text-fg-3">{exWin}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <p className="mt-3 text-[11px] text-fg-3">
        Defter her iş günü kapanış barları yazıldıktan sonra dolar; "—" henüz o kadar işlem günü geçmediğini gösterir.
        Bu bir performans ölçümüdür; geçmiş sonuç gelecek getiri garantisi değildir; işlem maliyeti ve kayma dahil değildir. Yatırım tavsiyesi değildir.
      </p>
    </>
  );
}
