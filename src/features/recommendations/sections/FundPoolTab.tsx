import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layers, Sparkles, ExternalLink } from 'lucide-react';
import type { FundPerformance } from '@/data/types';
import { cn } from '@/lib/utils';
import { SortableHeader } from '@/components/ui/SortableHeader';

/**
 * Fon Havuzu — kullanıcının seçtiği fon kategorilerinden en iyi N fon.
 *
 * Varsayılan: Katılım kategorisinde 1 Yıl getiriye göre top 10.
 * Kullanıcı çoklu kategori seçebilir, top N (5/10/20/30) ayarlayabilir,
 * sıralama metriğini değiştirebilir (Gün / 1H / 1A / 3A / 6A / YTD / 1Y).
 *
 * Premium-fokus yapı taşı: ileride "havuzunu kaydet", "yeni fon eklenince
 * bildirim" gibi özelliklere açık.
 */

// Uzun kategori isimlerini ekranda kısaltarak göster
const SHORT_LABEL: Partial<Record<string, string>> = {
  'Hisse Senedi': 'Hisse',
  'Borçlanma Araçları': 'Borçlanma',
  'Kıymetli Madenler': 'Kıymetli M.',
  'Para Piyasası': 'Para Piy.',
};

type PoolSortKey = 'day' | 'week' | 'month' | 'threeMonth' | 'sixMonth' | 'ytd' | 'year';

const SORT_LABELS: Record<PoolSortKey, string> = {
  day: 'Gün %',
  week: '1 Hafta %',
  month: '1 Ay %',
  threeMonth: '3 Ay %',
  sixMonth: '6 Ay %',
  ytd: 'YTD %',
  year: '1 Yıl %',
};

interface FundPoolTabProps {
  allFunds: FundPerformance[];
}

