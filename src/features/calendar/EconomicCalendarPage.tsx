/**
 * /takvim — Ekonomik + Temettu takvim sayfasi (standalone).
 *
 * Tab'li yapi:
 *  - ?tab=ekonomik (default): TCMB/FED/veri aciklamalari
 *  - ?tab=temettu: BIST temettu takvimi (curated liste)
 *
 * Kurate edilmis TR-odakli olay listesi. Tum kullanicilara acik.
 */

import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { SeoHead } from '@/components/seo/SeoHead';
import { EconomicCalendarWidget } from '@/components/domain/EconomicCalendarWidget';
import { DIVIDEND_CALENDAR, upcomingDividends, type DividendEvent } from '@/data/dividendCalendar';
import { useWatchlist } from '@/store/watchlist';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/data/db';
import { cn } from '@/lib/utils';
import { Info, Coins, CalendarClock, Star, Wallet, TrendingUp } from 'lucide-react';

type Tab = 'ekonomik' | 'temettu';

function getInitialTab(): Tab {
  try {
    if (typeof window !== 'undefined') {
      const t = new URLSearchParams(window.location.search).get('tab');
      if (t === 'temettu' || t === 'ekonomik') return t;
    }
  } catch { /* */ }
  return 'ekonomik';
}

export function EconomicCalendarPage() {
  const [tab, setTab] = useState<Tab>(getInitialTab);

  // URL query param sync (?tab=temettu)
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (tab === 'ekonomik') url.searchParams.delete('tab');
      else url.searchParams.set('tab', tab);
      window.history.replaceState({}, '', url.toString());
    } catch { /* */ }
  }, [tab]);

  return (
    <>
      <SeoHead
        title={tab === 'temettu' ? 'Temettu Takvimi' : 'Ekonomik Takvim'}
        description={
          tab === 'temettu'
            ? 'BIST temettu takvimi: yaklasan ex-tarih, brut/net kar payi, verim %. AKBNK, GARAN, TUPRS, THYAO ve daha fazlasi.'
            : 'TCMB, FED, ECB toplantilari; TUFE, GSYIH, NFP veri aciklamalari; Turkiye siyasi gundem ve VIOP vade sonu.'
        }
        path="/takvim"
      />
      <PageHeader
        title={tab === 'temettu' ? 'Temettu Takvimi' : 'Ekonomik Takvim'}
        subtitle={
          tab === 'temettu'
            ? 'BIST hisse temettu odemeleri, ex-tarih ve verim analizi'
            : 'TR + global merkez bankalari, veri aciklamalari, Turkiye siyasi gundemi, BIST tatil + VIOP vade'
        }
      />

      {/* Tab switcher */}
      <div className="mb-4 flex items-center gap-2 border-b border-border">
        <TabButton active={tab === 'ekonomik'} onClick={() => setTab('ekonomik')} icon={<CalendarClock size={13} />}>
          Ekonomik
        </TabButton>
        <TabButton active={tab === 'temettu'} onClick={() => setTab('temettu')} icon={<Coins size={13} />}>
          Temettu
          <span className="ml-1 rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-bold text-warning tabular-nums">
            {DIVIDEND_CALENDAR.length}
          </span>
        </TabButton>
      </div>

      {tab === 'ekonomik' ? (
        <>
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-accent/30 bg-accent/5 p-3 text-xs">
            <Info size={14} className="mt-0.5 shrink-0 text-accent" />
            <p className="text-slate-300">
              Yuksek etki (kirmizi nokta) olaylar — TCMB faiz, FED FOMC, TUFE, NFP — yatirim
              kararlarini dogrudan etkiler. Tahmini tarihler aciklamalarda belirtilir.
            </p>
          </div>
          <EconomicCalendarWidget daysAhead={60} maxItems={50} />
        </>
      ) : (
        <DividendTakvim />
      )}
    </>
  );
}

function TabButton({ active, onClick, icon, children }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition',
        active
          ? 'border-accent text-accent'
          : 'border-transparent text-slate-400 hover:text-slate-200',
      )}
    >
      {icon} {children}
    </button>
  );
}

// ============================================================================
// DIVIDEND CALENDAR — full page tab content
// ============================================================================

type DividendFilter = 'all' | 'week' | 'month' | 'quarter' | 'portfoy' | 'takip';

