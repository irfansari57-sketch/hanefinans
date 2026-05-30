import { useState } from 'react';
import { Bell, Crown, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { createAlert } from '@/data/api/alertsClient';
import { useAuth } from '@/store/auth';
import { toast } from '@/components/ui/Toast';
import type { Stock } from '@/data/types';

type GenericAssetType = 'stock' | 'fund' | 'crypto' | 'fx' | 'commodity';

interface GenericAsset {
  symbol: string;
  name?: string;
  price: number;
  assetType: GenericAssetType;
  /** TL, $, $ /ons gibi para birimi gösterimi */
  unit?: string;
  /** Ondalık hassasiyet — kripto 4, hisse 2 */
  decimals?: number;
}

interface AlertButtonProps {
  stock?: Stock;
  /** Fund modu: bu prop'la AlertButton fonlar için de kullanılabilir */
  fund?: { code: string; name?: string; nav: number };
  /** Generic: crypto/fx/commodity/emtia gibi her enstrüman için */
  asset?: GenericAsset;
  size?: number;
  /** Görsel variant — inline (text + ikon) veya icon-only (kompakt) */
  variant?: 'inline' | 'icon';
}

export function AlertButton({ stock, fund, asset, size = 13, variant = 'inline' }: AlertButtonProps) {
  const user = useAuth((s) => s.user);
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<'above' | 'below'>('above');
  const [threshold, setThreshold] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hangi assetType — generic asset > fund > stock öncelik sırası
  const assetType: GenericAssetType = asset?.assetType
    ?? (fund ? 'fund' : 'stock');
  const isFund = assetType === 'fund';
  const symbol = asset?.symbol ?? stock?.symbol ?? fund?.code ?? '';
  const currentPrice = asset?.price ?? stock?.price ?? fund?.nav ?? 0;
  const unitLabel = asset?.unit ?? (assetType === 'crypto' || assetType === 'fx' ? '$' : '₺');
  const priceDecimals = asset?.decimals
    ?? (isFund ? 4 : assetType === 'crypto' && currentPrice < 10 ? 4 : 2);

  const save = async () => {
    const v = parseFloat(threshold.replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) return;
    setSaving(true);
    setError(null);
    try {
      // Anonim → endpoint çağrılmaz, modal upgrade prompt'u zaten gösterir
      if (!user) {
        setError('Alarm kurmak için üye olmalısın.');
        return;
      }
      const r = await createAlert({
        symbol,
        // commodity → stock olarak kaydet (sembol XAUUSD=X gibi, yahoo proxy üzerinden)
        assetType: assetType === 'commodity' ? 'stock' : assetType,
        direction,
        threshold: v,
        note: note.trim() || undefined,
      });
      if (!r.ok) {
        setError(r.error ?? 'Kayıt başarısız');
        return;
      }
      toast.success('Alarm kuruldu', 'Tetiklenince push bildirim alacaksın.');
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
        className={
          variant === 'icon'
            ? 'inline-flex items-center justify-center rounded-md border border-border bg-bg-card p-1.5 text-slate-400 transition hover:border-accent/40 hover:text-accent'
            : 'inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-slate-400 transition hover:bg-bg-card hover:text-slate-200'
        }
        title={isFund ? 'Fon NAV alarmı kur' : `${symbol} için alarm kur`}
        aria-label={`${symbol} için alarm kur`}
      >
        <Bell size={size} />
        {variant === 'inline' && <span className="hidden sm:inline">Alarm</span>}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={`${isFund ? 'Fon NAV alarmı' : 'Alarm kur'} — ${symbol}`} size="sm">
        <div className="space-y-3">
          <div className="text-xs text-slate-500">
            Şu anki {isFund ? 'NAV' : 'fiyat'}: <span className="text-slate-200">{currentPrice.toFixed(priceDecimals)} {unitLabel}</span>
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
          <Field label={`Eşik (${unitLabel})`}>
            <input
              type="number"
              inputMode="decimal"
              step={priceDecimals === 4 ? '0.0001' : '0.01'}
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

        {!user ? (
          <div className="mt-3 rounded-lg border border-warning/30 bg-warning/5 p-3">
            <div className="flex items-start gap-2.5">
              <Crown size={16} className="mt-0.5 shrink-0 text-warning" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-slate-100">Alarm için üye ol</p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  Ücretsiz üyelikle <strong className="text-warning">5 alarm</strong> kurabilir,
                  push bildirim ile fiyat hareketinden anında haberdar olursun.
                </p>
                <Link
                  to="/uyelik"
                  className="btn-primary mt-2.5 inline-flex text-xs"
                  onClick={() => setOpen(false)}
                >
                  Ücretsiz üye ol <ChevronRight size={12} />
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-xs text-slate-500">
            Alarm tetiklendiğinde push bildirim alacaksın. Server-side cron her 5 dk kontrol eder.
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setOpen(false)}>
            {user ? 'İptal' : 'Kapat'}
          </button>
          {user && (
            <button
              className="btn-primary"
              onClick={save}
              disabled={saving || !threshold.trim()}
            >
              {saving ? 'Kaydediliyor…' : 'Alarm kur'}
            </button>
              )}
        </div>
      </Modal>
    </>
  );
}
