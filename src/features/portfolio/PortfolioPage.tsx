import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Wallet, Plus, Trash2, RefreshCw, ChevronRight, Search, Sparkles, Upload, FileText, PiggyBank, Pencil, History,
} from 'lucide-react';
import { FundsPanel } from './FundsPanel';
import { TxnHistoryModal } from './TxnHistoryModal';
import { PortfolioDonut, type DonutItem } from './PortfolioDonut';
import { useAuth, isElite } from '@/store/auth';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TRTextNumberInput } from '@/components/ui/NumberField';
import { LiveBadge } from '@/components/domain/LiveBadge';
import { toast } from '@/components/ui/Toast';
import { db, type PortfolioPosition } from '@/data/db';
import {
  shouldUseCloud,
  cloudAddPosition,
  cloudUpdatePosition,
  cloudDeletePosition,
  cloudFetch,
  cloudToDexiePosition,
  cloudToDexieTxn,
  findDuplicateGroups,
  mergeAllDuplicates,
} from '@/data/portfolioSync';

/**
 * Cloud + Dexie senkron: cloud'tan veriyi çek, Dexie'yi yenile.
 * Save işlemi sonrası Dexie'nin cloud ile tutarlı olması için çağrılır.
 */
async function syncFromCloud(): Promise<void> {
  try {
    const fresh = await cloudFetch();
    await db.transaction('rw', db.portfolio, db.portfolioTxns, async () => {
      await db.portfolio.clear();
      for (const p of fresh.positions) {
        await db.portfolio.add(cloudToDexiePosition(p));
      }
      await db.portfolioTxns.clear();
      for (const t of fresh.txns) {
        await db.portfolioTxns.add(cloudToDexieTxn(t));
      }
    });
  } catch (e) {
    console.warn('[portfolio-sync] refresh failed:', e);
  }
}
import { loadStocks } from '@/data/services';
import { MOCK_STOCKS } from '@/data/mock';
import type { Stock } from '@/data/types';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { SeoHead } from '@/components/seo/SeoHead';
import { downloadPortfolioPdf } from '@/lib/portfolioPdfExport';

interface PositionRow extends PortfolioPosition {
  currentPrice?: number;
  marketValue?: number;
  cost?: number;
  pnl?: number;
  pnlPct?: number;
  changePct?: number; // hisse günlük değişim
  name?: string;
  sector?: string;
}

