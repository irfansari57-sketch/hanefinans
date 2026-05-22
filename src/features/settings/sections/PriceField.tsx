import type { LucideIcon } from 'lucide-react';

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
  return (
    <label className="block">
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-400">
        <Icon size={10} /> {label}
      </span>
      <div className="mt-1 flex items-center gap-1.5 rounded-lg border border-border bg-bg-card px-2.5 py-1.5">
        <span className="text-sm text-slate-400">₺</span>
        <input
          type="number"
          min={0}
          step={10}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-full bg-transparent text-sm font-bold tabular-nums text-slate-100 focus:outline-none"
        />
      </div>
    </label>
  );
}
