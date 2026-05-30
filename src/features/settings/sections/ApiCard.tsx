import { Check, X, ExternalLink } from 'lucide-react';
import type { ApiKeyStatus } from '@/data/api/keys';

/** Tek bir API anahtarı durumu — Admin > API Bağlantıları grid'inde kullanılır. */
export function ApiCard({ s }: { s: ApiKeyStatus }) {
  return (
    <div className="rounded-lg border border-border bg-bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-100">{s.label}</span>
        {s.configured ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-success">
            <Check size={10} /> bağlı
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-danger/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-danger">
            <X size={10} /> yok
          </span>
        )}
      </div>
      <div className="mt-1 text-xs text-slate-500">{s.provides}</div>
      <div className="mt-2 flex items-center justify-between text-[11px]">
        <code className="truncate font-mono text-slate-400">{s.envVar}</code>
        <a
          href={s.signUpUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-accent hover:underline"
        >
          kayıt <ExternalLink size={10} />
        </a>
      </div>
      <div className="mt-1 text-[11px] text-slate-500">Ücretsiz: {s.freeTier}</div>
      {s.note && <div className="mt-1 rounded bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning">{s.note}</div>}
    </div>
  );
}

/** Küçük sayı + label gösterici — Veritabanı stats grid'inde kullanılır. */
export function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-bg-card p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold text-slate-100">{value}</div>
    </div>
  );
}
