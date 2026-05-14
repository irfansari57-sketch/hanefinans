import { useState } from 'react';
import { Bell } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { alertsRepo } from '@/data/repositories';
import type { Stock } from '@/data/types';

interface AlertButtonProps {
  stock: Stock;
  size?: number;
}

export function AlertButton({ stock, size = 13 }: AlertButtonProps) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<'above' | 'below'>('above');
  const [threshold, setThreshold] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const v = parseFloat(threshold.replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) return;
    setSaving(true);
    try {
      await alertsRepo.add({ symbol: stock.symbol, direction, threshold: v, note: note.trim() || undefined });
      setThreshold('');
      setNote('');
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setThreshold(stock.price.toFixed(2));
          setOpen(true);
        }}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-slate-400 transition hover:bg-bg-card hover:text-slate-200"
        title="Alarm kur"
      >
        <Bell size={size} />
        <span className="hidden sm:inline">Alarm</span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={`Alarm kur — ${stock.symbol}`} size="sm">
        <div className="space-y-3">
          <div className="text-xs text-slate-500">
            Şu anki fiyat: <span className="text-slate-200">{stock.price.toFixed(2)} ₺</span>
          </div>
          <Field label="Yön">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDirection('above')}
                className={direction === 'above' ? 'btn-primary' : 'btn-secondary'}
              >
                ≥ Yukarı
              </button>
              <button
                type="button"
                onClick={() => setDirection('below')}
                className={direction === 'below' ? 'btn-primary' : 'btn-secondary'}
              >
                ≤ Aşağı
              </button>
            </div>
          </Field>
          <Field label="Eşik (₺)">
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              className="input"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Not (opsiyonel)">
            <input
              className="input"
              placeholder="ör. teknik destek seviyesi"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Alarmlar şu an yalnızca kayıt edilir; canlı fiyat akışı bağlandığında (Hafta 2) otomatik tetiklenecektir.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setOpen(false)}>
            İptal
          </button>
          <button
            className="btn-primary"
            onClick={save}
            disabled={saving || !threshold.trim()}
          >
            Alarm kur
          </button>
        </div>
      </Modal>
    </>
  );
}
