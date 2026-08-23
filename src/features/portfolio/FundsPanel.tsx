/**
 * Portfoyum -> Fonlar paneli (ekle/duzenle/sil).
 *
 * - TEFAS feed'inden fon arama (kod/isim)
 * - Pay adedi + ortalama NAV ile pozisyon ekleme
 * - Liste: kod/ad/adet/ort.NAV/mevcut NAV/maliyet/deger/kar-zarar/gunluk
 * - TEFAS'a kapali fonlar icin kirmizi rozet + uyari
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Trash2, RefreshCw, ChevronRight, Search, PiggyBank, AlertCircle, Pencil, History } from 'lucide-react';
import { TxnHistoryModal } from './TxnHistoryModal';
import { PortfolioDonut, type DonutItem } from './PortfolioDonut';
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

/** Cloud'tan veriyi cek, Dexie'yi yenile */
async function syncFundsFromCloud(): Promise<void> {
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
    console.warn('[funds-sync] refresh failed:', e);
  }
}
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TRTextNumberInput } from '@/components/ui/NumberField';
import { LiveBadge } from '@/components/domain/LiveBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/components/ui/Toast';
import { db, type PortfolioPosition } from '@/data/db';
import { loadFundsAsPerformance, computeTefasOpenClient } from '@/data/api/tefasGithub';
import type { FundPerformance } from '@/data/types';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface FundPositionRow extends PortfolioPosition {
  currentNav?: number;
  marketValue?: number;
  cost?: number;
  pnl?: number;
  pnlPct?: number;
  day?: number;        // bugun %
  week?: number;
  month?: number;
  year?: number;
  name?: string;
  category?: string;
  tefasOpen?: boolean;
}

export interface FundTotals {
  totalCost: number;
  totalValue: number;
  totalPnl: number;
  totalPnlPct: number;
  dailyChange: number;
  dailyPnlPct: number;
}

interface Props {
  /** Hisse + fon toplamlarini ust seviyede birlestirmek icin (opsiyonel) */
  onTotalsChange?: (t: FundTotals & { count: number }) => void;
}

