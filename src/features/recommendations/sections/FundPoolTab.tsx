import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layers, Sparkles, ExternalLink, Lock, Crown } from 'lucide-react';
import type { FundPerformance } from '@/data/types';
import { cn } from '@/lib/utils';
import { SortableHeader } from '@/components/ui/SortableHeader';
import { useAuth, isPro } from '@/store/auth';
import { PremiumCard } from '@/components/ui/PremiumCard';

/**
 * Fon Havuzu — kullanıcının seçtiği fon kategorisinin en iyi N fonu.
 *
 * Kategori SINGLE-SELECT (her seferinde tek kategori). Başka kategoriye tıklarsan
 * yenisi seçilir, eskisi otomatik kalkar.
 *
 * Üstte özet kartlar: havuzun günlük/haftalık/aylık ortalama performansı —
 * Watchlist'teki "Ortalama Değişim" kutuları ile aynı pattern.
 *
 * Premium-fokus yapı taşı: ileride "havuzumu kaydet", "yeni fon eklenince
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
  // Tier paywall — anon: 5, free: 10, pro/elite: hepsi
  const user = useAuth((s) => s.user);
  const proUser = isPro(user);
  const isAnon = !user;
  // Paywall kapalı: anon (misafir) 10 fon görsün, giriş yapan tümünü görsün
  const tierLimit = proUser ? Infinity : 10;

  // SINGLE-SELECT — varsayılan Katılım
  const [selectedCategory, setSelectedCategory] = useState<string>('Katılım');
  const [topN, setTopN] = useState<5 | 10 | 20 | 30>(10);
  const [sortKey, setSortKey] = useState<PoolSortKey>('year');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const setSort = (k: PoolSortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('desc'); }
  };

  // Veri setinde gerçekten bulunan kategoriler — SADECE TEFAS açık fonlardan
  // (Katılım en başta sabit). Kapalı-only kategoriler chip listesine eklenmez.
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    for (const f of allFunds) {
      if (f.tefasOpen !== true) continue;
      if (f.category) set.add(f.category as string);
    }
    return Array.from(set).sort((a, b) => {
      if (a === 'Katılım') return -1;
      if (b === 'Katılım') return 1;
      return a.localeCompare(b, 'tr');
    });
  }, [allFunds]);

  // Seçili kategoriden top N — SADECE TEFAS'ta İŞLEME AÇIK fonlar
  // (Serbest/BES/Girişim Sermayesi/Gayrimenkul fonları kullanıcı doğrudan alamaz)
  const pool = useMemo(() => {
    const filtered = allFunds.filter(
      (f) => f.category === selectedCategory && f.tefasOpen === true,
    );
    const sorted = [...filtered].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      const an = Number.isFinite(va) ? (va as number) : -Infinity;
      const bn = Number.isFinite(vb) ? (vb as number) : -Infinity;
      return sortDir === 'asc' ? an - bn : bn - an;
    });
    return sorted.slice(0, topN);
  }, [allFunds, selectedCategory, sortKey, sortDir, topN]);

  // Havuzun ortalama performansı — Watchlist'teki summary pattern'i
  const summary = useMemo(() => {
    if (pool.length === 0) return null;
    const calc = (field: PoolSortKey) => {
      let sum = 0, count = 0, positives = 0, negatives = 0;
      for (const f of pool) {
        const v = f[field];
        if (!Number.isFinite(v)) continue;
        sum += v as number;
        count += 1;
        if ((v as number) > 0) positives += 1;
        else if ((v as number) < 0) negatives += 1;
      }
      return { avg: count > 0 ? sum / count : 0, count, positives, negatives };
    };
    return {
      day: calc('day'),
      week: calc('week'),
      month: calc('month'),
      threeMonth: calc('threeMonth'),
      year: calc('year'),
      total: pool.length,
    };
  }, [pool]);

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

  const catLabel = SHORT_LABEL[selectedCategory] ?? selectedCategory;

  return (
    <div className="space-y-3">
      {/* Üst kontrol bandı: tek kategori seçimi + top N */}
      <div className="rounded-xl border border-border bg-bg-soft p-3">
        <div className="flex items-start gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent">
            <Layers size={16} />
          </span>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-slate-100">Fon Havuzu — {catLabel}</h3>
            <p className="text-[11px] text-slate-400">
              Seçili kategoride <span className="text-accent">{SORT_LABELS[sortKey]}</span> sıralı en iyi {topN} fon.
              Aşağıdan kategori değiştirerek yeni havuz görebilirsin.
            </p>
          </div>
        </div>

        {/* Kategori chip'leri — SINGLE SELECT (radio mantığı) */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {availableCategories.map((c) => {
            const isActive = selectedCategory === c;
            const label = SHORT_LABEL[c] ?? c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setSelectedCategory(c)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[10px] font-medium transition',
                  isActive
                    ? 'border-accent/50 bg-accent/15 text-accent'
                    : 'border-border bg-bg-card text-slate-400 hover:border-accent/30 hover:text-slate-200',
                )}
                aria-pressed={isActive}
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
            {!proUser && pool.length > tierLimit && (
              <span className="ml-1 text-slate-400">({tierLimit} görünür)</span>
            )}
          </span>
        </div>
      </div>

      {/* Özet performans kartları — havuzun ortalama dönemsel getirisi */}
      {summary && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <SummaryCard label="Havuzdaki Fon" mainValue={`${summary.total}`} sub={catLabel} tone="neutral" />
          <SummaryCard label="Ortalama Gün %" mainValue={fmtAvg(summary.day.avg, summary.day.count)} sub={fmtRatio(summary.day)} tone={summary.day.avg >= 0 ? 'pos' : 'neg'} />
          <SummaryCard label="Ortalama 1 Hafta %" mainValue={fmtAvg(summary.week.avg, summary.week.count)} sub={fmtRatio(summary.week)} tone={summary.week.avg >= 0 ? 'pos' : 'neg'} />
          <SummaryCard label="Ortalama 1 Ay %" mainValue={fmtAvg(summary.month.avg, summary.month.count)} sub={fmtRatio(summary.month)} tone={summary.month.avg >= 0 ? 'pos' : 'neg'} />
          <SummaryCard label="Ortalama 1 Yıl %" mainValue={fmtAvg(summary.year.avg, summary.year.count)} sub={fmtRatio(summary.year)} tone={summary.year.avg >= 0 ? 'pos' : 'neg'} />
        </div>
      )}

      {/* Sonuç tablosu — Fonlar düzeniyle uyumlu */}
      {pool.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg-soft p-6 text-center">
          <Sparkles size={28} className="mx-auto text-slate-600" />
          <p className="mt-2 text-sm text-slate-300">Seçtiğin kategoride fon bulunamadı.</p>
          <p className="mt-1 text-[11px] text-slate-500">
            Farklı bir kategori seç veya verinin yüklenmesini bekle.
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
              {pool.slice(0, tierLimit).map((fund, i) => (
                <PoolFundRow key={fund.code} fund={fund} rank={i + 1} sortKey={sortKey} />
              ))}
              {/* Tier paywall — anon: 5 görür, free: 10 görür, pro: hepsi */}
              {!proUser && pool.length > tierLimit && (
                <PaywallRow isAnon={isAnon} shown={tierLimit} hiddenCount={pool.length - tierLimit} />
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-slate-500">
        Bu havuz seçili kategorideki canlı TEFAS verisine göre dinamik olarak
        yeniden hesaplanır. Yatırım tavsiyesi değildir.
      </p>
    </div>
  );
}

// --- Yardımcı bileşenler & formatlama ---

function fmtAvg(v: number, count: number): string {
  if (count === 0) return '—';
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

function fmtRatio(s: { positives: number; negatives: number; count: number }): string {
  if (s.count === 0) return '—';
  return `${s.positives} ▲ / ${s.negatives} ▼`;
}

function SummaryCard({ label, mainValue, sub, tone }: {
  label: string;
  mainValue: string;
  sub: string;
  tone: 'pos' | 'neg' | 'neutral';
}) {
  const toneClass = tone === 'pos' ? 'text-success' : tone === 'neg' ? 'text-danger' : 'text-slate-100';
  const accent = tone === 'pos' ? 'success' : tone === 'neg' ? 'danger' : 'slate';
  return (
    <PremiumCard accent={accent} hover="lift" density="compact">
      <div className="text-[10px] font-bold uppercase tracking-wider text-accent">{label}</div>
      <div className={cn('mt-1 text-base font-bold tabular-nums drop-shadow-sm', toneClass)}>{mainValue}</div>
      <div className="mt-0.5 text-[10px] text-slate-500">{sub}</div>
    </PremiumCard>
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

// Tier paywall — anon kullanıcıyı üyeliğe, free kullanıcıyı PRO'ya yönlendirir
function PaywallRow({ isAnon, shown, hiddenCount }: { isAnon: boolean; shown: number; hiddenCount: number }) {
  if (isAnon) {
    return (
      <tr className="border-t border-accent/30 bg-accent/5">
        <td colSpan={11} className="px-3 py-4 text-center">
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
            <Lock size={14} className="text-accent" />
            <span className="text-[11px] text-slate-300">
              İlk <strong className="text-accent">{shown}</strong> fonu gördün. Sonraki <strong className="text-accent">5 fon</strong> için ücretsiz üye ol. Tamamı için PRO gerekli (toplam {hiddenCount} fon gizli).
            </span>
            <Link
              to="/auth/signup"
              className="inline-flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-[11px] font-bold text-bg shadow hover:bg-accent/90"
            >
              Ücretsiz Üye Ol →
            </Link>
          </div>
        </td>
      </tr>
    );
  }
  // Free user — PRO'ya yükselt CTA
  return (
    <tr className="border-t border-warning/30 bg-warning/5">
      <td colSpan={11} className="px-3 py-4 text-center">
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
          <Crown size={14} className="text-warning" />
          <span className="text-[11px] text-slate-300">
            İlk <strong className="text-warning">{shown}</strong> fonu gördün. Kalan <strong className="text-warning">{hiddenCount} fon</strong> PRO'ya özel.
          </span>
          <Link
            to="/uyelik"
            className="inline-flex items-center gap-1 rounded-md bg-warning px-3 py-1.5 text-[11px] font-bold text-bg shadow hover:bg-warning/90"
          >
            Ücretsiz Üye Ol →
          </Link>
        </div>
      </td>
    </tr>
  );
}
