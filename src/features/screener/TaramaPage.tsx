import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { RotateCcw, Link2, Check, SlidersHorizontal, X } from 'lucide-react';
import { useIsMobile } from '@/hooks/useIsMobile';
import { SeoHead } from '@/components/seo/SeoHead';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { SortableHeader } from '@/components/ui/SortableHeader';
import { EvidenceLink } from '@/components/ui/EvidenceLink';
import { KatilimBadge } from '@/components/domain/KatilimBadge';
import { useKatilim } from '@/hooks/useKatilim';
import { BIST_GROUPS, BIST_GROUP_BY_SLUG, type BistGroupKind, BIST_GROUP_KIND_LABELS } from '@/data/bistGroups';
import { SIGNAL_LABELS, type SignalKind } from '@/lib/signals';
import type { TrendRegime } from '@/lib/regime';
import {
  matchesFilter, describeFilter, filterToParams, filterFromParams, EMPTY_FILTER, SCREEN_PRESETS,
  type StockMetrics, type ScreenFilter, type TriState,
} from '@/lib/metrics';
import { cn } from '@/lib/utils';

/**
 * Tarama — deterministik hisse tarayıcı (Hafta 4a, 15 Eki 2026).
 * Veri: /api/screener/metrics (gece kapanışlarından hesaplanan özet).
 * Filtre durumu URL'de → paylaşılabilir, yeniden üretilebilir.
 * Al/sat dili yok; "koşulu sağlayanlar" listesidir.
 */

interface MetricsResponse { ok: boolean; computedAt: string; asOfDate: string | null; indexTrend: TrendRegime | null; count: number; items: StockMetrics[]; error?: string }

type SortKey = 'symbol' | 'close' | 'changePct' | 'rsi14' | 'sma50Pct' | 'sma200Pct' | 'from52wHighPct' | 'volRatio20' | 'ret1w' | 'ret1m' | 'ret3m' | 'vol20';

const TRENDS: TrendRegime[] = ['yükseliş', 'yatay', 'düşüş'];
const KINDS = Object.keys(SIGNAL_LABELS) as SignalKind[];

let memo: MetricsResponse | null = null;

function NumInput({ value, onChange, placeholder, w = 'w-14' }: { value?: number; onChange: (v?: number) => void; placeholder: string; w?: string }) {
  return (
    <input
      type="number" inputMode="decimal" placeholder={placeholder}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      className={cn(w, 'h-7 rounded border border-border bg-bg px-1.5 font-mono text-[12px] text-fg placeholder:text-fg-3 focus:border-accent focus:outline-none')}
    />
  );
}

function Tri({ value, onChange }: { value: TriState; onChange: (v: TriState) => void }) {
  return (
    <span className="inline-flex h-7 overflow-hidden rounded border border-border bg-bg-soft">
      {([['any', '—'], ['above', 'Üstünde'], ['below', 'Altında']] as const).map(([k, l]) => (
        <button key={k} type="button" onClick={() => onChange(k)} className={cn('px-2 text-[11px]', value === k ? 'bg-bg-card text-fg' : 'text-fg-2 hover:text-fg')}>{l}</button>
      ))}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-fg-3">{label}</span>
      <span className="flex items-center gap-1">{children}</span>
    </label>
  );
}

function Pct({ v, invertSign = false }: { v: number | null; invertSign?: boolean }) {
  if (v == null) return <span className="text-fg-3">—</span>;
  const tone = v > 0 ? (invertSign ? 'text-danger' : 'text-success') : v < 0 ? (invertSign ? 'text-success' : 'text-danger') : 'text-neutral';
  return <span className={cn('font-mono', tone)}>{v > 0 ? '+' : ''}{v.toFixed(1)}%</span>;
}

