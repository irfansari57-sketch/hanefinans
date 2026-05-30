import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Wallet, Plus, Trash2, RefreshCw, TrendingUp, TrendingDown, ChevronRight, Search, Sparkles, Upload, FileText,
} from 'lucide-react';
import { useAuth, isPro } from '@/store/auth';
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
import { SeoHead } from '@/components/seo/SeoHead';

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
  const [importOpen, setImportOpen] = useState(false);
  const [toDelete, setToDelete] = useState<PortfolioPosition | null>(null);

  // AI analysis
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const user = useAuth((s) => s.user);
  const proUser = isPro(user);

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
      <SeoHead title="Portföyüm" description="Portföy pozisyonlarınız, kar/zarar, dağılım ve performans." path="/portfoy" noindex />

      <PageHeader
        title="Portföyüm"
        subtitle="Pozisyonlarını ekle, canlı kâr/zarar takibi yap. Veriler tarayıcına kaydedilir."
        actions={
          <div className="flex items-center gap-2">
            <LiveBadge updatedAt={updatedAt} refreshing={loading} />
            <button className="btn-secondary" onClick={refresh} disabled={loading || positions.length === 0}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Yenile
            </button>
            <button className="btn-secondary" onClick={() => setImportOpen(true)}>
              <Upload size={14} /> CSV İçe Aktar
            </button>
            <button className="btn-primary" onClick={() => setAddOpen(true)}>
              <Plus size={14} /> Pozisyon Ekle
            </button>
          </div>
        }
      />

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
                title={!proUser && user ? 'PRO/ELITE üyelere özel' : 'Portföyünü AI ile analiz et'}
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
              🔒 PRO/ELITE üyelere özel. <Link to="/uyelik" className="underline">Yükselt →</Link>
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
