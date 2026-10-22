import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SeoHead } from '@/components/seo/SeoHead';
import { EvidenceLink } from '@/components/ui/EvidenceLink';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { KatilimBadge } from '@/components/domain/KatilimBadge';
import { useKatilim } from '@/hooks/useKatilim';
import { SIGNAL_LABELS, type Signal, type SignalKind, type SignalDirection } from '@/lib/signals';
import { cn } from '@/lib/utils';

interface ScanItem { symbol: string; asOfDate: string; close: number; changePct: number | null; signals: Signal[] }
interface ScanResponse {
  ok: boolean; scope: string; computedAt: string; indexTrend: string | null;
  universe: number; evaluated: number; withSignals: number; counts: Record<string, number>; items: ScanItem[];
}

const KINDS = Object.keys(SIGNAL_LABELS) as SignalKind[];

function DirBadge({ d }: { d: SignalDirection }) {
  const cls = d === 'yukarı' ? 'text-success border-success/40 bg-success/10' : d === 'aşağı' ? 'text-danger border-danger/40 bg-danger/10' : 'text-warning border-warning/40 bg-warning/10';
  return <span className={cn('rounded border px-1 text-[10px] font-semibold', cls)}>{d === 'yukarı' ? '▲' : d === 'aşağı' ? '▼' : '!'}</span>;
}

function Strength({ n }: { n: 1 | 2 | 3 }) {
  return (
    <span className="inline-flex gap-0.5" title={`Güç ${n}/3 — kuralın ne kadar net sağlandığı`}>
      {[1, 2, 3].map((i) => <span key={i} className={cn('h-1.5 w-1.5 rounded-sm', i <= n ? 'bg-accent' : 'bg-bg-card')} />)}
    </span>
  );
}