export function PortfolioPage() {
  // Tab: 'stocks' = hisse pozisyonlari, 'funds' = fon pozisyonlari (ayri panel)
  //
  // Oncelik: URL query param (?tab=stocks|funds) > localStorage > 'stocks'.
  // Panel sayfasindaki PortfolioPanelSummary kartlari /portfoy?tab=stocks veya
  // /portfoy?tab=funds linkleriyle hangi tab'a gidilecegini belirtir.
  const [tab, setTab] = useState<'stocks' | 'funds'>(() => {
    try {
      if (typeof window !== 'undefined') {
        const fromUrl = new URLSearchParams(window.location.search).get('tab');
        if (fromUrl === 'stocks' || fromUrl === 'funds') return fromUrl;
      }
      const saved = localStorage.getItem('fa.portfolio.tab');
      return saved === 'funds' ? 'funds' : 'stocks';
    } catch { return 'stocks'; }
  });
  useEffect(() => {
    try { localStorage.setItem('fa.portfolio.tab', tab); } catch { /* */ }
  }, [tab]);

  // Tum kayitlar — sayac icin
  const allPositions = useLiveQuery(() => db.portfolio.toArray(), []) ?? [];
  // Bu sayfa hisse listesi mantigi calistirir; fon kayitlari ayri panel'de gosterilir.
  const positions = useMemo(() => allPositions.filter((p) => p.kind !== 'fund'), [allPositions]);
  const fundCount = useMemo(() => allPositions.filter((p) => p.kind === 'fund').length, [allPositions]);

  const [stockMap, setStockMap] = useState<Map<string, Stock>>(new Map());
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | undefined>();
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [toDelete, setToDelete] = useState<PortfolioPosition | null>(null);
  const [toEdit, setToEdit] = useState<PortfolioPosition | null>(null);
  const [toViewHistory, setToViewHistory] = useState<PortfolioPosition | null>(null);

  // AI analysis
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const user = useAuth((s) => s.user);
  const proUser = isElite(user);

  const refresh = async () => {
    if (positions.length === 0) {
      setStockMap(new Map());
      return;
    }
    setLoading(true);
    try {
      const symbols = Array.from(new Set(positions.map((p) => p.symbol)));
      const { data } = await loadStocks(symbols);
      const m = new Map<string, Stock>();
      data.forEach((s) => m.set(s.symbol, s));
      setStockMap(m);
      setUpdatedAt(Date.now());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions.length]);

  const rows: PositionRow[] = useMemo(() => {
    return positions.map((p) => {
      const stock = stockMap.get(p.symbol);
      if (!stock || stock.price <= 0) {
        return { ...p, currentPrice: undefined, cost: p.lot * p.avgPrice };
      }
      const cost = p.lot * p.avgPrice;
      const marketValue = p.lot * stock.price;
      const pnl = marketValue - cost;
      const pnlPct = (pnl / cost) * 100;
      return {
        ...p,
        currentPrice: stock.price,
        marketValue,
        cost,
        pnl,
        pnlPct,
        changePct: stock.changePct,
        name: stock.name,
        sector: stock.sector,
      };
    });
  }, [positions, stockMap]);

  // Duplicate detect — ayni hisse 2+ kayit varsa banner cik
  const dupes = useMemo(() => findDuplicateGroups(positions, 'stock'), [positions]);
  const [merging, setMerging] = useState(false);
  const handleMergeDupes = async () => {
    if (merging) return;
    setMerging(true);
    try {
      const r = await mergeAllDuplicates(positions, 'stock');
      if (r.positionsRemoved > 0) {
        toast.success('Birlestirildi', `${r.groupsMerged} sembol, ${r.positionsRemoved} kayit silindi`);
      } else {
        toast.info('Duplicate yok');
      }
    } catch (e) {
      toast.error('Birlestirme hatasi', String((e as Error).message ?? e));
    } finally {
      setMerging(false);
    }
  };

  // Auto-snapshot: auth'lu, valid pozisyon var + son 24h icinde snapshot yazilmamis
  // → sessizce POST /api/portfolio/snapshots (localStorage guard ile spam engel)
  useEffect(() => {
    if (!user) return;
    if (positions.length === 0) return;
    if (rows.length === 0) return;

    const guardKey = `fa.portfolio.snapshot.lastAt.${user.id}`;
    const lastAt = Number(localStorage.getItem(guardKey) ?? '0');
    const now = Date.now();
    if (now - lastAt < 6 * 60 * 60 * 1000) return; // 6h guard (dedupe)

    // rows'da yeterli veri yok ise (henuz canli fiyat gelmemis) atla
    const valid = rows.filter((r) => r.marketValue != null && r.marketValue > 0);
    if (valid.length === 0) return;

    let totalValue = 0;
    let totalCost = 0;
    for (const r of valid) {
      totalValue += r.marketValue ?? 0;
      totalCost += r.cost ?? r.lot * r.avgPrice;
    }
    const totalPnl = totalValue - totalCost;
    const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

    const positions_light = valid.map((r) => ({
      symbol: r.symbol,
      lot: r.lot,
      avgPrice: r.avgPrice,
      currentPrice: r.currentPrice,
      marketValue: r.marketValue,
    }));

    fetch('/api/portfolio/snapshots', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        totalValue,
        totalCost,
        totalPnl,
        totalPnlPct,
        positionCount: valid.length,
        positions: positions_light,
      }),
    })
      .then((r) => {
        if (r.ok) {
          localStorage.setItem(guardKey, String(now));
        }
      })
      .catch(() => { /* sessizce */ });
  }, [user, positions.length, rows]);

  const totals = useMemo(() => {
    let totalCost = 0;
    let totalValue = 0;
    let dailyChange = 0;
    let valid = 0;
    for (const r of rows) {
      if (r.cost && r.marketValue && r.currentPrice && r.changePct != null) {
        totalCost += r.cost;
        totalValue += r.marketValue;
        // Günlük değişim: bugünkü değer - dünkü değer
        const yesterdayPrice = r.currentPrice / (1 + r.changePct / 100);
        dailyChange += (r.currentPrice - yesterdayPrice) * r.lot;
        valid++;
      } else if (r.cost) {
        totalCost += r.cost;
      }
    }
    const totalPnl = totalValue - totalCost;
    const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
    const dailyPnlPct = totalValue > 0 ? (dailyChange / (totalValue - dailyChange)) * 100 : 0;
    return { totalCost, totalValue, totalPnl, totalPnlPct, dailyChange, dailyPnlPct, validCount: valid };
  }, [rows]);

  return (
    <>
      <SeoHead title="Portföyüm" description="Portföy pozisyonlarınız, kar/zarar, dağılım ve performans." path="/portfoy" noindex />

      <PageHeader
        title="Portföyüm"
        subtitle="Pozisyonlarını ekle, canlı kâr/zarar takibi yap. Veriler tarayıcına kaydedilir."
        actions={
          tab === 'stocks' ? (
            <div className="flex items-center gap-2">
              <LiveBadge updatedAt={updatedAt} refreshing={loading} />
              <button className="btn-secondary" onClick={refresh} disabled={loading || positions.length === 0}>
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Yenile
              </button>
              <Link className="btn-secondary" to="/portfoy/gecmis" title="Portföy Geçmişi">
                <History size={14} /> Geçmiş
              </Link>
              <button
                className="btn-secondary"
                onClick={() => {
                  if (positions.length === 0) {
                    toast.info('Önce pozisyon ekle');
                    return;
                  }
                  try {
                    downloadPortfolioPdf({
                      tabLabel: 'Hisseler',
                      userEmail: user?.email,
                      rows: rows.map((r) => ({
                        symbol: r.symbol,
                        name: r.name,
                        lot: r.lot,
                        avgPrice: r.avgPrice,
                        currentPrice: r.currentPrice,
                        marketValue: r.marketValue,
                        cost: r.cost ?? r.lot * r.avgPrice,
                        pnl: r.pnl,
                        pnlPct: r.pnlPct,
                      })),
                      totals,
                    });
                    toast.success('PDF indirildi');
                  } catch (e) {
                    toast.error('PDF hatası', String((e as Error).message ?? e));
                  }
                }}
                disabled={positions.length === 0}
                title="Portföyü PDF olarak indir"
              >
                <FileText size={14} /> PDF İndir
              </button>
              <button className="btn-secondary" onClick={() => setImportOpen(true)}>
                <Upload size={14} /> CSV İçe Aktar
              </button>
              <button className="btn-primary" onClick={() => setAddOpen(true)}>
                <Plus size={14} /> Pozisyon Ekle
              </button>
            </div>
          ) : null
        }
      />

      {/* Tab switcher — Hisseler / Fonlar */}
      <div className="mb-4 flex items-center gap-2 border-b border-border">
        <button
          type="button"
          onClick={() => setTab('stocks')}
          className={cn(
            'flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition',
            tab === 'stocks'
              ? 'border-accent text-accent'
              : 'border-transparent text-slate-400 hover:text-slate-200',
          )}
        >
          <Wallet size={13} /> Hisseler
          <span className="rounded-full bg-bg-card px-1.5 py-0.5 text-[10px] tabular-nums">
            {positions.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setTab('funds')}
          className={cn(
            'flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition',
            tab === 'funds'
              ? 'border-accent text-accent'
              : 'border-transparent text-slate-400 hover:text-slate-200',
          )}
        >
          <PiggyBank size={13} /> Fonlar
          <span className="rounded-full bg-bg-card px-1.5 py-0.5 text-[10px] tabular-nums">
            {fundCount}
          </span>
        </button>
      </div>

      {tab === 'funds' && <FundsPanel />}

      {tab === 'stocks' && (<>

      {/* AI Portföy Analizi */}
      {positions.length > 0 && (
        <section className="card mb-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <Sparkles size={14} className="text-warning" /> AI Portföy Analizi
              <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-warning">PRO</span>
            </h2>
            {!aiAnalysis && (
              <button
                className="btn-primary"
                onClick={async () => {
                  setAiLoading(true);
                  try {
                    const r = await fetch('/api/ai/portfolio', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        positions: rows.map((r) => ({
                          symbol: r.symbol,
                          name: r.name,
                          sector: r.sector,
                          lot: r.lot,
                          avgPrice: r.avgPrice,
                          currentPrice: r.currentPrice,
                          pnlPct: r.pnlPct,
                          changePct: r.changePct,
                        })),
                        totalValue: totals.totalValue,
                        totalCost: totals.totalCost,
                        totalPnlPct: totals.totalPnlPct,
                        dailyPnlPct: totals.dailyPnlPct,
                      }),
                    });
                    const j = await r.json() as { ok: boolean; analysis?: string; error?: string };
                    if (j.ok && j.analysis) {
                      setAiAnalysis(j.analysis);
                      toast.success('Portföy analizi hazır');
                    } else {
                      toast.error('AI hatası', j.error);
                    }
                  } catch (e) {
                    toast.error('Ağ hatası', (e as Error).message);
                  } finally {
                    setAiLoading(false);
                  }
                }}
                disabled={aiLoading || (!proUser && !!user)}
                title={!proUser && user ? 'Sadece ELITE üyelere özel' : 'Portföyünü AI ile analiz et'}
              >
                {aiLoading ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {aiLoading ? 'Analiz üretiliyor…' : 'AI Analizi Üret'}
              </button>
            )}
            {aiAnalysis && (
              <button className="btn-secondary" onClick={() => setAiAnalysis(null)}>
                Kapat
              </button>
            )}
          </div>

          {!proUser && user && !aiAnalysis && (
            <div className="mt-3 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
              🔒 Sadece ELITE üyelere özel. <Link to="/uyelik" className="underline">Yükselt →</Link>
            </div>
          )}

          {aiAnalysis && (
            <div className="mt-3 rounded-lg border border-accent/30 bg-accent/5 p-4">
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-200">{aiAnalysis}</p>
              <p className="mt-3 text-[10px] text-slate-500">
                Claude Haiku 4.5 ile üretildi. Yatırım tavsiyesi değildir.
              </p>
            </div>
          )}
        </section>
      )}

      {/* Duplicate uyarisi — ayni hisse 2+ kayit */}
      {dupes.totalDupes > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <div className="flex items-center gap-2 text-warning">
            <span className="font-semibold">Dikkat:</span>
            <span className="text-slate-200">
              {dupes.groups.length} hissede toplam {dupes.totalDupes} fazla kayit var.
              Birlestirince agirlikli ortalama maliyet hesaplanir.
            </span>
          </div>
          <button
            type="button"
            onClick={handleMergeDupes}
            disabled={merging}
            className="btn-primary shrink-0 text-xs disabled:opacity-50"
          >
            {merging ? 'Birlestiriliyor...' : 'Birlestir'}
          </button>
        </div>
      )}

      {/* Özet */}
      {positions.length > 0 && (
        <section className="glass-card mb-5 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">Genel Özet</h2>
          <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
            <SummaryBox label="Toplam Değer" value={formatMoney(totals.totalValue)} tone="accent" />
            <SummaryBox label="Toplam Maliyet" value={formatMoney(totals.totalCost)} />
            <SummaryBox
              label="Toplam Kâr/Zarar"
              value={`${totals.totalPnl >= 0 ? '+' : ''}${formatMoney(totals.totalPnl)}`}
              subValue={`${totals.totalPnlPct >= 0 ? '+' : ''}${totals.totalPnlPct.toFixed(2)}%`}
              tone={totals.totalPnl >= 0 ? 'success' : 'danger'}
            />
            <SummaryBox
              label="Bugünkü Değişim"
              value={`${totals.dailyChange >= 0 ? '+' : ''}${formatMoney(totals.dailyChange)}`}
              subValue={`${totals.dailyPnlPct >= 0 ? '+' : ''}${totals.dailyPnlPct.toFixed(2)}%`}
              tone={totals.dailyChange >= 0 ? 'success' : 'danger'}
            />
          </div>

          {/* Hisse dagilim pasta grafigi */}
          {(() => {
            const donutItems: DonutItem[] = rows
              .filter((r) => (r.marketValue ?? r.cost ?? 0) > 0)
              .map((r) => ({
                label: r.symbol,
                value: r.marketValue ?? r.cost ?? 0,
                sublabel: r.name ?? r.sector,
              }));
            if (donutItems.length === 0) return null;
            return (
              <div className="mt-4 rounded-lg border border-border bg-bg-soft p-4">
                <PortfolioDonut items={donutItems} title="Hisse Dağılımı (Değer Bazında)" />
              </div>
            );
          })()}
        </section>
      )}

      {/* Pozisyon listesi */}
      {positions.length === 0 ? (
        <EmptyState
          icon={<Wallet size={28} />}
          title="Portföyün boş"
          description="İlk pozisyonunu ekle, canlı kâr/zarar takibini başlat."
          action={
            <button className="btn-primary" onClick={() => setAddOpen(true)}>
              <Plus size={14} /> İlk Pozisyon
            </button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-bg-soft">
          <table className="min-w-full text-xs">
            <thead className="bg-bg-card text-[10px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-3 py-2.5 text-left">Hisse</th>
                <th className="px-3 py-2.5 text-right">Lot</th>
                <th className="px-3 py-2.5 text-right">Ort. Maliyet</th>
                <th className="px-3 py-2.5 text-right">Mevcut Fiyat</th>
                <th className="px-3 py-2.5 text-right hidden md:table-cell">Maliyet</th>
                <th className="px-3 py-2.5 text-right">Değer</th>
                <th className="px-3 py-2.5 text-right">Kâr/Zarar</th>
                <th className="px-3 py-2.5 text-right hidden md:table-cell">Bugün</th>
                <th className="px-3 py-2.5 text-center w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const tone = (r.pnl ?? 0) >= 0 ? 'text-success' : 'text-danger';
                const dailyTone = (r.changePct ?? 0) >= 0 ? 'text-success' : 'text-danger';
                return (
                  <tr key={r.id} className="hover:bg-bg-card">
                    <td className="px-3 py-2.5">
                      <Link to={`/stock/${r.symbol}`} className="inline-flex items-center gap-1 font-mono font-semibold text-accent hover:underline">
                        {r.symbol}
                        <ChevronRight size={10} />
                      </Link>
                      {r.name && <div className="mt-0.5 text-[10px] text-slate-500 truncate max-w-[180px]">{r.name}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">{r.lot}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">{formatMoney(r.avgPrice)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-100">
                      {r.currentPrice != null ? formatMoney(r.currentPrice) : '—'}
                    </td>
                    <td className="hidden md:table-cell px-3 py-2.5 text-right tabular-nums text-slate-400">
                      {r.cost != null ? formatMoney(r.cost) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-100">
                      {r.marketValue != null ? formatMoney(r.marketValue) : '—'}
                    </td>
                    <td className={cn('px-3 py-2.5 text-right tabular-nums font-medium', tone)}>
                      {r.pnl != null ? (
                        <>
                          {r.pnl >= 0 ? '+' : ''}{formatMoney(r.pnl)}
                          <div className="text-[10px] opacity-80">
                            {r.pnlPct! >= 0 ? '+' : ''}{r.pnlPct!.toFixed(2)}%
                          </div>
                        </>
                      ) : '—'}
                    </td>
                    <td className={cn('hidden md:table-cell px-3 py-2.5 text-right tabular-nums', dailyTone)}>
                      {r.changePct != null ? `${r.changePct >= 0 ? '+' : ''}${r.changePct.toFixed(2)}%` : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="inline-flex items-center gap-0.5">
                        <button
                          onClick={() => setToViewHistory(r)}
                          className="rounded p-1 text-slate-400 hover:bg-accent/10 hover:text-accent"
                          title="Islem gecmisi"
                        >
                          <History size={12} />
                        </button>
                        <button
                          onClick={() => setToEdit(r)}
                          className="rounded p-1 text-slate-400 hover:bg-accent/10 hover:text-accent"
                          title="Duzenle"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => setToDelete(r)}
                          className="rounded p-1 text-danger/70 hover:bg-danger/10 hover:text-danger"
                          title="Sil"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      </>)}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Pozisyon Ekle" size="md">
        <AddPositionForm onClose={() => setAddOpen(false)} />
      </Modal>

      <Modal open={!!toEdit} onClose={() => setToEdit(null)} title={`${toEdit?.symbol ?? ''} - Duzenle`} size="md">
        {toEdit && (
          <EditPositionForm
            position={toEdit}
            currentPrice={stockMap.get(toEdit.symbol)?.price}
            name={stockMap.get(toEdit.symbol)?.name}
            onClose={() => setToEdit(null)}
          />
        )}
      </Modal>

      <TxnHistoryModal position={toViewHistory} onClose={() => setToViewHistory(null)} />

      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="CSV / Excel ile Toplu İçe Aktar" size="lg">
        <CsvImportForm onClose={() => setImportOpen(false)} />
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title="Pozisyonu sil?"
        message={`${toDelete?.symbol} pozisyonu portföyden silinecek.`}
        destructive
        confirmText="Sil"
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (toDelete?.id) {
            if (shouldUseCloud()) {
              try {
                await cloudDeletePosition(toDelete.id);
                await syncFromCloud();
              } catch (e) {
                console.warn('[portfolio] cloud delete failed, falling back to Dexie:', e);
                await db.portfolio.delete(toDelete.id);
              }
            } else {
              await db.portfolio.delete(toDelete.id);
            }
            toast.success('Pozisyon silindi');
          }
          setToDelete(null);
        }}
      />
    </>
  );
}

function SummaryBox({ label, value, subValue, tone }: {
  label: string;
  value: string;
  subValue?: string;
  tone?: 'success' | 'danger' | 'accent';
}) {
  const toneClass = tone === 'success' ? 'border-success/30 bg-success/5 text-success'
    : tone === 'danger' ? 'border-danger/30 bg-danger/5 text-danger'
    : tone === 'accent' ? 'border-accent/30 bg-accent/5 text-accent'
    : 'border-border bg-bg-card text-slate-100';
  return (
    <div className={cn('rounded-lg border p-3', toneClass)}>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-bold tabular-nums">{value}</div>
      {subValue && <div className="mt-0.5 text-xs">{subValue}</div>}
    </div>
  );
}

function CsvImportForm({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<Array<{ symbol: string; lot: number; avgPrice: number; ok: boolean; error?: string }>>([]);
  const [importing, setImporting] = useState(false);

  const parse = (input: string) => {
    const lines = input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return [];
    // İlk satır header mı kontrol et
    const first = lines[0].toLowerCase();
    const hasHeader = /sembol|symbol|hisse|kod/.test(first);
    const data = hasHeader ? lines.slice(1) : lines;
    return data.map((line) => {
      // Tab, virgül, noktalı virgül desteği
      const parts = line.split(/[\t,;]/).map((p) => p.trim().replace(/^"|"$/g, ''));
      const [symRaw, lotRaw, priceRaw] = parts;
      const symbol = (symRaw || '').toUpperCase();
      const lot = parseFloat((lotRaw || '').replace(',', '.'));
      const avgPrice = parseFloat((priceRaw || '').replace(',', '.'));
      let error: string | undefined;
      if (!symbol) error = 'Sembol boş';
      else if (!Number.isFinite(lot) || lot <= 0) error = 'Geçersiz lot';
      else if (!Number.isFinite(avgPrice) || avgPrice <= 0) error = 'Geçersiz fiyat';
      return { symbol, lot, avgPrice, ok: !error, error };
    });
  };

  const onTextChange = (v: string) => {
    setText(v);
    setPreview(parse(v));
  };

  const validRows = preview.filter((r) => r.ok);

  const doImport = async () => {
    setImporting(true);
    try {
      const now = Date.now();
      const entries = validRows.map((r) => ({
        symbol: r.symbol,
        lot: r.lot,
        avgPrice: r.avgPrice,
        addedAt: now,
      }));
      await db.portfolio.bulkAdd(entries);
      toast.success(`${entries.length} pozisyon eklendi`, 'CSV içe aktarımı tamamlandı');
      onClose();
    } catch (e) {
      toast.error('İçe aktarım hatası', (e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-accent/30 bg-accent/5 p-3 text-xs text-slate-300">
        <strong className="text-accent">Format:</strong> Her satır bir pozisyon. Sembol, Lot, Ort. Maliyet — virgül, noktalı virgül veya TAB ile ayrılmış. Excel'den copy-paste edebilirsin.
        <pre className="mt-2 rounded bg-bg-card p-2 text-[10px] text-slate-400 font-mono">
{`THYAO, 100, 285.50
GARAN, 500, 142.80
ASELS	250	75.20`}
        </pre>
      </div>

      <Field label="Veriyi yapıştır">
        <textarea
          className="input min-h-[140px] font-mono text-xs"
          placeholder={`Sembol, Lot, Maliyet\nTHYAO, 100, 285.50\nGARAN, 500, 142.80`}
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          autoFocus
        />
      </Field>

      {preview.length > 0 && (
        <div>
          <div className="mb-2 text-xs text-slate-400">
            {validRows.length} geçerli / {preview.length} toplam satır
          </div>
          <div className="max-h-60 overflow-y-auto rounded-lg border border-border">
            <table className="min-w-full text-xs">
              <thead className="bg-bg-card text-[10px] uppercase text-slate-500">
                <tr>
                  <th className="px-2 py-1.5 text-left">Sembol</th>
                  <th className="px-2 py-1.5 text-right">Lot</th>
                  <th className="px-2 py-1.5 text-right">Fiyat</th>
                  <th className="px-2 py-1.5 text-left">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {preview.map((r, i) => (
                  <tr key={i} className={r.ok ? '' : 'bg-danger/5'}>
                    <td className="px-2 py-1 font-mono text-slate-100">{r.symbol || '—'}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-slate-300">{Number.isFinite(r.lot) ? r.lot : '—'}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-slate-300">{Number.isFinite(r.avgPrice) ? r.avgPrice.toFixed(2) : '—'}</td>
                    <td className="px-2 py-1 text-xs">
                      {r.ok ? <span className="text-success">✓ OK</span> : <span className="text-danger">✗ {r.error}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button className="btn-secondary" onClick={onClose}>İptal</button>
        <button className="btn-primary" onClick={doImport} disabled={importing || validRows.length === 0}>
          <FileText size={14} /> {importing ? 'İçe aktarılıyor…' : `${validRows.length} Pozisyon Ekle`}
        </button>
      </div>
    </div>
  );
}

function EditPositionForm({ position, currentPrice, name, onClose }: {
  position: PortfolioPosition;
  currentPrice?: number;
  name?: string;
  onClose: () => void;
}) {
  const [lot, setLot] = useState(position.lot.toString());
  const [avgPrice, setAvgPrice] = useState(position.avgPrice.toString());
  const [note, setNote] = useState(position.note ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const lotNum = parseFloat(lot.replace(',', '.'));
    const priceNum = parseFloat(avgPrice.replace(',', '.'));
    if (!Number.isFinite(lotNum) || lotNum <= 0 || !Number.isFinite(priceNum) || priceNum <= 0) {
      toast.error('Geçersiz giriş', 'Lot ve ortalama fiyat zorunlu, pozitif olmalı');
      return;
    }
    if (!position.id) {
      toast.error('Kayıt bulunamadı');
      return;
    }
    setSaving(true);
    try {
      // CLOUD PATH (auth varsa)
      if (shouldUseCloud()) {
        try {
          await cloudUpdatePosition(position.id, {
            lot: lotNum,
            avgPrice: priceNum,
            note: note.trim() || undefined,
          });
          await syncFromCloud();
          toast.success(`${position.symbol} güncellendi (bulutta)`, `${lotNum} lot @ ${priceNum}₺`);
          onClose();
          return;
        } catch (e) {
          console.warn('[portfolio] cloud update failed, falling back to Dexie:', e);
        }
      }
      await db.portfolio.update(position.id, {
        lot: lotNum,
        avgPrice: priceNum,
        note: note.trim() || undefined,
      });
      toast.success(`${position.symbol} güncellendi`, `${lotNum} lot @ ${priceNum}₺`);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-accent/30 bg-accent/5 p-3 text-xs text-slate-300">
        <strong className="text-accent">{position.symbol}</strong>
        {name && <span className="ml-2 text-slate-400">{name}</span>}
        {currentPrice && (
          <div className="mt-1 text-[11px] text-slate-400">
            Mevcut fiyat: <strong className="text-slate-200">{currentPrice.toFixed(2)}₺</strong>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Lot Adedi">
          <TRTextNumberInput
            className="input"
            value={lot}
            onChange={setLot}
            autoFocus
          />
        </Field>
        <Field label="Ortalama Maliyet (₺)">
          <TRTextNumberInput
            className="input"
            value={avgPrice}
            onChange={setAvgPrice}
          />
        </Field>
      </div>
      <Field label="Not (opsiyonel)">
        <input
          className="input"
          placeholder="ör. Uzun vade için aldım"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <button className="btn-secondary" onClick={onClose}>İptal</button>
        <button className="btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </div>
    </div>
  );
}

function todayDateStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function AddPositionForm({ onClose }: { onClose: () => void }) {
  const [symbol, setSymbol] = useState('');
  const [lot, setLot] = useState('');
  const [avgPrice, setAvgPrice] = useState('');
  const [executedDate, setExecutedDate] = useState<string>(todayDateStr());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const suggestions = symbol.trim()
    ? MOCK_STOCKS.filter((s) =>
        s.symbol.toLowerCase().includes(symbol.toLowerCase()) ||
        s.name.toLowerCase().includes(symbol.toLowerCase()),
      ).slice(0, 6)
    : [];

  const save = async () => {
    const sym = symbol.trim().toUpperCase();
    const lotNum = parseFloat(lot);
    const priceNum = parseFloat(avgPrice);
    if (!sym || !Number.isFinite(lotNum) || lotNum <= 0 || !Number.isFinite(priceNum) || priceNum <= 0) {
      toast.error('Geçersiz giriş', 'Sembol, lot ve ortalama fiyat zorunlu');
      return;
    }
    setSaving(true);
    try {
      const now = Date.now();
      const executedAt = executedDate ? new Date(executedDate).getTime() : now;

      // CLOUD PATH (auth varsa): server agirlikli ortalama yapar, sonra Dexie sync
      if (shouldUseCloud()) {
        try {
          await cloudAddPosition({
            kind: 'stock',
            symbol: sym,
            lot: lotNum,
            avgPrice: priceNum,
            note: note.trim() || undefined,
            executedAt,
          });
          await syncFromCloud();
          toast.success(`${sym} kaydedildi (bulutta)`, `${lotNum} lot @ ${priceNum}₺`);
          onClose();
          return;
        } catch (e) {
          console.warn('[portfolio] cloud add failed, falling back to Dexie:', e);
          // Cloud fail — Dexie path'ine düş
        }
      }

      // Ayni sembol icin mevcut hisse pozisyonu var mi? (kind=fund haric)
      const existing = await db.portfolio
        .filter((p) => p.symbol === sym && p.kind !== 'fund')
        .first();

      let positionId: number;
      if (existing && existing.id) {
        // Agirlikli ortalama maliyet: (eski_lot * eski_avg + yeni_lot * yeni_avg) / (eski_lot + yeni_lot)
        const totalLot = existing.lot + lotNum;
        const weightedAvg = (existing.lot * existing.avgPrice + lotNum * priceNum) / totalLot;
        await db.portfolio.update(existing.id, {
          lot: totalLot,
          avgPrice: weightedAvg,
          note: note.trim() || existing.note,
        });
        positionId = existing.id;
        toast.success(`${sym} guncellendi`,
          `Toplam ${totalLot} lot · Yeni ort. maliyet ${weightedAvg.toFixed(2)}₺`);
      } else {
        positionId = (await db.portfolio.add({
          symbol: sym,
          lot: lotNum,
          avgPrice: priceNum,
          addedAt: now,
          note: note.trim() || undefined,
        })) as number;
        toast.success(`${sym} eklendi`, `${lotNum} lot @ ${priceNum}₺`);
      }
      // Islem gecmisine yeni alim kaydi (her durumda)
      await db.portfolioTxns.add({
        positionId,
        kind: 'stock',
        symbol: sym,
        lot: lotNum,
        price: priceNum,
        executedAt,
        note: note.trim() || undefined,
        createdAt: now,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <Field label="Hisse Sembolü" hint="ör. THYAO, GARAN, ASELS">
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="input pl-8 uppercase"
            placeholder="THYAO"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            autoFocus
            maxLength={6}
          />
          {suggestions.length > 0 && symbol.length >= 2 && (
            <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-border bg-bg-card shadow-xl max-h-60 overflow-y-auto">
              {suggestions.map((s) => (
                <button
                  key={s.symbol}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setSymbol(s.symbol);
                    if (s.price > 0 && !avgPrice) setAvgPrice(s.price.toString());
                  }}
                  className="flex w-full items-start justify-between gap-2 px-3 py-2 text-xs hover:bg-bg-soft"
                >
                  <div className="min-w-0 flex-1 text-left">
                    <span className="font-mono font-semibold text-accent">{s.symbol}</span>
                    <div className="text-slate-400 text-[10px] truncate">{s.name}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-[11px] font-bold text-slate-100 tabular-nums">
                      {s.price > 0 ? `${s.price.toFixed(2)}₺` : '—'}
                    </div>
                    <div className={cn(
                      'text-[10px] font-bold tabular-nums',
                      (s.changePct ?? 0) >= 0 ? 'text-success' : 'text-danger',
                    )}>
                      {Number.isFinite(s.changePct) ? `${(s.changePct as number) >= 0 ? '+' : ''}${(s.changePct as number).toFixed(2)}%` : ''}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Lot Adedi">
          <TRTextNumberInput
            className="input"
            value={lot}
            onChange={setLot}
            placeholder="100"
          />
        </Field>
        <Field label="Ortalama Maliyet (₺)">
          <TRTextNumberInput
            className="input"
            value={avgPrice}
            onChange={setAvgPrice}
            placeholder="285,50"
          />
        </Field>
      </div>
      <Field label="İşlem Tarihi" hint="Bugünden geriye dönük tarih girebilirsin">
        <input
          className="input"
          type="date"
          value={executedDate}
          max={todayDateStr()}
          onChange={(e) => setExecutedDate(e.target.value)}
        />
      </Field>
      <Field label="Not (opsiyonel)">
        <input
          className="input"
          placeholder="ör. Uzun vade için aldım"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <button className="btn-secondary" onClick={onClose}>İptal</button>
        <button className="btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Kaydediliyor…' : 'Ekle'}
        </button>
      </div>
    </div>
  );
}
