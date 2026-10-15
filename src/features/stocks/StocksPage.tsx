import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, Search, Star, RefreshCw, ArrowUpDown } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { DoubleScrollTable } from '@/components/ui/DoubleScrollTable';
import { LiveBadge } from '@/components/domain/LiveBadge';
import { loadStocks, listSnapshotBistSymbols } from '@/data/services';
import { useKatilim } from '@/hooks/useKatilim';
import { useDensity } from '@/store/density';
import { useIsMobile } from '@/hooks/useIsMobile';
import { KatilimBadge } from '@/components/domain/KatilimBadge';
import type { KatilimIndex } from '@/data/katilim';
import { fetchHistoricalYahoo, computePeriodReturns, type PeriodReturns } from '@/data/api/yahoo';
import { MOCK_STOCKS } from '@/data/mock';
import { BIST_UNIQUE } from '@/data/bistAll';
import { BIST_GROUPS, BIST_GROUP_BY_SLUG, BIST_GROUP_KIND_LABELS, type BistGroupKind } from '@/data/bistGroups';
import { useWatchlist } from '@/store/watchlist';
import type { Stock } from '@/data/types';
import { cn } from '@/lib/utils';
import { SeoHead } from '@/components/seo/SeoHead';

type StockRow = Stock & {
  returns?: PeriodReturns;
  loading?: boolean;
};

type SortKey =
  | 'symbol' | 'price' | 'changePct'
  | 'r1h' | 'r1a' | 'r3a' | 'r6a' | 'rytd' | 'r1y';

const STOCK_RETURNS_CACHE_KEY = 'fa.stocks.returns.v2'; // v2: ytd alanı eklendi (15 Eki 2026)
// SWR: 7 gün — hafta sonu (Cmt-Paz) BIST kapalıyken Yahoo/snapshot endpoint boş
// dönebilir; eski cache hala kullanılabilir olsun. Cron haftaiçi her gece D1'i
// yenilediği için pratikte her zaman <24h veri görüyoruz; TTL 7 gün sadece
// hafta sonu kilit + olası ağ hatası senaryosuna karşı sigorta.
const STOCK_RETURNS_TTL_MS = 4 * 24 * 60 * 60_000; // 13 Eki 2026: 7g→4g (Cuma gecesi → Salı sabahı yeter)

interface ReturnsCache {
  fetchedAt: number;
  data: Record<string, PeriodReturns>;
}

// Cache yeterince dolu degilse (ornek: 50'den az hisse) stale sayilir — yeni
// snapshot endpoint'i ~600 hisse donduruyor, eski cache'ler bunu yakalamali.
const STOCK_RETURNS_MIN_ENTRIES = 100;

function readReturnsCache(): Record<string, PeriodReturns> | null {
  try {
    const raw = localStorage.getItem(STOCK_RETURNS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReturnsCache;
    if (Date.now() - parsed.fetchedAt > STOCK_RETURNS_TTL_MS) return null;
    if (!parsed.data) return null;
    const count = Object.keys(parsed.data).length;
    if (count < STOCK_RETURNS_MIN_ENTRIES) return null;
    // GERCEK doluluk kontrolu: sembol sayisi yeterli olsa bile deger yoksa
    // "—" gorunur. En az X sembolde geçerli period degeri olmali.
    const validCount = Object.values(parsed.data).filter((r) =>
      r && Object.values(r).some((v) => v != null && Number.isFinite(v)),
    ).length;
    if (validCount < STOCK_RETURNS_MIN_ENTRIES) return null;
    return parsed.data;
  } catch { return null; }
}

function writeReturnsCache(data: Record<string, PeriodReturns>) {
  // Yetersiz dolu data localStorage'a yazilmasin, sonraki yuklemeyi blok'lar
  if (!data || Object.keys(data).length < STOCK_RETURNS_MIN_ENTRIES) return;
  try {
    localStorage.setItem(STOCK_RETURNS_CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), data }));
  } catch { /* ignore */ }
}

// Agresif memo: hem in-memory hem localStorage — sayfa yenilemede de instant render
// SWR 7 gün: hafta sonu kilidiyle Cuma kapanış değerleri Pazartesi açılışa kadar
// görünür kalır. Cron her haftaiçi günü yeni veriyle override eder.
const STOCKS_MEMO_TTL_MS = 7 * 24 * 60 * 60_000;
const STOCKS_MEMO_LS_KEY = 'fa.stocksMemo.v2';
/** Memo bundan eskiyse canlı fiyat yenilemesi (arka planda) tetiklenir. */
const STOCKS_LIVE_REFRESH_MS = 2 * 60_000;
interface StocksMemo {
  fetchedAt: number;
  stocks: StockRow[];
  updatedAt: number;
}