export function SignalsPage() {
  const [data, setData] = useState<ScanResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [scope, setScope] = useState<'bist100' | 'all'>('bist100');
  const [kinds, setKinds] = useState<string[]>([]);
  const [dir, setDir] = useState<'all' | SignalDirection>('all');
  const [onlyFit, setOnlyFit] = useState(false);
  const { map: katilimMap } = useKatilim();

  useEffect(() => {
    let alive = true;
    setData(null); setErr(null);
    fetch(`/api/signals/scan?scope=${scope}`)
      .then(async (r) => {
        const j = (await r.json()) as ScanResponse & { error?: string };
        if (!alive) return;
        if (!r.ok || !j.ok) { setErr(j.error ?? `HTTP ${r.status}`); return; }
        setData(j);
      })
      .catch((e) => alive && setErr((e as Error).message));
    return () => { alive = false; };
  }, [scope]);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.items
      .map((it) => ({
        ...it,
        signals: it.signals.filter((s) =>
          (kinds.length === 0 || kinds.includes(s.kind)) &&
          (dir === 'all' || s.direction === dir) &&
          (!onlyFit || s.regimeFit === 'uyumlu')),
      }))
      .filter((it) => it.signals.length > 0);
  }, [data, kinds, dir, onlyFit]);

  return (
    <>
      <SeoHead title="Sinyaller" description="BIST hisseleri için tanımlı teknik kurallardan geçen durumlar — kanıt satırlarıyla." path="/signals" />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h1 className="text-[22px] font-semibold leading-[30px] text-fg">Sinyaller</h1>
        <Link to="/signals/defter" className="text-[12px] text-fg-2 hover:text-accent">Kanıt Defteri →</Link>
        {data && (
          <span className="text-[12px] text-fg-2">
            {data.evaluated} hisse tarandı · <span className="font-mono text-fg">{data.withSignals}</span> hissede sinyal
            {data.indexTrend && <> · XU100 rejimi: <span className="text-fg">{data.indexTrend}</span></>}
            {' '}· {new Date(data.computedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
        <span className="ml-auto inline-flex h-7 overflow-hidden rounded-md border border-border bg-bg-soft">
          {(['bist100', 'all'] as const).map((s) => (
            <button key={s} type="button" onClick={() => setScope(s)} className={cn('px-2.5 text-xs', scope === s ? 'bg-bg-card text-fg' : 'text-fg-2 hover:text-fg')}>{s === 'bist100' ? 'BIST 100' : 'BIST Tüm'}</button>
          ))}
        </span>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <MultiSelect
          label="Sinyal türü"
          options={KINDS.map((k) => ({ value: k, label: SIGNAL_LABELS[k], count: data?.counts[k] ?? 0 }))}
          selected={kinds}
          onChange={setKinds}
          searchFrom={99}
        />
        <span className="inline-flex h-7 overflow-hidden rounded-md border border-border bg-bg-soft">
          {([['all', 'Tümü'], ['yukarı', '▲ Yukarı'], ['aşağı', '▼ Aşağı'], ['uyarı', '! Uyarı']] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setDir(k)} className={cn('px-2.5 text-xs', dir === k ? 'bg-bg-card text-fg' : 'text-fg-2 hover:text-fg')}>{l}</button>
          ))}
        </span>
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-fg-2">
          <input type="checkbox" checked={onlyFit} onChange={(e) => setOnlyFit(e.target.checked)} className="h-3.5 w-3.5 accent-[rgb(var(--c-accent))]" />
          Yalnız rejime uyumlu
        </label>
        <span className="ml-auto text-[11px] text-fg-3">{rows.length} hisse</span>
      </div>

      {err && <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">Tarama alınamadı: {err}</div>}
      {!data && !err && <div className="py-8 text-center text-xs text-fg-3">Tarama yükleniyor…</div>}

      {data && rows.length === 0 && (
        <div className="py-8 text-center text-xs text-fg-3">Bu filtrede sinyal yok.</div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-bg-soft">
          <table className="w-full min-w-[640px] text-table">
            <thead className="border-b border-border text-[11px] uppercase tracking-wider text-fg-2">
              <tr>
                <th className="h-8 px-3 text-left">Sembol</th>
                <th className="h-8 px-2 text-right">Fiyat</th>
                <th className="h-8 px-2 text-right">Gün %</th>
                <th className="h-8 px-3 text-left">Sinyaller</th>
                <th className="h-8 px-2 text-right">Tarih</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((it) => (
                <tr key={it.symbol} className="border-b border-border/60 align-top last:border-0 hover:bg-bg-card">
                  <td className="px-3 py-2">
                    <Link to={`/stock/${it.symbol}`} className="font-mono text-table font-bold text-fg hover:text-accent">{it.symbol}</Link>
                    <KatilimBadge indices={katilimMap[it.symbol]} />
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-fg">{it.close.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className={cn('px-2 py-2 text-right font-mono font-semibold', it.changePct == null ? 'text-fg-3' : it.changePct > 0 ? 'text-success' : it.changePct < 0 ? 'text-danger' : 'text-neutral')}>
                    {it.changePct == null ? '—' : `${it.changePct > 0 ? '+' : ''}${it.changePct.toFixed(2)}%`}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {it.signals.map((s, i) => (
                        <span key={i} className="inline-flex items-center gap-1.5 text-[12px] text-fg">
                          <DirBadge d={s.direction} />
                          <span>{s.title}</span>
                          <Strength n={s.strength} />
                          {s.regimeFit !== 'nötr' && (
                            <span className={cn('text-[10px]', s.regimeFit === 'uyumlu' ? 'text-fg-3' : 'text-warning')}>{s.regimeFit === 'uyumlu' ? 'rejime uyumlu' : 'rejime karşı'}</span>
                          )}
                          <EvidenceLink title={s.title} rows={s.evidence} />
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-[11px] text-fg-3">{it.asOfDate.slice(5)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-[11px] text-fg-3">
        Kurallar sabit ve görünürdür (eşikler kanıt satırında). Kapanış verisi üzerinden gece hesaplanır; gün içi fiyatı yansıtmaz.
        Geriye dönük performans iddiası yoktur — Kanıt Defteri (Hafta 5) ölçecek. Yatırım tavsiyesi değildir.
      </p>
    </>
  );
}
