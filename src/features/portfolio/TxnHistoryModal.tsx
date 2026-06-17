/**
 * Portfoyum -> Bir pozisyonun islem gecmisi modali.
 * Hem hisse hem fon icin ortak kullanim.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { Trash2, Calendar, History } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/components/ui/Toast';
import { db, type PortfolioPosition, type PortfolioTxn } from '@/data/db';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

interface Props {
  position: PortfolioPosition | null;
  onClose: () => void;
}

function fmtDate(ms: number): string {
  const d = new Date(ms);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}.${d.getFullYear()}`;
}

export function TxnHistoryModal({ position, onClose }: Props) {
  // positionId varsa ona gore, yoksa symbol+kind ile filtre
  const txns = useLiveQuery(async () => {
    if (!position) return [] as PortfolioTxn[];
    const all = await db.portfolioTxns
      .filter((t) => {
        if (position.id && t.positionId === position.id) return true;
        // Fallback: ayni sembol + kind (eski kayitlar icin)
        return t.symbol === position.symbol && (t.kind ?? 'stock') === (position.kind ?? 'stock');
      })
      .toArray();
    // En yeni en ustte
    return all.sort((a, b) => b.executedAt - a.executedAt);
  }, [position?.id, position?.symbol, position?.kind]) ?? [];

  const isFund = position?.kind === 'fund';
  const unitLabel = isFund ? 'Adet' : 'Lot';
  const priceLabel = isFund ? 'NAV' : 'Fiyat';

  // Toplamlar
  const totals = txns.reduce(
    (acc, t) => {
      acc.lot += t.lot;
      acc.cost += t.lot * t.price;
      return acc;
    },
    { lot: 0, cost: 0 },
  );
  const weightedAvg = totals.lot > 0 ? totals.cost / totals.lot : 0;

  const handleDelete = async (txn: PortfolioTxn) => {
    if (!txn.id) return;
    if (!confirm(`${fmtDate(txn.executedAt)} tarihindeki ${txn.lot} ${unitLabel.toLowerCase()} islemi silinsin mi?`)) return;
    await db.portfolioTxns.delete(txn.id);
    toast.success('Islem silindi', 'Toplam pozisyonu manuel duzenlemen gerekebilir.');
  };

  return (
    <Modal open={!!position} onClose={onClose} title={`${position?.symbol ?? ''} - Islem Gecmisi`} size="lg">
      {position && (
        <div className="space-y-3">
          {/* Ozet kart */}
          <div className="rounded-lg border border-accent/30 bg-accent/5 p-3 text-xs text-slate-300">
            <div className="flex items-center gap-2 flex-wrap">
              <strong className="text-accent">{position.symbol}</strong>
              <span className="text-slate-500">·</span>
              <span>{txns.length} islem</span>
              <span className="text-slate-500">·</span>
              <span>Toplam {totals.lot.toLocaleString('tr-TR')} {unitLabel.toLowerCase()}</span>
              <span className="text-slate-500">·</span>
              <span>Ort. {priceLabel} {weightedAvg.toFixed(isFund ? 4 : 2)}₺</span>
            </div>
          </div>

          {/* Islem tablosu */}
          {txns.length === 0 ? (
            <EmptyState
              icon={<History size={28} />}
              title="Henuz islem yok"
              description="Bu pozisyon icin kayitli alim/satim gecmisi bulunmuyor. Yeni alimlar otomatik kaydedilir."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="min-w-full text-xs">
                <thead className="bg-bg-card text-[10px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-3 py-2 text-left">
                      <Calendar size={11} className="inline mr-1 -mt-0.5" />
                      Tarih
                    </th>
                    <th className="px-3 py-2 text-right">{unitLabel}</th>
                    <th className="px-3 py-2 text-right">{priceLabel} (₺)</th>
                    <th className="px-3 py-2 text-right">Toplam Tutar</th>
                    <th className="px-3 py-2 text-left hidden md:table-cell">Not</th>
                    <th className="px-3 py-2 text-center w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {txns.map((t) => {
                    const total = t.lot * t.price;
                    const isBuy = t.lot >= 0;
                    return (
                      <tr key={t.id} className="hover:bg-bg-card/60">
                        <td className="px-3 py-2 text-slate-200 tabular-nums">{fmtDate(t.executedAt)}</td>
                        <td className={cn('px-3 py-2 text-right tabular-nums font-medium', isBuy ? 'text-success' : 'text-danger')}>
                          {isBuy ? '+' : ''}{t.lot.toLocaleString('tr-TR')}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-200">
                          {t.price.toFixed(isFund ? 4 : 2)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-100 font-medium">
                          {formatMoney(total)}
                        </td>
                        <td className="hidden md:table-cell px-3 py-2 text-[11px] text-slate-500 truncate max-w-[200px]">
                          {t.note ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            onClick={() => handleDelete(t)}
                            className="rounded p-1 text-danger/70 hover:bg-danger/10 hover:text-danger"
                            title="Islemi sil"
                          >
                            <Trash2 size={11} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-bg-card/40 text-[11px]">
                  <tr>
                    <td className="px-3 py-2 text-slate-400 uppercase tracking-wider text-[9px]">TOPLAM</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-100 font-bold">{totals.lot.toLocaleString('tr-TR')}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-400">{weightedAvg.toFixed(isFund ? 4 : 2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-100 font-bold">{formatMoney(totals.cost)}</td>
                    <td colSpan={2} className="hidden md:table-cell" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <p className="text-[10px] text-slate-500">
            Islem silmek pozisyonun toplam lot ve ortalama maliyet hesabini etkilemez.
            Pozisyon ozetini kalem ikonu ile manuel guncelleyebilirsin.
          </p>

          <div className="flex justify-end pt-2">
            <button className="btn-secondary" onClick={onClose}>Kapat</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
