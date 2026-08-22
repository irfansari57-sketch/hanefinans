/**
 * TRTextNumberInput — string state ile calisan TR formatli input adapter.
 * Form validation string bekleyen ust component'ler icin (PortfolioPage vs.)
 * Tam sayi/ondalik farketmez — kullanici serbest yazar, blur'da formatlanir.
 */
export function TRTextNumberInput({
  value, onChange, className, placeholder, autoFocus, decimals,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  /** Ondalik hane sayisi (default: kullanicinin girdigini koru). */
  decimals?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(value);

  // value degistiginde (dis dunya set etti) editing'de degilse guncel'i yansit
  const parsed = value === '' ? null : parseTRNumber(value);
  const formatted =
    parsed != null && Number.isFinite(parsed)
      ? parsed.toLocaleString('tr-TR', {
          minimumFractionDigits: decimals ?? 0,
          maximumFractionDigits: decimals ?? 10,
        })
      : value;
  const displayValue = editing ? draft : formatted;

  return (
    <input
      type="text"
      inputMode="decimal"
      className={className}
      placeholder={placeholder}
      autoFocus={autoFocus}
      value={displayValue}
      onFocus={(e) => {
        setEditing(true);
        // Raw'a cevir (nokta -> nothing, virgul -> nokta)
        setDraft(value.replace(/\./g, '').replace(',', '.'));
        requestAnimationFrame(() => e.target.select());
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        // Kullaniciya "yaziyor" hissi ver — parent'a raw'i gonder
        const p = parseTRNumber(raw);
        if (p != null) {
          onChange(String(p));
        } else if (raw === '') {
          onChange('');
        }
      }}
      onBlur={() => {
        setEditing(false);
        setDraft('');
      }}
    />
  );
}

/**
 * NumberField — TR yerelinde bin ayracı + ondalık virgül ile sayı girişi.
 *
 * Ekranda: 1.234.567,89 (nokta bin, virgül ondalık).
 * Focus'ta: raw düzenleme + tüm içeriği otomatik seç.
 * Blur'da: format geri uygulanır.
 *
 * Kullanım:
 *   <NumberField label="Tutar" value={amount} onChange={setAmount} suffix="TL" min={0} max={1e9} step={1000} />
 *   <NumberField label="Oran"  value={rate}   onChange={setRate}   suffix="%"  min={0} max={100}  step={0.5} decimals={2} />
 */
import { useState, useId } from 'react';
import { cn } from '@/lib/utils';

/** Sayıyı TR yerelinde formatla (bin ayracı + ondalık virgül). */
export function formatDisplayTR(value: number, decimals: number = 0): string {
  if (!Number.isFinite(value)) return '';
  return value.toLocaleString('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** TR format string → number: nokta bin ayracı, virgül ondalık ayracı. */
export function parseTRNumber(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const v = parseFloat(cleaned);
  return Number.isFinite(v) ? v : null;
}

export interface NumberFieldProps {
  label?: string;
  suffix?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  hint?: string;
  className?: string;
  /** Küçük varyant — kompakt kartlar için. */
  small?: boolean;
  /** +/- butonlarını gizle (uzun form input'ları için). */
  hideSteppers?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

/** Reusable TR-formatlı sayı giriş kutusu. Focus'ta select-all, blur'da re-format. */
export function NumberField({
  label,
  suffix,
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  decimals = 0,
  hint,
  className,
  small = false,
  hideSteppers = false,
  disabled = false,
  placeholder,
}: NumberFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>('');
  const inputId = useId();
  const displayValue = editing ? draft : formatDisplayTR(value, decimals);

  const clamp = (v: number) => Math.max(min, Math.min(max, v));

  return (
    <div className={className}>
      {(label || hint) && (
        <div className="mb-1 flex items-baseline justify-between">
          {label && (
            <label htmlFor={inputId} className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
              {label}
            </label>
          )}
          {hint && <span className="text-[10px] text-slate-600">{hint}</span>}
        </div>
      )}
      <div className={cn('flex overflow-hidden rounded-lg border border-slate-700/50 bg-bg-card', disabled && 'opacity-60')}>
        {!hideSteppers && (
          <button
            type="button"
            onClick={() => onChange(clamp(value - step))}
            disabled={disabled}
            className={cn(
              'border-r border-slate-700/50 text-slate-400 hover:bg-slate-800/50',
              small ? 'px-1.5 text-xs' : 'px-2',
            )}
            aria-label={label ? `${label} azalt` : 'azalt'}
          >−</button>
        )}
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          value={displayValue}
          disabled={disabled}
          placeholder={placeholder}
          onFocus={(e) => {
            setEditing(true);
            setDraft(value.toString().replace('.', ','));
            requestAnimationFrame(() => e.target.select());
          }}
          onChange={(e) => {
            const raw = e.target.value;
            setDraft(raw);
            const parsed = parseTRNumber(raw);
            if (parsed != null) onChange(clamp(parsed));
          }}
          onBlur={() => {
            setEditing(false);
            setDraft('');
          }}
          className={cn(
            'min-w-0 flex-1 bg-transparent text-center tabular-nums text-slate-100 focus:outline-none',
            small ? 'px-1.5 py-1 text-xs' : 'px-2 py-1.5 text-sm',
          )}
        />
        {suffix && (
          <span
            className={cn(
              'border-l border-slate-700/50 bg-slate-900/50 text-[11px] text-slate-500',
              small ? 'px-1.5 py-1' : 'px-2 py-1.5',
            )}
          >
            {suffix}
          </span>
        )}
        {!hideSteppers && (
          <button
            type="button"
            onClick={() => onChange(clamp(value + step))}
            disabled={disabled}
            className={cn(
              'border-l border-slate-700/50 text-slate-400 hover:bg-slate-800/50',
              small ? 'px-1.5 text-xs' : 'px-2',
            )}
            aria-label={label ? `${label} arttır` : 'arttır'}
          >+</button>
        )}
      </div>
    </div>
  );
}