function readStocksMemoLS(): StocksMemo | null {
  try {
    const raw = localStorage.getItem(STOCKS_MEMO_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StocksMemo;
    if (Date.now() - parsed.fetchedAt > STOCKS_MEMO_TTL_MS) return null;
    return parsed;
  } catch { return null; }
}

function writeStocksMemoLS(memo: StocksMemo) {
  try {
    localStorage.setItem(STOCKS_MEMO_LS_KEY, JSON.stringify(memo));
  } catch { /* quota */ }
}

let stocksMemo: StocksMemo | null = readStocksMemoLS();

export function StocksPage() {
  const watchedSymbolsList = useWatchlist((s) => s.symbols);
  const toggleWatchlist = useWatchlist((s) => s.toggle);
  const watchedSymbols = useMemo(() => new Set(watchedSymbolsList), [watchedSymbolsList]);
  const { map: katilimMap } = useKatilim();
  const density = useDensity((s) => s.density);
  const isMobile = useIsMobile();

  const [stocks, setStocks] = useState<StockRow[]>(() => stocksMemo?.stocks ?? []);
  const [returnsMap, setReturnsMap] = useState<Record<string, PeriodReturns>>(() => readReturnsCache() ?? {});
  const [loading, setLoading] = useState(() => !stocksMemo);
  const [returnsLoading, setReturnsLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | undefined>(() => stocksMemo?.updatedAt);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('changePct');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [tab, setTab] = useState<'all' | 'watched'>('all');
  // Grup filtresi (13 Eki 2026): BIST endeks/tema/sektör grupları (bistGroups.ts).
  // 'all' = BIST Tüm. Son tercih localStorage'da.
  const [groupFilter, setGroupFilter] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('fa.stocks.groupFilter');
      if (saved && (saved === 'all' || BIST_GROUP_BY_SLUG.has(saved))) return saved;
    } catch { /* */ }
    return 'all';
  });
  useEffect(() => {
    try { localStorage.setItem('fa.stocks.groupFilter', groupFilter); } catch { /* */ }
  }, [groupFilter]);
  /** Grup üyelik kümesi — katılım grubu canlı/statik katılım haritasından. */
  const groupSymbolSet = useMemo<ReadonlySet<string> | null>(() => {
    if (groupFilter === 'all') return null;
    if (groupFilter === 'katilim') return new Set(Object.keys(katilimMap));
    const g = BIST_GROUP_BY_SLUG.get(groupFilter);
    return g ? new Set(g.symbols) : null;
  }, [groupFilter, katilimMap]);
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedSym, setExpandedSym] = useState<string | null>(null);
  const PAGE_SIZE = 50;

  const refresh = async (forceReturns = false) => {
    setLoading(true);
    try {
      const richMap = new Map(MOCK_STOCKS.map((s) => [s.symbol, s]));
      const universe: { symbol: string; name: string; sector: string }[] = [];
      const seen = new Set<string>();
      for (const s of MOCK_STOCKS) {
        if (seen.has(s.symbol)) continue;
        seen.add(s.symbol);
        universe.push({ symbol: s.symbol, name: s.name, sector: s.sector ?? '' });
      }
      for (const s of BIST_UNIQUE) {
        if (seen.has(s.symbol)) continue;
        seen.add(s.symbol);
        universe.push({ symbol: s.symbol, name: s.name, sector: s.sector });
      }
      // 13 Eki 2026: statik evrende olmayan ama bugün fiyatı olan semboller
      // (yeni halka arz, liste dışı kalmış — ör. TERA) snapshot'tan eklenir.
      for (const s of await listSnapshotBistSymbols()) {
        if (seen.has(s.symbol)) continue;
        seen.add(s.symbol);
        universe.push({ symbol: s.symbol, name: s.name, sector: '' });
      }
      const all = universe.map((s) => s.symbol);

      // Arka plan yenilemede mevcut satırlar korunur (fiyat "—"a düşmesin).
      const prevMap = new Map((stocksMemo?.stocks ?? []).map((s) => [s.symbol, s]));
      const placeholderStocks: Stock[] = universe.map((u) => {
        const rich = richMap.get(u.symbol);
        const prev = prevMap.get(u.symbol);
        if (prev && prev.price > 0) return prev;
        return {
          symbol: u.symbol,
          name: rich?.name ?? u.name,
          sector: rich?.sector ?? u.sector,
          price: rich?.price ?? 0,
          changePct: 0,
          updatedAt: new Date().toISOString(),
        };
      });
      setStocks(placeholderStocks);

      // === Snapshot fetch'i PARALLEL baslat — stocks batch loop'unu beklemesin ===
      // Eskiden snapshot sirali idi: 819 hisse batch'i (~30sn) bittikten sonra fetch.
      // Bu sirada period kolonlari hep "—" idi. Simdi: snapshot fetch hemen baslar,
      // stocks loop ile yarisir; 1-2sn icinde period verisi ekrana duser.
      const cached = forceReturns ? null : readReturnsCache();
      let snapshotPromise: Promise<Record<string, PeriodReturns> | 'cached'>;
      if (cached) {
        setReturnsMap(cached);
        snapshotPromise = Promise.resolve('cached' as const);
      } else {
        setReturnsLoading(true);
        snapshotPromise = (async () => {
          const newReturns: Record<string, PeriodReturns> = {};
          try {
            const r = await fetch('/api/yahoo/returns-snapshot');
            if (r.ok) {
              const j = await r.json() as { ok: boolean; returns: Record<string, PeriodReturns> };
              if (j.ok && j.returns) {
                for (const [ySym, ret] of Object.entries(j.returns)) {
                  const sym = ySym.endsWith('.IS') ? ySym.slice(0, -3) : ySym;
                  newReturns[sym] = ret;
                }
                setReturnsMap({ ...newReturns });
              }
            }
          } catch { /* fallback ileride topMovers ile */ }
          return newReturns;
        })();
      }

      // 13 Eki 2026: 50'lik paket + 1.5sn bekleme (819 sembol → 30-40sn, bu
      // sürede eski satırlar görünüyordu) → 300'lük paket, 100ms. Snapshot tek
      // cache'li gövde olduğu için paketleme artık yalnızca render adımı.
      const BATCH_SIZE = 300;
      const BATCH_DELAY_MS = 100;
      const liveStocks: Stock[] = [];
      for (let i = 0; i < all.length; i += BATCH_SIZE) {
        const batch = all.slice(i, i + BATCH_SIZE);
        const { data } = await loadStocks(batch);
        liveStocks.push(...data);
        const liveMap = new Map(liveStocks.map((s) => [s.symbol, s]));
        const merged = placeholderStocks.map((p) => liveMap.get(p.symbol) ?? p);
        setStocks(merged);
        if (i + BATCH_SIZE < all.length) {
          await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
        }
      }
      setUpdatedAt(Date.now());

      // Snapshot bu noktada coktan tamamlanmis olmali (~30sn batch loop'u beklerken).
      const snapResult = await snapshotPromise;
      if (snapResult === 'cached') return; // cache yolu — topMovers fallback'i atla
      const newReturns = snapResult;

      // Snapshot'tan gelmeyenleri arka planda batch'lerle yenile.
      // Once gorunur ilk 100 (kullanici ekraninda ne goruyorsa) onceligi al, gerisi sonra.
      const missing = [...liveStocks]
        .filter((s) => s.price > 0 && !newReturns[s.symbol]);
      const byMove = [...missing].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
      // Once alfabetik (sayfa siralamasi) ilk 100, sonra movers
      const alpha = [...missing].sort((a, b) => a.symbol.localeCompare(b.symbol)).slice(0, 100);
      const topMovers = Array.from(
        new Set([...alpha.map((s) => s.symbol), ...byMove.slice(0, 300).map((s) => s.symbol)])
      ).slice(0, 300);
      // Hizlandirildi: 200 -> 300 sembol kapsami, batch 15 -> 30, delay 600 -> 250ms
      const RETURNS_BATCH = 30;
      const RETURNS_BATCH_DELAY_MS = 250;
      for (let i = 0; i < topMovers.length; i += RETURNS_BATCH) {
        const batch = topMovers.slice(i, i + RETURNS_BATCH);
        await Promise.all(
          batch.map(async (sym) => {
            const hist = await fetchHistoricalYahoo(sym, '1y', '1d');
            if (hist) newReturns[sym] = computePeriodReturns(hist.closes);
          }),
        );
        setReturnsMap({ ...newReturns });
        if (i + RETURNS_BATCH < topMovers.length) {
          await new Promise((r) => setTimeout(r, RETURNS_BATCH_DELAY_MS));
        }
      }
      writeReturnsCache(newReturns);
    } finally {
      setLoading(false);
      setReturnsLoading(false);
    }
  };

  useEffect(() => {
    if (stocks.length === 0) return;
    const memo = { fetchedAt: Date.now(), stocks, updatedAt: updatedAt ?? Date.now() };
    stocksMemo = memo;
    writeStocksMemoLS(memo);
  }, [stocks, updatedAt]);

  useEffect(() => {
    const memoAge = stocksMemo ? Date.now() - stocksMemo.fetchedAt : Infinity;
    // Cache guncel VE returns dolu ise instant render.
    // Sadece memo taze olsa bile returnsMap yetersizse yeni fetch tetiklenmeli
    // — aksi halde period kolonlari 7 gun boyunca "—" kalabilir.
    const cachedReturns = readReturnsCache();
    // 13 Eki 2026: memo yalnızca ilk boyama için. Fiyat/GÜN % her açılışta
    // canlıdan yenilenir — eskiden memo 7 gün tazeyse hiç fetch yapılmıyordu,
    // liste bir hafta boyunca eski fiyat ve "—" gösteriyordu.
    if (memoAge < STOCKS_MEMO_TTL_MS && cachedReturns) {
      setLoading(false);
      if (memoAge < STOCKS_LIVE_REFRESH_MS) return;
    }
    refresh(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleWatch = (symbol: string) => {
    toggleWatchlist(symbol);
  };

  const rows: StockRow[] = useMemo(() => {
    const base = tab === 'watched' ? stocks.filter((s) => watchedSymbols.has(s.symbol)) : stocks;
    return base.map((s) => {
      const ret = returnsMap[s.symbol];
      // GUVENILIRLIK: Snapshot changePct (Yahoo quote endpoint prev bug) ile
      // period 1G (Yahoo historical adjusted closes) uyuşmuyorsa period'u tercih et.
      // BIMAS gibi hisselerde snapshot yanlış prev close alıp +9% gibi sahte
      // günlük hareket üretiyor; period 1G daima closes[-1] vs closes[-2] hesabı.
      // GUNLUK DEGISIM (Gun %) HESABI - senkron kaynak politikasi:
      // 1) Onceki bug: snapshot changePct (Yahoo quote endpoint prev bug) ile
      //    period 1g (adjusted closes) sapiyordu; listede yanlis %10+ degerler
      //    ciktiyor ama detay sayfasi period'dan hesapliyor → farkli.
      // 2) Fix: period 1g varsa HER ZAMAN onu kullan (detay sayfasi ile ayni
      //    kaynak, tutarlilik saglanir). Sapma esigi kaldirildi.
      // 3) Period yoksa snapshot fallback + BIST daily limit (+/-11) sanity clamp.
      // 4) 13 Eki 2026: FVT / İş Yatırım snapshot'ı otoriter (dünkü kapanışa
      //    göre, seans içi güncel). Bu kaynaklarda canlı changePct ÖNCE gelir;
      //    period 1g (gece hesaplanan, 1-2 gün geride) sadece Yahoo kaynaklı
      //    satırlarda devrede. TKFEN vakası: liste +3.72%, gerçek -9.98%.
      let displayChangePct = s.changePct;
      const p1g = ret?.['1g'];
      const liveAuthoritative = (s.feedSource === 'fvt' || s.feedSource === 'isyatirim')
        && Number.isFinite(s.changePct) && Math.abs(s.changePct) <= 25;
      if (!(s.price > 0)) {
        // Canlı fiyat yok (kotasyon dışı / kaynakta yok): gece hesaplanan 1g'yi
        // "günlük değişim" diye göstermek yanıltıcı — boş bırak.
        displayChangePct = NaN;
      } else if (liveAuthoritative) {
        displayChangePct = s.changePct;
      } else if (p1g != null && Number.isFinite(p1g)) {
        displayChangePct = p1g;
      } else if (
        Number.isFinite(displayChangePct) &&
        Math.abs(displayChangePct as number) > 11
      ) {
        // Period yok + snapshot BIST limitini asiyor → outlier, gostermeyelim.
        displayChangePct = NaN;
      }
      return { ...s, changePct: displayChangePct, returns: ret };
    });
  }, [stocks, returnsMap, tab, watchedSymbols]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((s) => {
      // Çöp / delisted / suspended hisseleri "Tüm Hisseler" sekmesinde ele.
      // Watchlist'te bilerek tutulanları göster.
      //
      // Üç durum:
      //   A) Fiyatı 0 + getirisi yok        → hiç fiyatlanmamış, sil
      //   B) Fiyatı var + Gün %=0 + getirisi yok → KOZAA/IPEKE gibi borsa
      //      kotesinden çıkarılmış (fiyat MOCK'tan sabit kalmış, hareket yok), sil
      if (tab === 'all') {
        // BYF (6 harf, F sonlu: ZGOLDF, APX30F…) ve vadeli/sertifika kodları hisse değil.
        if (s.symbol.length > 5) return false;
        const hasReturns = s.returns && Object.values(s.returns).some((v) => v != null && Number.isFinite(v));
        const hasPrice = s.price > 0;
        const hasDailyMove = Number.isFinite(s.changePct) && s.changePct !== 0;

        // A) Tamamen ölü
        if (!hasPrice && !hasReturns) return false;
        // B) Fiyatlı ama hareket de yok, getiri de yok → delisted
        if (hasPrice && !hasDailyMove && !hasReturns) return false;
      }
      // BIST kapsamı filtresi (XU100 / XU030 / BISTTUM) — sektör endeksinden ayrı
      if (groupSymbolSet && !groupSymbolSet.has(s.symbol)) return false;
      if (q) {
        const blob = `${s.symbol} ${s.name}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, tab, groupSymbolSet]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let va: number | string = 0;
      let vb: number | string = 0;
      switch (sortKey) {
        case 'symbol':    va = a.symbol; vb = b.symbol; break;
        case 'price':     va = a.price; vb = b.price; break;
        case 'changePct': va = a.changePct; vb = b.changePct; break;
        case 'r1h':       va = a.returns?.['1h'] ?? -Infinity; vb = b.returns?.['1h'] ?? -Infinity; break;
        case 'r1a':       va = a.returns?.['1a'] ?? -Infinity; vb = b.returns?.['1a'] ?? -Infinity; break;
        case 'r3a':       va = a.returns?.['3a'] ?? -Infinity; vb = b.returns?.['3a'] ?? -Infinity; break;
        case 'r6a':       va = a.returns?.['6a'] ?? -Infinity; vb = b.returns?.['6a'] ?? -Infinity; break;
        case 'rytd':      va = a.returns?.['1y'] ?? -Infinity; vb = b.returns?.['1y'] ?? -Infinity; break;
        case 'r1y':       va = a.returns?.['1y'] ?? -Infinity; vb = b.returns?.['1y'] ?? -Infinity; break;
      }
      if (typeof va === 'string' && typeof vb === 'string') {
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = useMemo(
    () => sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [sorted, safePage],
  );
  useEffect(() => { setCurrentPage(1); }, [search, tab, sortKey, sortDir, groupFilter]);

  // BIST scope sayaçları (chip rozetleri için)
  const groupCounts = useMemo(() => {
    const alive: string[] = [];
    for (const r of rows) {
      const hasReturns = r.returns && Object.values(r.returns).some((v) => v != null && Number.isFinite(v));
      const hasPrice = r.price > 0;
      const hasDailyMove = Number.isFinite(r.changePct) && r.changePct !== 0;
      if (tab === 'all') {
        if (r.symbol.length > 5) continue;
        if (!hasPrice && !hasReturns) continue;
        if (hasPrice && !hasDailyMove && !hasReturns) continue;
      }
      alive.push(r.symbol);
    }
    const aliveSet = new Set(alive);
    const result: Record<string, number> = { all: alive.length };
    for (const g of BIST_GROUPS) {
      const members = g.slug === 'katilim' ? Object.keys(katilimMap) : g.symbols;
      let n = 0;
      for (const sym of members) if (aliveSet.has(sym)) n++;
      result[g.slug] = n;
    }
    return result;
  }, [rows, tab, katilimMap]);

  const setSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(k);
      setSortDir(k === 'symbol' ? 'asc' : 'desc');
    }
  };

  return (
    <>
      <SeoHead title="BIST Hisseleri" description="BIST tüm hisseleri canlı fiyat ve dönem getirileri." path="/stocks" />

      {/* Grup chip'leri — BIST resmî endeks/tema/sektör kapsamları (bistGroups.ts) */}
      <div className="mb-3 space-y-2">
        {(['index', 'main', 'sector'] as BistGroupKind[]).filter((kind) => kind === 'index' || !(isMobile && density === 'comfortable')).map((kind) => (
          <div key={kind} className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap [scrollbar-width:none] md:flex-wrap md:whitespace-normal">
            <span className="mr-1 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-fg-3">
              {BIST_GROUP_KIND_LABELS[kind]}
            </span>
            {kind === 'index' && (
              <GroupChip label="BIST Tüm" count={groupCounts.all} active={groupFilter === 'all'} onClick={() => setGroupFilter('all')} />
            )}
            {BIST_GROUPS.filter((g) => g.kind === kind).map((g) => (
              <GroupChip
                key={g.slug}
                label={g.label}
                count={groupCounts[g.slug] ?? 0}
                active={groupFilter === g.slug}
                onClick={() => setGroupFilter(groupFilter === g.slug ? 'all' : g.slug)}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-border bg-bg-soft p-1">
          <button
            className={cn('rounded-md px-3 py-1.5 text-sm transition', tab === 'all' ? 'bg-bg-card text-slate-100' : 'text-slate-400 hover:text-slate-200')}
            onClick={() => setTab('all')}
          >
            Tüm Hisseler
          </button>
          <button
            className={cn('rounded-md px-3 py-1.5 text-sm transition', tab === 'watched' ? 'bg-bg-card text-slate-100' : 'text-slate-400 hover:text-slate-200')}
            onClick={() => setTab('watched')}
          >
            Takipte ({watchedSymbols.size})
          </button>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <LiveBadge updatedAt={updatedAt} refreshing={loading || returnsLoading} />
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input pl-8 w-56"
              placeholder="Sembol veya isim…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {returnsLoading && (
        <div className="mb-3 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-slate-400">
          Getiriler Yahoo Finance'tan çekiliyor (~30 sn) — sonuçlar 30 dk cache'lenir.
        </div>
      )}

      {sortKey === 'changePct' && groupFilter !== 'all' && tab === 'all' && (
        <div className="mb-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-400">
          Günlük sıralama yalnızca <span className="text-slate-200">{BIST_GROUP_BY_SLUG.get(groupFilter)?.label ?? groupFilter}</span> kapsamında.
          Tavan/taban yapan tüm hisseler için{' '}
          <button type="button" className="text-accent underline-offset-2 hover:underline" onClick={() => { setGroupFilter('all'); setCurrentPage(1); }}>
            BIST Tüm
          </button>{' '}
          seçin — Panel'deki "Günün Enleri" tüm BIST'e bakar.
        </div>
      )}

      {sorted.length === 0 ? (
        <EmptyState
          icon={<TrendingUp size={28} />}
          title={tab === 'watched' ? 'Takipte hisse yok' : 'Filtreyle eşleşme yok'}
          description={tab === 'watched' ? 'Bir hisseye yıldız basarak takibe ekle.' : undefined}
        />
      ) : (
        <>
          <div className="mb-3">
            <Pagination
              currentPage={safePage}
              totalPages={totalPages}
              totalItems={sorted.length}
              pageSize={PAGE_SIZE}
              onPageChange={setCurrentPage}
            />
          </div>

          {loading && stocks.length === 0 ? (
            <TableSkeleton rows={12} cols={8} />
          ) : (
          <DoubleScrollTable className="rounded-xl border border-border bg-bg-soft">
            {/* Font boyutu artirildi: text-sm (14px) -> text-base (16px) — okunmayi kolaylastirir.
                Baslik text-[10px] -> text-[11px] + tracking artirildi.
                DoubleScrollTable: ust + alt yatay scroll (kullanici talebi). */}
            <table className="w-full sm:min-w-[720px] text-base">
              <thead className="border-b border-border bg-bg-soft text-[11px] uppercase tracking-widest font-semibold text-slate-400 dark:text-slate-300">
                <tr>
                  <th className="sticky left-0 z-20 bg-bg-soft px-2 py-2.5 text-left">#</th>
                  <SortableHeader label="Sembol" sortKey="symbol" activeKey={sortKey} dir={sortDir} onClick={setSort} align="left" className="sticky left-8 z-20 bg-bg-soft" />
                  <SortableHeader label="Fiyat" sortKey="price" activeKey={sortKey} dir={sortDir} onClick={setSort} />
                  <SortableHeader label="Gün %" sortKey="changePct" activeKey={sortKey} dir={sortDir} onClick={setSort} />
                  <SortableHeader className="hidden sm:table-cell" label="1 Hafta %" sortKey="r1h" activeKey={sortKey} dir={sortDir} onClick={setSort} />
                  <SortableHeader className="hidden sm:table-cell" label="1 Ay %" sortKey="r1a" activeKey={sortKey} dir={sortDir} onClick={setSort} />
                  <SortableHeader className="hidden sm:table-cell" label="3 Ay %" sortKey="r3a" activeKey={sortKey} dir={sortDir} onClick={setSort} />
                  <SortableHeader className="hidden sm:table-cell" label="6 Ay %" sortKey="r6a" activeKey={sortKey} dir={sortDir} onClick={setSort} />
                  <SortableHeader className="hidden sm:table-cell" label="YTD %" sortKey="rytd" activeKey={sortKey} dir={sortDir} onClick={setSort} />
                  <SortableHeader className="hidden sm:table-cell" label="1 Yıl %" sortKey="r1y" activeKey={sortKey} dir={sortDir} onClick={setSort} />
                </tr>
              </thead>
              <tbody>
                {paginated.map((s, i) => {
                  const isWatched = watchedSymbols.has(s.symbol);
                  const globalIndex = (safePage - 1) * PAGE_SIZE + i + 1;
                  return (
                    <StockTableRow
                      key={s.symbol}
                      stock={s}
                      rank={globalIndex}
                      isWatched={isWatched}
                      onToggle={() => toggleWatch(s.symbol)}
                      katilim={katilimMap[s.symbol]}
                      expanded={expandedSym === s.symbol}
                      onExpand={() => setExpandedSym((cur) => (cur === s.symbol ? null : s.symbol))}
                    />
                  );
                })}
              </tbody>
            </table>
          </DoubleScrollTable>
          )}

          <div className="mt-3">
            <Pagination
              currentPage={safePage}
              totalPages={totalPages}
              totalItems={sorted.length}
              pageSize={PAGE_SIZE}
              onPageChange={setCurrentPage}
            />
          </div>
        </>
      )}

      <p className="mt-3 text-[11px] text-slate-500">
        Toplam {sorted.length} hisse. Fiyat 60 sn cache, dönemsel getiriler 30 dk cache (Yahoo Finance).
      </p>
    </>
  );
}

interface SortableHeaderProps {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: 'asc' | 'desc';
  onClick: (k: SortKey) => void;
  align?: 'left' | 'right';
  className?: string;
}

function SortableHeader({ label, sortKey, activeKey, dir, onClick, align = 'right', className }: SortableHeaderProps) {
  const active = activeKey === sortKey;
  return (
    <th
      className={cn(
        'cursor-pointer select-none whitespace-nowrap px-2 py-2.5 transition hover:text-slate-200',
        align === 'right' ? 'text-right' : 'text-left',
        active && 'text-accent',
        className,
      )}
      onClick={() => onClick(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? <span className="text-[9px]">{dir === 'asc' ? '▲' : '▼'}</span> : <ArrowUpDown size={10} className="opacity-30" />}
      </span>
    </th>
  );
}

function GroupChip({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition',
        active
          ? 'border-accent/50 bg-accent/15 text-accent shadow-sm shadow-accent/10'
          : 'border-border bg-bg-soft text-slate-400 hover:border-accent/30 hover:text-slate-200',
      )}
    >
      <span>{label}</span>
      <span className={cn('rounded px-1 py-0.5 text-[9px] font-bold tabular-nums', active ? 'bg-accent/20' : 'bg-bg-card text-slate-500')}>{count}</span>
    </button>
  );
}

interface StockTableRowProps {
  stock: StockRow;
  rank: number;
  isWatched: boolean;
  onToggle: () => void;
  katilim?: KatilimIndex[];
  expanded: boolean;
  onExpand: () => void;
}

const PERIODS: Array<[keyof PeriodReturns, string]> = [['1h', '1 hafta'], ['1a', '1 ay'], ['3a', '3 ay'], ['6a', '6 ay'], ['ytd', 'YTD'], ['1y', '1 yıl']];

function StockTableRow({ stock, rank, isWatched, onToggle, katilim, expanded, onExpand }: StockTableRowProps) {
  const cell = 'px-2 h-row text-right font-mono text-table font-semibold tabular-nums whitespace-nowrap';
  return (
    <>
      <tr
        className={cn('border-b border-border/60 transition cursor-pointer', expanded ? 'bg-bg-card' : 'hover:bg-bg-card')}
        onClick={onExpand}
        aria-expanded={expanded}
      >
        <td className={cn('sticky left-0 z-10 px-2 h-row text-[11px] text-fg-3 tabular-nums', expanded ? 'bg-bg-card' : 'bg-bg-soft')}>{rank}</td>
        <td className={cn('sticky left-8 z-10 px-2 h-row', expanded ? 'bg-bg-card' : 'bg-bg-soft')}>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(); }}
              className={cn('shrink-0 transition', isWatched ? 'text-warning' : 'text-fg-3 hover:text-warning')}
              title={isWatched ? 'Takipten çıkar' : 'Takibe al'}
            >
              <Star size={12} fill={isWatched ? 'currentColor' : 'none'} />
            </button>
            <Link
              to={`/stock/${stock.symbol}`}
              onClick={(e) => e.stopPropagation()}
              title={stock.sector ? `${stock.name} · ${stock.sector}` : stock.name}
              className="font-mono text-table font-bold text-fg hover:text-accent"
            >
              {stock.symbol}
            </Link>
            <KatilimBadge indices={katilim} />
          </div>
        </td>
        <td className={cn(cell, 'text-fg')}>
          {stock.price > 0 ? `₺${stock.price.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
        </td>
        <PerfCell value={stock.changePct} />
        <PerfCell value={stock.returns?.['1h']} mobile={false} />
        <PerfCell value={stock.returns?.['1a']} mobile={false} />
        <PerfCell value={stock.returns?.['3a']} mobile={false} />
        <PerfCell value={stock.returns?.['6a']} mobile={false} />
        <PerfCell value={stock.returns?.['ytd']} mobile={false} />
        <PerfCell value={stock.returns?.['1y']} mobile={false} />
      </tr>
      {expanded && (
        <tr className="border-b border-border bg-bg-card">
          <td colSpan={10} className="border-l-2 border-accent px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium text-fg">{stock.name}</div>
                <div className="text-fg-3">
                  {stock.sector && stock.sector !== 'Diger' && stock.sector !== 'Diğer' ? stock.sector : 'Sektör bilgisi yok'}
                  {stock.feedSource && stock.asOf && (
                    <> · {stock.feedSource === 'fvt' ? 'FVT' : stock.feedSource === 'isyatirim' ? 'İş Yatırım' : 'Yahoo'} · {new Date(stock.asOf).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' })} · ~15 dk gecikmeli</>
                  )}
                </div>
              </div>
              <div className="flex gap-4 overflow-x-auto font-mono [scrollbar-width:none]">
                {PERIODS.map(([k, label]) => {
                  const v = stock.returns?.[k];
                  const ok = v != null && Number.isFinite(v);
                  return (
                    <span key={k} className="text-right">
                      <span className="block text-[10px] font-sans uppercase tracking-wider text-fg-3">{label}</span>
                      <span className={cn('font-semibold', !ok ? 'text-fg-3' : v >= 0 ? 'text-success' : 'text-danger')}>
                        {ok ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : '—'}
                      </span>
                    </span>
                  );
                })}
              </div>
              <div className="ml-auto flex gap-2">
                <Link to={`/stock/${stock.symbol}`} onClick={(e) => e.stopPropagation()} className="btn-secondary h-8 px-3 text-xs">Detay</Link>
                <button type="button" onClick={(e) => { e.stopPropagation(); onToggle(); }} className="btn-secondary h-8 px-3 text-xs">
                  {isWatched ? '★ Takipte' : '☆ Takibe al'}
                </button>
                <Link to={`/stock/${stock.symbol}?alarm=1`} onClick={(e) => e.stopPropagation()} className="btn-secondary h-8 px-3 text-xs">Alarm</Link>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function PerfCell({ value, mobile = true }: { value: number | undefined; mobile?: boolean }) {
  const vis = mobile ? '' : 'hidden sm:table-cell';
  if (value == null || !Number.isFinite(value)) {
    return <td className={cn('px-2 h-row text-right font-mono text-table tabular-nums text-fg-3 whitespace-nowrap', vis)}>—</td>;
  }
  const tone = value > 0 ? 'text-success' : value < 0 ? 'text-danger' : 'text-neutral';
  return (
    <td className={cn('px-2 h-row text-right font-mono text-table font-semibold tabular-nums whitespace-nowrap', tone, vis)}>
      {value > 0 ? '+' : ''}{value.toFixed(2)}%
    </td>
  );
}