export function FundsPanel({ onTotalsChange }: Props = {}) {
  // Sadece fon kayitlari ('kind' field'i indexed degil, filter() ile)
  const positions = useLiveQuery(() => db.portfolio.filter((p) => p.kind === 'fund').toArray(), []) ?? [];

  const [funds, setFunds] = useState<FundPerformance[]>([]);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | undefined>();
  const [addOpen, setAddOpen] = useState(false);
  const [toDelete, setToDelete] = useState<PortfolioPosition | null>(null);
  const [toEdit, setToEdit] = useState<PortfolioPosition | null>(null);
  const [toViewHistory, setToViewHistory] = useState<PortfolioPosition | null>(null);

  // Duplicate fon kaydi tarama + tek tikla birlestir
  const dupes = useMemo(() => findDuplicateGroups(positions, 'fund'), [positions]);
  const [merging, setMerging] = useState(false);
  const handleMergeDupes = async () => {
    if (merging) return;
    setMerging(true);
    try {
      const r = await mergeAllDuplicates(positions, 'fund');
      if (r.positionsRemoved > 0) {
        toast.success('Birlestirildi', `${r.groupsMerged} fon, ${r.positionsRemoved} kayit silindi`);
      } else {
        toast.info('Duplicate yok');
      }
    } catch (e) {
      toast.error('Birlestirme hatasi', String((e as Error).message ?? e));
    } finally {
      setMerging(false);
    }
  };

  // Map for fast lookup
  const fundMap = useMemo(() => {
    const m = new Map<string, FundPerformance>();
    for (const f of funds) m.set(f.code, f);
    return m;
  }, [funds]);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await loadFundsAsPerformance();
      if (r && r.funds) {
        setFunds(r.funds);
        setUpdatedAt(Date.now());
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const rows: FundPositionRow[] = useMemo(() => {
    return positions.map((p) => {
      const f = fundMap.get(p.symbol);
      const cost = p.lot * p.avgPrice;
      if (!f) {
        return { ...p, cost };
      }
      // Artik FundPerformance'da `nav` (anlik fiyat) field'i var (TEFAS feed'inden).
      // marketValue = adet * mevcut NAV, pnl = marketValue - cost
      const currentNav = f.nav;
      const marketValue = (currentNav && currentNav > 0) ? p.lot * currentNav : undefined;
      const pnl = marketValue != null ? marketValue - cost : undefined;
      const pnlPct = pnl != null && cost > 0 ? (pnl / cost) * 100 : undefined;
      return {
        ...p,
        cost,
        currentNav,
        marketValue,
        pnl,
        pnlPct,
        name: f.name,
        category: f.category,
        tefasOpen: f.tefasOpen,
        day: f.day,
        week: f.week,
        month: f.month,
        year: f.year,
      };
    });
  }, [positions, fundMap]);

  // Toplamlar — mevcut NAV feed'den (gercek), yoksa yaklasik (1Y getiri ile)
  const totals = useMemo(() => {
    let totalCost = 0;
    let totalValue = 0;
    let dailyChange = 0;
    for (const r of rows) {
      if (r.cost) totalCost += r.cost;
      // Oncelik: gercek marketValue (Adet * Mevcut NAV)
      if (r.marketValue != null) {
        totalValue += r.marketValue;
        if (Number.isFinite(r.day)) {
          dailyChange += r.marketValue * ((r.day as number) / 100);
        }
      } else if (r.cost && Number.isFinite(r.year)) {
        // Fallback: NAV feed'de yoksa 1Y getiriyle yaklasik
        const approxValue = r.cost * (1 + (r.year as number) / 100);
        totalValue += approxValue;
        if (Number.isFinite(r.day)) {
          dailyChange += approxValue * ((r.day as number) / 100);
        }
      } else if (r.cost) {
        totalValue += r.cost;
      }
    }
    const totalPnl = totalValue - totalCost;
    const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
    const dailyPnlPct = totalValue > 0 ? (dailyChange / (totalValue - dailyChange || 1)) * 100 : 0;
    return { totalCost, totalValue, totalPnl, totalPnlPct, dailyChange, dailyPnlPct };
  }, [rows]);

  useEffect(() => {
    onTotalsChange?.({ ...totals, count: positions.length });
  }, [totals, positions.length, onTotalsChange]);

  return (
    <>
      <div className="mb-3 flex items-center justify-end gap-2">
        <LiveBadge updatedAt={updatedAt} refreshing={loading} />
        <button className="btn-secondary" onClick={refresh} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Yenile
        </button>
        <button className="btn-primary" onClick={() => setAddOpen(true)}>
          <Plus size={14} /> Fon Ekle
        </button>
      </div>

      {/* Duplicate uyarisi — ayni fon 2+ kayit */}
      {dupes.totalDupes > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <div className="flex items-center gap-2 text-warning">
            <span className="font-semibold">Dikkat:</span>
            <span className="text-slate-200">
              {dupes.groups.length} fonda toplam {dupes.totalDupes} fazla kayit var.
              Birlestirince agirlikli ortalama NAV hesaplanir.
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

      {/* Ozet */}
      {positions.length > 0 && (
        <section className="glass-card mb-4 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">Fon Portfoy Ozeti</h2>
          <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
            <Box label="Toplam Maliyet" value={formatMoney(totals.totalCost)} />
            <Box label="Tahmini Deger" value={formatMoney(totals.totalValue)} tone="accent" />
            <Box
              label="Toplam Kar/Zarar"
              value={`${totals.totalPnl >= 0 ? '+' : ''}${formatMoney(totals.totalPnl)}`}
              sub={`${totals.totalPnlPct >= 0 ? '+' : ''}${totals.totalPnlPct.toFixed(2)}%`}
              tone={totals.totalPnl >= 0 ? 'success' : 'danger'}
            />
            <Box
              label="Bugunku Degisim"
              value={`${totals.dailyChange >= 0 ? '+' : ''}${formatMoney(totals.dailyChange)}`}
              sub={`${totals.dailyPnlPct >= 0 ? '+' : ''}${totals.dailyPnlPct.toFixed(2)}%`}
              tone={totals.dailyChange >= 0 ? 'success' : 'danger'}
            />
          </div>
          {/* Pasta grafik dagilimi */}
          {(() => {
            const donutItems: DonutItem[] = rows
              .filter((r) => (r.marketValue ?? r.cost ?? 0) > 0)
              .map((r) => ({
                label: r.symbol,
                value: r.marketValue ?? r.cost ?? 0,
                sublabel: r.name ?? r.category,
              }));
            if (donutItems.length === 0) return null;
            return (
              <div className="mt-4 rounded-lg border border-border bg-bg-soft p-4">
                <PortfolioDonut items={donutItems} title="Fon Dağılımı (Değer Bazında)" />
              </div>
            );
          })()}
          <p className="mt-3 text-[10px] text-slate-500">
            <AlertCircle size={10} className="inline mr-1" />
            Fon degeri TEFAS feed'inden gunluk NAV ile hesaplanir. Eski feed'lerde NAV yoksa 1Y getiri ile yaklasik hesaplanir.
          </p>
        </section>
      )}

      {/* Liste */}
      {positions.length === 0 ? (
        <EmptyState
          icon={<PiggyBank size={28} />}
          title="Fon portfoyun bos"
          description="TEFAS fonlarini ekle, getiri takibini baslat."
          action={
            <button className="btn-primary" onClick={() => setAddOpen(true)}>
              <Plus size={14} /> Ilk Fon
            </button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-bg-soft">
          <table className="min-w-full text-xs">
            <thead className="bg-bg-card text-[10px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-3 py-2.5 text-left">Fon</th>
                <th className="px-3 py-2.5 text-right">Adet</th>
                <th className="px-3 py-2.5 text-right">Ort. NAV</th>
                <th className="px-3 py-2.5 text-right">Mevcut NAV</th>
                <th className="px-3 py-2.5 text-right hidden md:table-cell">Maliyet</th>
                <th className="px-3 py-2.5 text-right">Deger</th>
                <th className="px-3 py-2.5 text-right">Kar/Zarar</th>
                <th className="px-3 py-2.5 text-right hidden md:table-cell">Gun %</th>
                <th className="px-3 py-2.5 text-right hidden lg:table-cell">Hafta %</th>
                <th className="px-3 py-2.5 text-right hidden xl:table-cell">Ay %</th>
                <th className="px-3 py-2.5 text-right hidden xl:table-cell">1 Yil %</th>
                <th className="px-3 py-2.5 text-center w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const yearTone = (r.year ?? 0) >= 0 ? 'text-success' : 'text-danger';
                const dayTone = (r.day ?? 0) >= 0 ? 'text-success' : 'text-danger';
                const weekTone = (r.week ?? 0) >= 0 ? 'text-success' : 'text-danger';
                const monthTone = (r.month ?? 0) >= 0 ? 'text-success' : 'text-danger';
                const pnlTone = (r.pnl ?? 0) >= 0 ? 'text-success' : 'text-danger';
                return (
                  <tr key={r.id} className="hover:bg-bg-card">
                    <td className="px-3 py-2.5">
                      <Link to={`/fund/${r.symbol}`} className="inline-flex items-center gap-1 font-mono font-semibold text-accent hover:underline">
                        {r.symbol}
                        <ChevronRight size={10} />
                      </Link>
                      <div className="mt-0.5 flex items-center gap-1 flex-wrap">
                        {r.category && (
                          <span className="rounded border border-border px-1 py-0 text-[9px] uppercase tracking-wider text-slate-500">
                            {r.category}
                          </span>
                        )}
                        {r.tefasOpen === false && (
                          <span
                            className="rounded border border-danger/40 bg-danger/15 px-1 py-0 text-[9px] font-bold uppercase tracking-wider text-danger"
                            title="Bu fon TEFAS uzerinden alinamaz (SPK nitelikli yatirimci kosulu)."
                          >
                            TEFAS Kapali
                          </span>
                        )}
                      </div>
                      {r.name && <div className="mt-0.5 text-[10px] text-slate-500 truncate max-w-[220px]">{r.name}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">{r.lot}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">{r.avgPrice.toFixed(4)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-100 font-medium">
                      {r.currentNav != null ? r.currentNav.toFixed(4) : '—'}
                    </td>
                    <td className="hidden md:table-cell px-3 py-2.5 text-right tabular-nums text-slate-400">
                      {r.cost != null ? formatMoney(r.cost) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-100 font-medium">
                      {r.marketValue != null ? formatMoney(r.marketValue) : '—'}
                    </td>
                    <td className={cn('px-3 py-2.5 text-right tabular-nums font-medium', pnlTone)}>
                      {r.pnl != null ? (
                        <>
                          {r.pnl >= 0 ? '+' : ''}{formatMoney(r.pnl)}
                          <div className="text-[10px] opacity-80">
                            {(r.pnlPct ?? 0) >= 0 ? '+' : ''}{(r.pnlPct ?? 0).toFixed(2)}%
                          </div>
                        </>
                      ) : '—'}
                    </td>
                    <td className={cn('hidden md:table-cell px-3 py-2.5 text-right tabular-nums', dayTone)}>
                      {Number.isFinite(r.day) ? `${(r.day as number) >= 0 ? '+' : ''}${(r.day as number).toFixed(2)}%` : '—'}
                    </td>
                    <td className={cn('hidden lg:table-cell px-3 py-2.5 text-right tabular-nums', weekTone)}>
                      {Number.isFinite(r.week) ? `${(r.week as number) >= 0 ? '+' : ''}${(r.week as number).toFixed(2)}%` : '—'}
                    </td>
                    <td className={cn('hidden xl:table-cell px-3 py-2.5 text-right tabular-nums', monthTone)}>
                      {Number.isFinite(r.month) ? `${(r.month as number) >= 0 ? '+' : ''}${(r.month as number).toFixed(2)}%` : '—'}
                    </td>
                    <td className={cn('hidden xl:table-cell px-3 py-2.5 text-right tabular-nums font-medium', yearTone)}>
                      {Number.isFinite(r.year) ? `${(r.year as number) >= 0 ? '+' : ''}${(r.year as number).toFixed(2)}%` : '—'}
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

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Fon Ekle" size="md">
        <AddFundForm funds={funds} onClose={() => setAddOpen(false)} />
      </Modal>

      <Modal open={!!toEdit} onClose={() => setToEdit(null)} title={`${toEdit?.symbol ?? ''} - Duzenle`} size="md">
        {toEdit && (
          <EditFundForm
            position={toEdit}
            currentNav={fundMap.get(toEdit.symbol)?.nav}
            fundName={fundMap.get(toEdit.symbol)?.name}
            onClose={() => setToEdit(null)}
          />
        )}
      </Modal>

      <TxnHistoryModal position={toViewHistory} onClose={() => setToViewHistory(null)} />

      <ConfirmDialog
        open={!!toDelete}
        title="Fon pozisyonunu sil?"
        message={`${toDelete?.symbol} portfoyden silinecek.`}
        destructive
        confirmText="Sil"
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (toDelete?.id) {
            if (shouldUseCloud()) {
              try {
                await cloudDeletePosition(toDelete.id);
                await syncFundsFromCloud();
              } catch (e) {
                console.warn('[funds] cloud delete failed, falling back to Dexie:', e);
                await db.portfolio.delete(toDelete.id);
              }
            } else {
              await db.portfolio.delete(toDelete.id);
            }
            toast.success('Fon silindi');
          }
          setToDelete(null);
        }}
      />
    </>
  );
}

function Box({ label, value, sub, tone }: {
  label: string;
  value: string;
  sub?: string;
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
      {sub && <div className="mt-0.5 text-xs">{sub}</div>}
    </div>
  );
}

function EditFundForm({ position, currentNav, fundName, onClose }: {
  position: PortfolioPosition;
  currentNav?: number;
  fundName?: string;
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
      toast.error('Gecersiz giris', 'Adet ve ortalama NAV zorunlu, pozitif olmali');
      return;
    }
    if (!position.id) {
      toast.error('Kayit bulunamadi');
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
          await syncFundsFromCloud();
          toast.success(`${position.symbol} guncellendi (bulutta)`, `${lotNum} adet @ ${priceNum}₺`);
          onClose();
          return;
        } catch (e) {
          console.warn('[funds] cloud update failed, falling back to Dexie:', e);
        }
      }
      await db.portfolio.update(position.id, {
        lot: lotNum,
        avgPrice: priceNum,
        note: note.trim() || undefined,
      });
      toast.success(`${position.symbol} guncellendi`, `${lotNum} adet @ ${priceNum}₺`);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-accent/30 bg-accent/5 p-3 text-xs text-slate-300">
        <strong className="text-accent">{position.symbol}</strong>
        {fundName && <span className="ml-2 text-slate-400">{fundName}</span>}
        {currentNav && (
          <div className="mt-1 text-[11px] text-slate-400">
            Bugunki NAV: <strong className="text-slate-200">{currentNav.toFixed(4)}₺</strong>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Pay Adedi">
          <TRTextNumberInput
            className="input"
            value={lot}
            onChange={setLot}
            autoFocus
          />
        </Field>
        <Field label="Ortalama NAV (₺/pay)">
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
          placeholder="ör. Aylik duzenli alim"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <button className="btn-secondary" onClick={onClose}>Iptal</button>
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

function AddFundForm({ funds, onClose }: { funds: FundPerformance[]; onClose: () => void }) {
  const [code, setCode] = useState('');
  const [lot, setLot] = useState('');
  const [avgPrice, setAvgPrice] = useState('');
  const [executedDate, setExecutedDate] = useState<string>(todayDateStr());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const suggestions = code.trim().length >= 2
    ? funds.filter((f) =>
        f.code.toLowerCase().includes(code.toLowerCase()) ||
        (f.name ?? '').toLowerCase().includes(code.toLowerCase()),
      ).slice(0, 8)
    : [];

  const selectedFund = funds.find((f) => f.code === code.toUpperCase());
  const isTefasClosed = selectedFund
    ? selectedFund.tefasOpen === false
      || computeTefasOpenClient(selectedFund.category ?? '', selectedFund.name ?? '') === false
    : false;

  // Fon secildiginde avgPrice'i mevcut NAV ile default doldur (kullanici degistirebilir).
  // NOT: TRTextNumberInput onFocus'ta value'yu parseTRNumber ile okur — nokta bin
  // ayraci sanip strip eder. Bu nedenle "2.5105" gibi English decimal gonderilirse
  // 25105 olarak yorumlanir. TR formatta ("2,5105") gonder ki dogru okusun.
  const pickFund = (f: FundPerformance) => {
    setCode(f.code);
    if (f.nav && !avgPrice) {
      // TR yerel: 2,5105 (virgul ondalik). Bin ayraci gerekmez (NAV genelde <1000).
      const trFormatted = f.nav.toLocaleString('tr-TR', {
        minimumFractionDigits: 4,
        maximumFractionDigits: 4,
      });
      setAvgPrice(trFormatted);
    }
  };

  const save = async () => {
    const sym = code.trim().toUpperCase();
    const lotNum = parseFloat(lot.replace(',', '.'));
    const priceNum = parseFloat(avgPrice.replace(',', '.'));
    if (!sym || !Number.isFinite(lotNum) || lotNum <= 0 || !Number.isFinite(priceNum) || priceNum <= 0) {
      toast.error('Gecersiz giris', 'Fon kodu, adet ve ortalama NAV zorunlu');
      return;
    }
    setSaving(true);
    try {
      const now = Date.now();
      const executedAt = executedDate ? new Date(executedDate).getTime() : now;

      // CLOUD PATH (auth varsa): server agirlikli ortalama yapar
      if (shouldUseCloud()) {
        try {
          await cloudAddPosition({
            kind: 'fund',
            symbol: sym,
            lot: lotNum,
            avgPrice: priceNum,
            note: note.trim() || undefined,
            executedAt,
          });
          await syncFundsFromCloud();
          toast.success(`${sym} kaydedildi (bulutta)`, `${lotNum} adet @ ${priceNum}₺`);
          onClose();
          return;
        } catch (e) {
          console.warn('[funds] cloud add failed, falling back to Dexie:', e);
        }
      }

      // Ayni fon kodu icin mevcut pozisyon var mi?
      const existing = await db.portfolio
        .filter((p) => p.symbol === sym && p.kind === 'fund')
        .first();

      let positionId: number;
      if (existing && existing.id) {
        // Agirlikli ortalama NAV: (eski_adet * eski_nav + yeni_adet * yeni_nav) / toplam_adet
        const totalLot = existing.lot + lotNum;
        const weightedAvg = (existing.lot * existing.avgPrice + lotNum * priceNum) / totalLot;
        await db.portfolio.update(existing.id, {
          lot: totalLot,
          avgPrice: weightedAvg,
          note: note.trim() || existing.note,
        });
        positionId = existing.id;
        toast.success(`${sym} guncellendi`,
          `Toplam ${totalLot} adet · Yeni ort. NAV ${weightedAvg.toFixed(4)}₺`);
      } else {
        positionId = (await db.portfolio.add({
          kind: 'fund',
          symbol: sym,
          lot: lotNum,
          avgPrice: priceNum,
          addedAt: now,
          note: note.trim() || undefined,
        })) as number;
        toast.success(`${sym} eklendi`, `${lotNum} adet @ ${priceNum}₺`);
      }
      // Islem gecmisine yeni alim kaydi
      await db.portfolioTxns.add({
        positionId,
        kind: 'fund',
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
      <Field label="Fon Kodu" hint="ör. CPU, YHK, AFA — TEFAS kodu (3 harf)">
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="input pl-8 uppercase"
            placeholder="CPU"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            autoFocus
            maxLength={5}
          />
          {suggestions.length > 0 && code.length >= 2 && (
            <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-border bg-bg-card shadow-xl max-h-60 overflow-y-auto">
              {suggestions.map((f) => {
                const closed = f.tefasOpen === false
                  || computeTefasOpenClient(f.category ?? '', f.name ?? '') === false;
                return (
                  <button
                    key={f.code}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); pickFund(f); }}
                    className="flex w-full items-start justify-between gap-2 px-3 py-2 text-xs hover:bg-bg-soft"
                  >
                    <div className="min-w-0 flex-1 text-left">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-semibold text-accent">{f.code}</span>
                        {closed && (
                          <span className="rounded bg-danger/15 px-1 py-0 text-[8px] font-bold uppercase text-danger">
                            Kapali
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">{f.name}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-mono text-[11px] font-bold text-slate-100 tabular-nums">
                        {f.nav ? `${f.nav.toFixed(4)}₺` : '—'}
                      </div>
                      <div className={cn(
                        'text-[10px] font-bold tabular-nums',
                        (f.year ?? 0) >= 0 ? 'text-success' : 'text-danger',
                      )}>
                        {Number.isFinite(f.year) ? `${(f.year as number) >= 0 ? '+' : ''}${(f.year as number).toFixed(1)}%` : '—'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Field>

      {isTefasClosed && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-[11px] text-warning">
          <AlertCircle size={12} className="inline mr-1 -mt-0.5" />
          <strong>Bu fon TEFAS'ta islem gormez.</strong> Sadece fon kuruculusunun kendi platformundan veya yetkili araci kurumdan alinabilir.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Pay Adedi" hint="Fraksiyonel kabul edilir (ör. 1.234,56)">
          <TRTextNumberInput
            className="input"
            value={lot}
            onChange={setLot}
            placeholder="1.000"
          />
        </Field>
        <Field
          label="Ortalama NAV (₺/pay)"
          hint={selectedFund?.nav ? `Bugunki NAV: ${selectedFund.nav.toFixed(4)}₺ (otomatik dolduruldu)` : undefined}
        >
          <TRTextNumberInput
            className="input"
            value={avgPrice}
            onChange={setAvgPrice}
            placeholder={selectedFund?.nav ? selectedFund.nav.toFixed(4) : '2,85'}
          />
        </Field>
      </div>
      {(() => {
        // Toplam maliyet ozeti: lot x avgPrice. Kullanici yaptigi girisin TL
        // karsiligini bir bakista dogrulayabilsin — yanlislikla 25.105 girmesin.
        const l = parseFloat(lot.replace(/\./g, '').replace(',', '.'));
        const p = parseFloat(avgPrice.replace(/\./g, '').replace(',', '.'));
        if (!Number.isFinite(l) || l <= 0 || !Number.isFinite(p) || p <= 0) return null;
        const total = l * p;
        const totalFmt = total.toLocaleString('tr-TR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        return (
          <div className="rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-[12px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-400">Toplam maliyet</span>
              <span className="font-bold tabular-nums text-accent">{totalFmt} ₺</span>
            </div>
            <div className="mt-0.5 text-[10px] text-slate-500 tabular-nums">
              {l.toLocaleString('tr-TR', { maximumFractionDigits: 4 })} pay × {p.toLocaleString('tr-TR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}₺
            </div>
          </div>
        );
      })()}
      <Field label="Islem Tarihi" hint="Bugunden geriye donuk tarih girebilirsin">
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
          placeholder="ör. Aylik duzenli alim"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <button className="btn-secondary" onClick={onClose}>Iptal</button>
        <button className="btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Kaydediliyor…' : 'Ekle'}
        </button>
      </div>
    </div>
  );
}