export function FundPoolTab({ allFunds }: FundPoolTabProps) {
  // Varsayılan: sadece Katılım seçili
  const [selected, setSelected] = useState<Set<string>>(new Set(['Katılım']));
  const [topN, setTopN] = useState<5 | 10 | 20 | 30>(10);
  const [sortKey, setSortKey] = useState<PoolSortKey>('year');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const toggleCat = (c: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      // En az 1 kategori zorunlu
      if (next.size === 0) next.add(c);
      return next;
    });
  };

  const setSort = (k: PoolSortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('desc'); }
  };

  // Veri setinde gerçekten bulunan kategoriler (sıralı + birinci başında Katılım)
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    for (const f of allFunds) {
      if (f.category) set.add(f.category as string);
    }
    return Array.from(set).sort((a, b) => {
      if (a === 'Katılım') return -1;
      if (b === 'Katılım') return 1;
      return a.localeCompare(b, 'tr');
    });
  }, [allFunds]);

  const pool = useMemo(() => {
    const filtered = allFunds.filter((f) => selected.has(f.category as string));
    const sorted = [...filtered].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      const an = Number.isFinite(va) ? (va as number) : -Infinity;
      const bn = Number.isFinite(vb) ? (vb as number) : -Infinity;
      return sortDir === 'asc' ? an - bn : bn - an;
    });
    return sorted.slice(0, topN);
  }, [allFunds, selected, sortKey, sortDir, topN]);

  if (allFunds.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-bg-soft p-6 text-center">
        <Sparkles size={28} className="mx-auto text-slate-600" />
        <p className="mt-2 text-sm text-slate-300">Fon verisi yükleniyor…</p>
        <p className="mt-1 text-[11px] text-slate-500">
          TEFAS feed bağlandıktan sonra havuz dolacak.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Üst kontrol bandı: kategori seçimi + top N + açıklama */}
      <div className="rounded-xl border border-border bg-bg-soft p-3">
        <div className="flex items-start gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent">
            <Layers size={16} />
          </span>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-slate-100">Fon Havuzu</h3>
            <p className="text-[11px] text-slate-400">
              Seçtiğin fon kategorilerinden en iyi {topN} fonu listeler.
              Varsayılan: <span className="text-accent">Katılım</span> · <span className="text-accent">1 Yıl getirisi</span>.
              Birden fazla kategori seçerek karma havuz oluşturabilirsin.
            </p>
          </div>
        </div>

        {/* Kategori chip'leri */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {availableCategories.map((c) => {
            const isOn = selected.has(c);
            const label = SHORT_LABEL[c] ?? c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggleCat(c)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[10px] font-medium transition',
                  isOn
                    ? 'border-accent/50 bg-accent/15 text-accent'
                    : 'border-border bg-bg-card text-slate-400 hover:border-accent/30 hover:text-slate-200',
                )}
                aria-pressed={isOn}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Top N + sort metriği seçici */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Havuz boyutu</span>
          <div className="inline-flex rounded-lg border border-border bg-bg-card p-0.5">
            {([5, 10, 20, 30] as const).map((n) => (
              <button
                key={n}
                onClick={() => setTopN(n)}
                className={cn(
                  'rounded-md px-2 py-0.5 text-[10px] font-medium transition',
                  topN === n ? 'bg-accent/20 text-accent' : 'text-slate-400 hover:text-slate-200',
                )}
              >
                Top {n}
              </button>
            ))}
          </div>

          <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Sırala</span>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as PoolSortKey)}
            className="rounded-md border border-border bg-bg-card px-2 py-1 text-[10px] text-slate-200 focus:border-accent focus:outline-none"
          >
            {(Object.keys(SORT_LABELS) as PoolSortKey[]).map((k) => (
              <option key={k} value={k}>{SORT_LABELS[k]}</option>
            ))}
          </select>

          <span className="ml-auto rounded-md border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
            {pool.length} fon
          </span>
        </div>
      </div>

      {/* Sonuç tablosu — Fonlar düzeniyle uyumlu */}
      {pool.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg-soft p-6 text-center">
          <Sparkles size={28} className="mx-auto text-slate-600" />
          <p className="mt-2 text-sm text-slate-300">Seçtiğin kriterlerde fon bulunamadı.</p>
          <p className="mt-1 text-[11px] text-slate-500">
            Daha fazla kategori seç veya sıralama metriğini değiştir.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-bg-soft">
          <table className="w-full min-w-[860px] text-xs">
            <thead className="border-b border-border bg-bg-soft text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="sticky left-0 z-20 bg-bg-soft px-2 py-2.5 text-left">#</th>
                <th className="sticky left-8 z-20 bg-bg-soft px-2 py-2.5 text-left">Kod</th>
                <th className="px-2 py-2.5 text-left hidden md:table-cell">Ad / Kategori</th>
                <SortableHeader label="Gün %" sortKey="day" activeKey={sortKey} dir={sortDir} onClick={setSort} />
                <SortableHeader label="1 Hafta %" sortKey="week" activeKey={sortKey} dir={sortDir} onClick={setSort} className="hidden lg:table-cell" />
                <SortableHeader label="1 Ay %" sortKey="month" activeKey={sortKey} dir={sortDir} onClick={setSort} />
                <SortableHeader label="3 Ay %" sortKey="threeMonth" activeKey={sortKey} dir={sortDir} onClick={setSort} />
                <SortableHeader label="6 Ay %" sortKey="sixMonth" activeKey={sortKey} dir={sortDir} onClick={setSort} className="hidden lg:table-cell" />
                <SortableHeader label="YTD %" sortKey="ytd" activeKey={sortKey} dir={sortDir} onClick={setSort} className="hidden xl:table-cell" />
                <SortableHeader label="1 Yıl %" sortKey="year" activeKey={sortKey} dir={sortDir} onClick={setSort} />
                <th className="px-2 py-2.5 text-center w-24">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {pool.map((fund, i) => (
                <PoolFundRow key={fund.code} fund={fund} rank={i + 1} sortKey={sortKey} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-slate-500">
        Bu havuz seçili kategorilerdeki canlı TEFAS verisine göre dinamik olarak
        yeniden hesaplanır. Yatırım tavsiyesi değildir.
      </p>
    </div>
  );
}

interface PoolFundRowProps {
  fund: FundPerformance;
  rank: number;
  sortKey: PoolSortKey;
}

function PoolFundRow({ fund, rank, sortKey }: PoolFundRowProps) {
  const sign = (v: number) => (v >= 0 ? '+' : '');
  const tone = (v: number | undefined) =>
    v == null || !Number.isFinite(v) ? 'text-slate-500' : v >= 0 ? 'text-success' : 'text-danger';
  const fmt = (v: number | undefined) =>
    v == null || !Number.isFinite(v) ? '—' : `${sign(v)}${v.toFixed(2)}%`;

  // Sıralama metriğinde olan kolonu hafifçe vurgula
  const hl = (k: PoolSortKey) => (sortKey === k ? 'bg-accent/5' : '');

  return (
    <tr className="group border-b border-border/60 transition hover:bg-bg-card">
      <td className="sticky left-0 z-10 bg-bg-soft px-2 py-2 text-left text-[11px] text-slate-500 tabular-nums">{rank}</td>
      <td className="sticky left-8 z-10 bg-bg-soft px-2 py-2 text-left">
        <Link
          to={`/fund/${fund.code}`}
          className="font-mono text-[13px] font-semibold text-accent hover:underline"
        >
          {fund.code}
        </Link>
      </td>
      <td className="px-2 py-2 text-left hidden md:table-cell">
        {fund.name && <div className="truncate max-w-[260px] text-slate-200">{fund.name}</div>}
        <span className="mt-0.5 inline-block rounded bg-accent/10 px-1.5 py-0.5 text-[9px] font-medium text-accent">
          {fund.category}
        </span>
      </td>
      <td className={cn('px-2 py-2 text-right tabular-nums', tone(fund.day), hl('day'))}>{fmt(fund.day)}</td>
      <td className={cn('px-2 py-2 text-right tabular-nums hidden lg:table-cell', tone(fund.week), hl('week'))}>{fmt(fund.week)}</td>
      <td className={cn('px-2 py-2 text-right tabular-nums', tone(fund.month), hl('month'))}>{fmt(fund.month)}</td>
      <td className={cn('px-2 py-2 text-right tabular-nums', tone(fund.threeMonth), hl('threeMonth'))}>{fmt(fund.threeMonth)}</td>
      <td className={cn('px-2 py-2 text-right tabular-nums hidden lg:table-cell', tone(fund.sixMonth), hl('sixMonth'))}>{fmt(fund.sixMonth)}</td>
      <td className={cn('px-2 py-2 text-right tabular-nums hidden xl:table-cell', tone(fund.ytd), hl('ytd'))}>{fmt(fund.ytd)}</td>
      <td className={cn('px-2 py-2 text-right tabular-nums font-semibold', tone(fund.year), hl('year'))}>{fmt(fund.year)}</td>
      <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
        <a
          href={`https://www.tefas.gov.tr/FonAnaliz.aspx?FonKod=${encodeURIComponent(fund.code)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 rounded-md border border-success/30 bg-success/10 px-1.5 py-0.5 text-[9px] font-medium text-success hover:bg-success/20"
          title="TEFAS'ta aç"
        >
          TEFAS <ExternalLink size={8} />
        </a>
      </td>
    </tr>
  );
}
