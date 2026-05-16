import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Wallet, Plus, Trash2, RefreshCw, TrendingUp, TrendingDown, ChevronRight, Search,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { LiveBadge } from '@/components/domain/LiveBadge';
import { toast } from '@/components/ui/Toast';
import { db, type PortfolioPosition } from '@/data/db';
import { loadStocks } from '@/data/services';
import { MOCK_STOCKS } from '@/data/mock';
import type { Stock } from '@/data/types';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

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
  const positions = useLiveQuery(() => db.portfolio.toArray(), []) ?? [];
  const [stockMap, setStockMap] = useState<Map<string, Stock>>(new Map());
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | undefined>();
  const [addOpen, setAddOpen] = useState(false);
  const [toDelete, setToDelete] = useState<PortfolioPosition | null>(null);

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
      <PageHeader
        title="Portföyüm"
        subtitle="Pozisyonlarını ekle, canlı kâr/zarar takibi yap. Veriler tarayıcına kaydedilir."
        actions={
          <div className="flex items-center gap-2">
            <LiveBadge updatedAt={updatedAt} refreshing={loading} />
            <button className="btn-secondary" onClick={refresh} disabled={loading || positions.length === 0}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Yenile
            </button>
            <button className="btn-primary" onClick={() => setAddOpen(true)}>
              <Plus size={14} /> Pozisyon Ekle
            </button>
          </div>
        }
      />

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
                      <button
                        onClick={() => setToDelete(r)}
                        className="rounded p-1 text-danger/70 hover:bg-danger/10 hover:text-danger"
                        title="Sil"
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Pozisyon Ekle" size="md">
        <AddPositionForm onClose={() => setAddOpen(false)} />
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
            await db.portfolio.delete(toDelete.id);
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

function AddPositionForm({ onClose }: { onClose: () => void }) {
  const [symbol, setSymbol] = useState('');
  const [lot, setLot] = useState('');
  const [avgPrice, setAvgPrice] = useState('');
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
      await db.portfolio.add({
        symbol: sym,
        lot: lotNum,
        avgPrice: priceNum,
        addedAt: Date.now(),
        note: note.trim() || undefined,
      });
      toast.success(`${sym} eklendi`, `${lotNum} lot @ ${priceNum}₺`);
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
            <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-border bg-bg-card shadow-xl max-h-48 overflow-y-auto">
              {suggestions.map((s) => (
                <button
                  key={s.symbol}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); setSymbol(s.symbol); }}
                  className="flex w-full items-center justify-between px-3 py-2 text-xs hover:bg-bg-soft"
                >
                  <span className="font-mono font-semibold text-accent">{s.symbol}</span>
                  <span className="text-slate-400 text-[11px]">{s.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Lot Adedi">
          <input
            className="input"
            type="number"
            placeholder="100"
            value={lot}
            onChange={(e) => setLot(e.target.value)}
            min="0"
            step="any"
          />
        </Field>
        <Field label="Ortalama Maliyet (₺)">
          <input
            className="input"
            type="number"
            placeholder="285.50"
            value={avgPrice}
            onChange={(e) => setAvgPrice(e.target.value)}
            min="0"
            step="any"
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
          {saving ? 'Kaydediliyor…' : 'Ekle'}
        </button>
      </div>
    </div>
  );
}
