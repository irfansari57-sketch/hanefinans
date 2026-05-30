import { useState } from 'react';
import { Bell } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { alertsRepo } from '@/data/repositories';
import { createAlert } from '@/data/api/alertsClient';
import { useAuth } from '@/store/auth';
import { toast } from '@/components/ui/Toast';
import type { Stock } from '@/data/types';

interface AlertButtonProps {
  stock?: Stock;
  /** Fund modu: bu prop'la AlertButton fonlar için de kullanılabilir */
  fund?: { code: string; name?: string; nav: number };
  size?: number;
}

export function AlertButton({ stock, fund, size = 13 }: AlertButtonProps) {
  const user = useAuth((s) => s.user);
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<'above' | 'below'>('above');
  const [threshold, setThreshold] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFund = !!fund;
  const symbol = stock?.symbol ?? fund?.code ?? '';
  const currentPrice = stock?.price ?? fund?.nav ?? 0;
  const priceDecimals = isFund ? 4 : 2;

  const save = async () => {
    const v = parseFloat(threshold.replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) return;
    setSaving(true);
    setError(null);
    try {
      // Server-side D1 alarm (push tabanlı)
      if (user) {
        const r = await createAlert({
          symbol,
          assetType: isFund ? 'fund' : 'stock',
          direction,
          threshold: v,
          note: note.trim() || undefined,
        });
        if (!r.ok) {
          setError(r.error ?? 'Kayıt başarısız');
          return;
        }
        toast.success('Alarm kuruldu', 'Tetiklenince push bildirim alacaksın.');
      } else {
        // Anonim kullanıcı — sadece local IndexedDB (legacy fallback)
        await alertsRepo.add({
          symbol,
          assetType: isFund ? 'fund' : 'stock',
          direction,
          threshold: v,
          note: note.trim() || undefined,
        });
        toast.info('Alarm yerel kaydedildi', 'Push bildirim için giriş yap.');
      }
      setThreshold('');
      setNote('');
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  if (!symbol || currentPrice <= 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setThreshold(currentPrice.toFixed(priceDecimals));
          setOpen(true);
        }}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-slate-400 transition hover:bg-bg-card hover:text-slate-200"
        title={isFund ? 'Fon NAV alarmı kur' : 'Alarm kur'}
      >
        <Bell size={size} />
        <span className="hidden sm:inline">Alarm</span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={`${isFund ? 'Fon NAV alarmı' : 'Alarm kur'} — ${symbol}`} size="sm">
        <div className="space-y-3">
          <div className="text-xs text-slate-500">
            Şu anki {isFund ? 'NAV' : 'fiyat'}: <span className="text-slate-200">{currentPrice.toFixed(priceDecimals)} ₺</span>
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
        {error && (
          <p className="mt-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            ⚠ {error}
          </p>
        )}
        <p className="mt-3 text-xs text-slate-500">
          {user
            ? 'Alarm tetiklendiğinde push bildirim alacaksın. Server-side cron her 5 dk kontrol eder.'
            : 'Push bildirim için giriş yap. Anonim modda alarm yerel cihazda kalır (sekme açıkken çalışır).'}
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
