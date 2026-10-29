/**
 * DataFreshness — "Kaynak · HH:MM · ~15 dk gecikmeli" rozeti.
 *
 * 13 Eki 2026 veri-güven denetimi: fiyat kartlarında verinin kaynağı, ait olduğu
 * an ve tipik gecikmesi görünür olmalı. asOf yoksa "—" gösterir; asla "şimdi"
 * uydurmaz. 20 saatten eski veri (tatil/seans dışı değilse) amber uyarı alır.
 */

import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isBistOpen, isBistHoliday, isWeekend, lastBistSessionDate } from '@/lib/marketCalendar';

interface Props {
  /** Kaynağın kısa adı: 'Yahoo', 'FVT', 'İş Yatırım', 'TEFAS' */
  source?: string;
  /** Verinin ait olduğu an (ISO) */
  asOf?: string;
  /** Tipik gecikme, dakika */
  delayMin?: number;
  className?: string;
  /** Kompakt mod: sadece saat + gecikme */
  compact?: boolean;
  /** 29 Eki 2026: 'bist' → seans kapalı/tatilde "28 Eki kapanışı · Tatil" gösterir, "az önce" ve gecikme yazmaz */
  market?: 'bist';
}

const SOURCE_LABEL: Record<string, string> = {
  yahoo: 'Yahoo',
  isyatirim: 'İş Yatırım',
  fvt: 'FVT',
  tefas: 'TEFAS',
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Saat biliniyorsa "14:32"; sadece tarih varsa "13 Eki" (saat uydurma yok). */
function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  if (DATE_ONLY.test(iso)) {
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  }
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
}

function fmtAge(iso: string): { text: string; stale: boolean } {
  // Tarih-only değerde yaş hesabı saat uydurur — gösterme.
  if (DATE_ONLY.test(iso)) {
    const dayMs = Date.now() - new Date(`${iso}T15:00:00Z`).getTime(); // ~BIST kapanış 18:00 TR
    return { text: '', stale: dayMs > 36 * 3_600_000 };
  }
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return { text: '—', stale: false };
  const min = Math.round(ms / 60_000);
  if (min < 1) return { text: 'az önce', stale: false };
  if (min < 60) return { text: `${min} dk önce`, stale: false };
  const h = Math.round(min / 60);
  if (h < 24) return { text: `${h} sa önce`, stale: h >= 20 };
  const dd = Math.round(h / 24);
  return { text: `${dd} gün önce`, stale: true };
}

export function DataFreshness({ source, asOf, delayMin, className, compact, market }: Props) {
  const srcLabel = source ? (SOURCE_LABEL[source] ?? source) : undefined;
  if (market === 'bist' && !isBistOpen()) {
    const now = new Date();
    const why = isBistHoliday(now) ? 'Tatil' : isWeekend(now) ? 'Hafta sonu' : 'Seans kapalı';
    const last = lastBistSessionDate(now);
    const [y, m, d] = last.split('-').map(Number);
    const lbl = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    return (
      <span title={`${srcLabel ? `Kaynak: ${srcLabel} · ` : ''}Borsa İstanbul kapalı (${why}). Gösterilen değer ${lbl} kapanışıdır.`}
        className={cn('inline-flex items-center gap-1 rounded border border-border bg-bg-soft/60 px-1.5 py-0.5 text-[10px] tabular-nums text-slate-500', className)}>
        <Clock size={10} />
        {!compact && srcLabel && <><span>{srcLabel}</span><span className="text-slate-600">·</span></>}
        <span>{lbl} kapanışı</span>
        <span className="text-slate-600">·</span>
        <span>{why}</span>
      </span>
    );
  }
  const age = asOf ? fmtAge(asOf) : null;
  const title = [
    srcLabel ? `Kaynak: ${srcLabel}` : null,
    asOf ? `Veri anı: ${new Date(asOf).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}` : 'Veri anı bilinmiyor',
    delayMin != null ? (delayMin === 0 ? 'Gerçek zamanlıya yakın' : `Tipik gecikme ~${delayMin} dk`) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] tabular-nums',
        age?.stale
          ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
          : 'border-border bg-bg-soft/60 text-slate-500',
        className,
      )}
    >
      <Clock size={10} />
      {!compact && srcLabel && <span>{srcLabel}</span>}
      {!compact && srcLabel && <span className="text-slate-600">·</span>}
      <span>{asOf ? fmtTime(asOf) : '—'}</span>
      {age && age.text && <span className="text-slate-600">({age.text})</span>}
      {delayMin != null && delayMin > 0 && (
        <>
          <span className="text-slate-600">·</span>
          <span>~{delayMin} dk gecikmeli</span>
        </>
      )}
    </span>
  );
}