function DividendTakvim() {
  const [filter, setFilter] = useState<DividendFilter>('all');
  const [sortBy, setSortBy] = useState<'date' | 'yield' | 'gross'>('date');

  const watchlistSymbols = useWatchlist((s) => s.symbols);
  const portfolio = useLiveQuery(() => db.portfolio.toArray(), []) ?? [];
  const portfolioSymbols = useMemo(
    () => new Set(portfolio.filter((p) => p.kind !== 'fund').map((p) => p.symbol)),
    [portfolio],
  );
  const watchSet = useMemo(() => new Set(watchlistSymbols), [watchlistSymbols]);

  // Filtreleme
  const filtered = useMemo(() => {
    const now = new Date();
    let base: DividendEvent[] = DIVIDEND_CALENDAR;

    if (filter === 'week') base = upcomingDividends(now, 7);
    else if (filter === 'month') base = upcomingDividends(now, 30);
    else if (filter === 'quarter') base = upcomingDividends(now, 90);
    else if (filter === 'portfoy') base = DIVIDEND_CALENDAR.filter((e) => portfolioSymbols.has(e.symbol));
    else if (filter === 'takip') base = DIVIDEND_CALENDAR.filter((e) => watchSet.has(e.symbol));

    const sorted = [...base];
    if (sortBy === 'yield') sorted.sort((a, b) => (b.yieldPct ?? 0) - (a.yieldPct ?? 0));
    else if (sortBy === 'gross') sorted.sort((a, b) => b.grossPerShare - a.grossPerShare);
    else sorted.sort((a, b) => a.exDate.localeCompare(b.exDate));
    return sorted;
  }, [filter, sortBy, portfolioSymbols, watchSet]);

  // Kullanici portfolyosundaki toplam beklenen brut temettu geliri
  const portfolioIncome = useMemo(() => {
    let total = 0;
    let count = 0;
    for (const p of portfolio) {
      if (p.kind === 'fund') continue;
      const evt = DIVIDEND_CALENDAR.find((e) => e.symbol === p.symbol);
      if (evt) {
        total += evt.grossPerShare * p.lot;
        count++;
      }
    }
    return { total, count };
  }, [portfolio]);

  return (
    <div className="space-y-4">
      {/* Filtreler */}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-bg-soft/40 px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Filtre:</span>
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>Tumu</FilterChip>
          <FilterChip active={filter === 'week'} onClick={() => setFilter('week')}>Bu hafta</FilterChip>
          <FilterChip active={filter === 'month'} onClick={() => setFilter('month')}>30 gun</FilterChip>
          <FilterChip active={filter === 'quarter'} onClick={() => setFilter('quarter')}>90 gun</FilterChip>
          <FilterChip active={filter === 'portfoy'} onClick={() => setFilter('portfoy')} icon={<Wallet size={11} />}>
            Portfoyum
          </FilterChip>
          <FilterChip active={filter === 'takip'} onClick={() => setFilter('takip')} icon={<Star size={11} />}>
            Takipte
          </FilterChip>
          <span className="ml-auto text-[10px] text-slate-500">Sirala:</span>
          <select
            className="input py-1 text-[11px] w-auto"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'date' | 'yield' | 'gross')}
          >
            <option value="date">Tarih</option>
            <option value="yield">Verim %</option>
            <option value="gross">Brut TL</option>
          </select>
        </div>

        {/* Portfoy ozet — kullanicinin portfoy'unde temettu odenecek hisse varsa */}
        {portfolioIncome.count > 0 && (
          <div className="border-b border-border bg-warning/5 px-3 py-2.5 text-xs">
            <div className="flex items-center gap-2 text-warning">
              <TrendingUp size={14} />
              <span className="font-semibold">Portfoyunuzden beklenen temettu:</span>
              <span className="tabular-nums font-bold text-slate-100">
                {portfolioIncome.total.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
              </span>
              <span className="text-slate-400">
                ({portfolioIncome.count} hisse · brut)
              </span>
            </div>
          </div>
        )}

        {/* Tablo */}
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            {filter === 'portfoy' && 'Portfoyunuzdeki hisseler icin yaklasan temettu yok.'}
            {filter === 'takip' && 'Takip listenizdeki hisseler icin yaklasan temettu yok.'}
            {filter !== 'portfoy' && filter !== 'takip' && 'Bu filtreye uyan olay yok.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-bg-soft/60 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Ex-Tarih</th>
                  <th className="px-3 py-2 text-left">Sembol</th>
                  <th className="px-3 py-2 text-left hidden sm:table-cell">Not</th>
                  <th className="px-3 py-2 text-right">Brut TL/lot</th>
                  <th className="px-3 py-2 text-right">Net TL/lot</th>
                  <th className="px-3 py-2 text-right">Verim %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((e) => {
                  const inPortfolio = portfolioSymbols.has(e.symbol);
                  const inWatch = watchSet.has(e.symbol);
                  return (
                    <tr key={`${e.symbol}-${e.exDate}`} className="hover:bg-bg-soft/40">
                      <td className="px-3 py-2 tabular-nums text-slate-300">
                        {new Date(e.exDate).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: '2-digit' })}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <Link to={`/stock/${e.symbol}`} className="font-mono font-bold text-accent hover:underline">
                            {e.symbol}
                          </Link>
                          {inPortfolio && <Wallet size={11} className="text-warning" />}
                          {inWatch && <Star size={11} className="text-accent/70" />}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate max-w-[180px]">{e.name}</div>
                      </td>
                      <td className="px-3 py-2 text-slate-400 hidden sm:table-cell text-[11px] truncate max-w-[220px]">
                        {e.note ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-bold text-success">
                        {e.grossPerShare.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                        {e.netPerShare != null
                          ? e.netPerShare.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-warning font-semibold">
                        {e.yieldPct != null ? `%${e.yieldPct.toFixed(2)}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="rounded-lg border border-accent/30 bg-accent/5 p-3 text-[11px] text-slate-300">
        <p>
          <strong className="text-accent">Kaynak:</strong> KAP resmi bildirimler + MKK ödeme kayitlari.
          Net tutar %10 stopaj (2026 mevzuati, gerçek kişi) sonrasi. Kurumlarda oran farkli.
          <br />
          <strong className="text-accent">Uyari:</strong> Ex-tarih ise, hisseyi o tarih itibariyla portfoyde tutmak gerekli. Ex-tarih sonrasi alim temettu hakki kazandirmaz.
        </p>
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, icon, children }: {
  active: boolean; onClick: () => void; icon?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition',
        active
          ? 'border-accent bg-accent/10 text-accent'
          : 'border-border bg-bg-card text-slate-400 hover:border-accent/40 hover:text-slate-200',
      )}
    >
      {icon} {children}
    </button>
  );
}