export function TaramaPage() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<MetricsResponse | null>(memo);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<ScreenFilter>(() => filterFromParams(params));
  const [groups, setGroups] = useState<string[]>(() => (params.get('grp') ?? '').split(',').filter(Boolean));
  const [sortKey, setSortKey] = useState<SortKey>('symbol');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [copied, setCopied] = useState(false);
  const { map: katilimMap } = useKatilim();
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (memo) return;
    let alive = true;
    fetch('/api/screener/metrics')
      .then(async (r) => {
        const j = (await r.json()) as MetricsResponse;
        if (!alive) return;
        if (!r.ok || !j.ok) { setErr(j.error ?? `HTTP ${r.status}`); return; }
        memo = j; setData(j);
      })
      .catch((e) => alive && setErr((e as Error).message));
    return () => { alive = false; };
  }, []);

  // Filtre → URL (geri/ileri ve paylaşım için)
  useEffect(() => {
    const p = filterToParams(filter);
    if (groups.length) p.set('grp', groups.join(','));
    setParams(p, { replace: true });
  }, [filter, groups, setParams]);

  const groupSet = useMemo(() => {
    if (groups.length === 0) return null;
    const s = new Set<string>();
    for (const slug of groups) {
      const members = slug === 'katilim' ? Object.keys(katilimMap) : (BIST_GROUP_BY_SLUG.get(slug)?.symbols ?? []);
      for (const m of members) s.add(m);
    }
    return s;
  }, [groups, katilimMap]);

  const rows = useMemo(() => {
    if (!data) return [];
    const out = data.items.filter((m) => (!groupSet || groupSet.has(m.symbol)) && matchesFilter(m, filter));
    const dir = sortDir === 'asc' ? 1 : -1;
    out.sort((a, b) => {
      if (sortKey === 'symbol') return a.symbol.localeCompare(b.symbol) * dir;
      const av = a[sortKey], bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * dir;
    });
    return out;
  }, [data, filter, groupSet, sortKey, sortDir]);

  const setSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir(k === 'symbol' ? 'asc' : 'desc'); }
  };
  const up = (patch: Partial<ScreenFilter>) => setFilter((f) => ({ ...f, ...patch }));
  const active = describeFilter(filter);
  const activePreset = SCREEN_PRESETS.find((p) => JSON.stringify(p.filter) === JSON.stringify(filter))?.id;

  const copyLink = () => {
    navigator.clipboard?.writeText(window.location.href).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => { /* */ });
  };

  const groupOptions = (kind: BistGroupKind) => BIST_GROUPS.filter((g) => g.kind === kind).map((g) => ({ value: g.slug, label: g.label, count: g.slug === 'katilim' ? Object.keys(katilimMap).length : g.symbols.length }));

  const filterPanel = (
      <div className={cn('grid grid-cols-2 gap-x-4 gap-y-3', isMobile ? 'pb-2' : 'mb-3 rounded-xl border border-border bg-bg-soft p-3 sm:grid-cols-3 lg:grid-cols-6')}>
        <Field label="RSI(14)">
          <NumInput value={filter.rsiMin} onChange={(v) => up({ rsiMin: v })} placeholder="min" />
          <span className="text-fg-3">–</span>
          <NumInput value={filter.rsiMax} onChange={(v) => up({ rsiMax: v })} placeholder="max" />
        </Field>
        <Field label="Fiyat / SMA50"><Tri value={filter.sma50} onChange={(v) => up({ sma50: v })} /></Field>
        <Field label="Fiyat / SMA200"><Tri value={filter.sma200} onChange={(v) => up({ sma200: v })} /></Field>
        <Field label="52h zirveye ≤ %">
          <NumInput value={filter.near52wHighMax} onChange={(v) => up({ near52wHighMax: v })} placeholder="ör. 5" />
          <label className="ml-2 inline-flex items-center gap-1 text-[11px] text-fg-2">
            <input type="checkbox" checked={!!filter.goldenCross} onChange={(e) => up({ goldenCross: e.target.checked || undefined })} className="h-3.5 w-3.5 accent-[rgb(var(--c-accent))]" />
            SMA50 &gt; 200
          </label>
        </Field>
        <Field label="Hacim ≥ × (20g ort.)"><NumInput value={filter.volRatioMin} onChange={(v) => up({ volRatioMin: v })} placeholder="ör. 2" /></Field>
        <Field label="20g oynaklık ≤ %"><NumInput value={filter.vol20Max} onChange={(v) => up({ vol20Max: v })} placeholder="ör. 35" /></Field>
        <Field label="1 hafta %">
          <NumInput value={filter.ret1wMin} onChange={(v) => up({ ret1wMin: v })} placeholder="min" /><span className="text-fg-3">–</span>
          <NumInput value={filter.ret1wMax} onChange={(v) => up({ ret1wMax: v })} placeholder="max" />
        </Field>
        <Field label="1 ay %">
          <NumInput value={filter.ret1mMin} onChange={(v) => up({ ret1mMin: v })} placeholder="min" /><span className="text-fg-3">–</span>
          <NumInput value={filter.ret1mMax} onChange={(v) => up({ ret1mMax: v })} placeholder="max" />
        </Field>
        <Field label="3 ay %">
          <NumInput value={filter.ret3mMin} onChange={(v) => up({ ret3mMin: v })} placeholder="min" /><span className="text-fg-3">–</span>
          <NumInput value={filter.ret3mMax} onChange={(v) => up({ ret3mMax: v })} placeholder="max" />
        </Field>
        <Field label="Trend (SMA50/200)">
          <MultiSelect label="Trend" options={TRENDS.map((t) => ({ value: t, label: t }))} selected={filter.trends} onChange={(v) => up({ trends: v as TrendRegime[] })} searchFrom={99} />
        </Field>
        <Field label="Sinyal">
          <MultiSelect label="Sinyal" options={KINDS.map((k) => ({ value: k, label: SIGNAL_LABELS[k] }))} selected={filter.signals} onChange={(v) => up({ signals: v as SignalKind[] })} searchFrom={99} />
        </Field>
        <Field label="Grup">
          <MultiSelect
            label="Endeks / sektör"
            options={(['index', 'main', 'sector'] as BistGroupKind[]).flatMap((k) => groupOptions(k).map((o) => ({ ...o, label: `${o.label} · ${BIST_GROUP_KIND_LABELS[k]}` })))}
            selected={groups} onChange={setGroups}
          />
        </Field>
      </div>
  );

  return (
    <>
      <SeoHead title="Tarama" description="BIST hisselerini RSI, hareketli ortalama, 52 haftalık zirve, hacim ve getiri eşiklerine göre tarayın. Kurallar görünür, sonuç paylaşılabilir." path="/tarama" />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h1 className="text-[22px] font-semibold leading-[30px] text-fg">Tarama</h1>
        {data && (
          <span className="text-[12px] text-fg-2">
            {data.count} hisse · kapanış <span className="font-mono text-fg">{data.asOfDate ?? '—'}</span>
            {data.indexTrend && <> · XU100 rejimi: <span className="text-fg">{data.indexTrend}</span></>}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          <button type="button" onClick={copyLink} className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-bg-soft px-2 text-[11px] text-fg-2 hover:text-fg" title="Bu taramanın bağlantısını kopyala">
            {copied ? <Check size={12} className="text-success" /> : <Link2 size={12} />} {copied ? 'Kopyalandı' : 'Bağlantı'}
          </button>
          <button type="button" onClick={() => { setFilter({ ...EMPTY_FILTER, trends: [], signals: [] }); setGroups([]); }} className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-bg-soft px-2 text-[11px] text-fg-2 hover:text-fg">
            <RotateCcw size={12} /> Sıfırla
          </button>
        </span>
      </div>

      {/* Şablonlar */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {SCREEN_PRESETS.map((p) => (
          <button
            key={p.id} type="button" title={p.desc}
            onClick={() => setFilter({ ...p.filter, trends: [...p.filter.trends], signals: [...p.filter.signals] })}
            className={cn('h-7 rounded-full border px-2.5 text-[11px]', activePreset === p.id ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border bg-bg-soft text-fg-2 hover:text-fg')}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Filtre paneli — masaüstü: satır içi; mobil (<768): "Filtreler" düğmesi + alt tabaka (D12, 15 Eki 2026) */}
      {!isMobile && filterPanel}
      {isMobile && (
        <div className="mb-3">
          <button type="button" onClick={() => setSheetOpen(true)} className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border bg-bg-soft text-[13px] text-fg">
            <SlidersHorizontal size={14} /> Filtreler{active.length + groups.length > 0 && <span className="rounded-full bg-accent/15 px-1.5 font-mono text-[11px] text-accent">{active.length + groups.length}</span>}
          </button>
          {sheetOpen && (
            <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={() => setSheetOpen(false)}>
              <div className="flex max-h-[85vh] w-full flex-col rounded-t-2xl border-t border-border bg-bg-soft pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 pb-2 pt-3">
                  <span className="text-sm font-semibold text-fg">Filtreler</span>
                  <button type="button" onClick={() => setSheetOpen(false)} aria-label="Kapat" className="rounded p-1 text-fg-2 hover:text-fg"><X size={16} /></button>
                </div>
                <div className="overflow-y-auto px-4">{filterPanel}</div>
                <div className="flex items-center gap-2 border-t border-border px-4 pt-2">
                  <span className="text-[12px] text-fg-2"><span className="font-mono text-fg">{rows.length}</span> hisse</span>
                  <button type="button" onClick={() => { setFilter({ ...EMPTY_FILTER, trends: [], signals: [] }); setGroups([]); }} className="ml-auto h-8 rounded-md border border-border px-3 text-[12px] text-fg-2">Temizle</button>
                  <button type="button" onClick={() => setSheetOpen(false)} className="h-8 rounded-md bg-accent px-3 text-[12px] font-semibold text-accent-fg">Göster</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Aktif koşullar — kanıt */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="font-mono text-fg">{rows.length}</span>
        <span className="text-fg-2">hisse koşulu sağlıyor</span>
        {active.length > 0 && <span className="text-fg-3">·</span>}
        {active.map((a) => <span key={a} className="rounded border border-border bg-bg-soft px-1.5 py-px text-fg-2">{a}</span>)}
        {groups.map((g) => <span key={g} className="rounded border border-accent/30 bg-accent/10 px-1.5 py-px text-accent">{g === 'katilim' ? 'Katılım' : BIST_GROUP_BY_SLUG.get(g)?.label ?? g}</span>)}
        {active.length === 0 && groups.length === 0 && <span className="text-fg-3">· koşul yok, tüm evren</span>}
      </div>

      {err && <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">Veri alınamadı: {err}</div>}
      {!data && !err && <div className="py-8 text-center text-xs text-fg-3">Göstergeler yükleniyor…</div>}
      {data && rows.length === 0 && <div className="py-8 text-center text-xs text-fg-3">Bu koşulları sağlayan hisse yok. Eşikleri gevşetin.</div>}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-bg-soft">
          <table className="w-full min-w-[900px] text-table">
            <thead className="border-b border-border text-[11px] uppercase tracking-wider text-fg-2">
              <tr>
                <SortableHeader label="Sembol" sortKey="symbol" activeKey={sortKey} dir={sortDir} onClick={setSort} align="left" className="h-8 px-3" />
                <SortableHeader label="Kapanış" sortKey="close" activeKey={sortKey} dir={sortDir} onClick={setSort} align="right" className="h-8 px-2" />
                <SortableHeader label="Gün %" sortKey="changePct" activeKey={sortKey} dir={sortDir} onClick={setSort} align="right" className="h-8 px-2" />
                <SortableHeader label="RSI" sortKey="rsi14" activeKey={sortKey} dir={sortDir} onClick={setSort} align="right" className="h-8 px-2" />
                <SortableHeader label="SMA50 %" sortKey="sma50Pct" activeKey={sortKey} dir={sortDir} onClick={setSort} align="right" className="h-8 px-2" />
                <SortableHeader label="SMA200 %" sortKey="sma200Pct" activeKey={sortKey} dir={sortDir} onClick={setSort} align="right" className="h-8 px-2" />
                <SortableHeader label="52h %" sortKey="from52wHighPct" activeKey={sortKey} dir={sortDir} onClick={setSort} align="right" className="h-8 px-2" />
                <SortableHeader label="Hacim ×" sortKey="volRatio20" activeKey={sortKey} dir={sortDir} onClick={setSort} align="right" className="h-8 px-2" />
                <SortableHeader label="1H" sortKey="ret1w" activeKey={sortKey} dir={sortDir} onClick={setSort} align="right" className="h-8 px-2" />
                <SortableHeader label="1A" sortKey="ret1m" activeKey={sortKey} dir={sortDir} onClick={setSort} align="right" className="h-8 px-2" />
                <SortableHeader label="3A" sortKey="ret3m" activeKey={sortKey} dir={sortDir} onClick={setSort} align="right" className="h-8 px-2" />
                <SortableHeader label="Oyn." sortKey="vol20" activeKey={sortKey} dir={sortDir} onClick={setSort} align="right" className="h-8 px-2" />
                <th className="h-8 px-3 text-left">Trend · sinyal</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.symbol} className="h-row border-b border-border/60 last:border-0 hover:bg-bg-card">
                  <td className="px-3">
                    <Link to={`/stock/${m.symbol}?tab=teknik`} className="font-mono font-bold text-fg hover:text-accent">{m.symbol}</Link>
                    <KatilimBadge indices={katilimMap[m.symbol]} />
                  </td>
                  <td className="px-2 text-right font-mono text-fg">{m.close.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="px-2 text-right"><Pct v={m.changePct} /></td>
                  <td className={cn('px-2 text-right font-mono', m.rsi14 == null ? 'text-fg-3' : m.rsi14 >= 70 ? 'text-warning' : m.rsi14 <= 30 ? 'text-accent' : 'text-fg')}>{m.rsi14?.toFixed(0) ?? '—'}</td>
                  <td className="px-2 text-right"><Pct v={m.sma50Pct} /></td>
                  <td className="px-2 text-right"><Pct v={m.sma200Pct} /></td>
                  <td className="px-2 text-right font-mono text-fg-2">{m.from52wHighPct == null ? '—' : `${m.from52wHighPct.toFixed(1)}%`}</td>
                  <td className={cn('px-2 text-right font-mono', m.volRatio20 != null && m.volRatio20 >= 2 ? 'text-warning' : 'text-fg-2')}>{m.volRatio20 == null ? '—' : `${m.volRatio20.toFixed(1)}×`}</td>
                  <td className="px-2 text-right"><Pct v={m.ret1w} /></td>
                  <td className="px-2 text-right"><Pct v={m.ret1m} /></td>
                  <td className="px-2 text-right"><Pct v={m.ret3m} /></td>
                  <td className="px-2 text-right font-mono text-fg-2">{m.vol20 == null ? '—' : `${m.vol20.toFixed(0)}%`}</td>
                  <td className="px-3 text-[11px]">
                    <span className={cn('mr-1.5', m.trend === 'yükseliş' ? 'text-success' : m.trend === 'düşüş' ? 'text-danger' : 'text-fg-2')}>{m.trend ?? '—'}</span>
                    {m.signals.slice(0, 3).map((k) => <span key={k} className="mr-1 rounded border border-border px-1 text-fg-2">{SIGNAL_LABELS[k]}</span>)}
                    {m.signals.length > 3 && <span className="text-fg-3">+{m.signals.length - 3}</span>}
                    <EvidenceLink
                      title={`${m.symbol} · ${m.asOfDate}`}
                      rows={[
                        { label: 'Bar sayısı', value: String(m.bars), source: 'bars_daily' },
                        { label: 'RSI(14)', value: m.rsi14?.toFixed(2) ?? '—' },
                        { label: 'Fiyat / SMA20 · 50 · 200', value: `${m.sma20Pct?.toFixed(1) ?? '—'} · ${m.sma50Pct?.toFixed(1) ?? '—'} · ${m.sma200Pct?.toFixed(1) ?? '—'} %` },
                        { label: '52h zirve / dip', value: `${m.from52wHighPct?.toFixed(1) ?? '—'} / +${m.from52wLowPct?.toFixed(1) ?? '—'} %` },
                        { label: 'Hacim / 20g ort.', value: m.volRatio20 == null ? '—' : `${m.volRatio20.toFixed(2)}×` },
                        { label: '6 ay / 1 yıl', value: `${m.ret6m?.toFixed(1) ?? '—'} / ${m.ret1y?.toFixed(1) ?? '—'} %` },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-[11px] text-fg-3">
        Tüm değerler gece kapanışlarından hesaplanır (gün içi fiyatı yansıtmaz); eşikler görünür ve sizin seçiminizdir. Listeye girmek bir öneri değil,
        tanımlı koşulun sağlandığının tespitidir. Yatırım tavsiyesi değildir.
      </p>
    </>
  );
}
