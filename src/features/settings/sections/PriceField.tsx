import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';

/** TR yerel formatı (bin ayracı + ondalık virgül). */
function formatTR(v: number): string {
  if (!Number.isFinite(v)) return '';
  return v.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
}
function parseTR(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const v = parseFloat(cleaned);
  return Number.isFinite(v) ? v : null;
}

/** Tek bir fiyat input alanı — Admin > Üyelik Ücretleri grid'inde kullanılır. */
export function PriceField({
  label,
  value,
  icon: Icon,
  onChange,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  onChange: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const displayValue = editing ? draft : formatTR(value);
  return (
    <label className="block">
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-400">
        <Icon size={10} /> {label}
      </span>
      <div className="mt-1 flex items-center gap-1.5 rounded-lg border border-border bg-bg-card px-2.5 py-1.5">
        <span className="text-sm text-slate-400">₺</span>
        <input
          type="text"
          inputMode="decimal"
          value={displayValue}
          onFocus={(e) => {
            setEditing(true);
            setDraft(value.toString().replace('.', ','));
            requestAnimationFrame(() => e.target.select());
          }}
          onChange={(e) => {
            const raw = e.target.value;
            setDraft(raw);
            const parsed = parseTR(raw);
            if (parsed != null) onChange(Math.max(0, parsed));
          }}
          onBlur={() => {
            setEditing(false);
            setDraft('');
          }}
          className="w-full bg-transparent text-sm font-bold tabular-nums text-slate-100 focus:outline-none"
        />
      </div>
    </label>
  );
}
