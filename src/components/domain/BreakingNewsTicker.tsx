import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { loadNews } from '@/data/services';
import type { NewsItem } from '@/data/types';
import { cn } from '@/lib/utils';
import { formatRelative } from '@/lib/date';

interface BreakingNewsTickerProps {
  /** Bir haberin "son dakika" sayılması için minimum önem skoru (1-10). */
  minImportance?: number;
  /** Bir haberin "son dakika" sayılması için maksimum yaş (saat). */
  maxAgeHours?: number;
  /** Yedek olarak gösterilecek hazır haberler (örn. PanelPage'in mevcut listesi). */
  fallback?: NewsItem[];
  /** Yatay kayma hızı (saniye / tek tur). */
  speed?: number;
  /** Veri yenileme periyodu (ms). */
  refreshMs?: number;
}

const DEFAULT_REFRESH_MS = 60_000;

/**
 * Tek satırda yatay olarak akan "SON DAKİKA" haber bandı.
 * Yüksek önem skoruna sahip ve son saatlerde yayımlanmış canlı haberleri filtreler.
 * Hiç eşleşme yoksa hiçbir şey render etmez (sessiz).
 */
export function BreakingNewsTicker({
  minImportance = 7,
  maxAgeHours = 24,
  fallback,
  speed = 60,
  refreshMs = DEFAULT_REFRESH_MS,
}: BreakingNewsTickerProps) {
  const [news, setNews] = useState<NewsItem[]>(fallback ?? []);

  useEffect(() => {
    let cancelled = false;
    const fetchIt = () => {
      loadNews({ max: 30 }).then((r) => {
        if (cancelled) return;
        // Canlı veya karma kaynaktan gelen veriyi tercih et — yoksa fallback (mock) zaten ekrandadır.
        if (r.data.length > 0) {
          setNews(r.data);
        }
      }).catch(() => { /* ignore */ });
    };
    fetchIt();
    const id = setInterval(fetchIt, refreshMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [refreshMs]);

  const breaking = useMemo(() => {
    const now = Date.now();
    const maxAgeMs = maxAgeHours * 3_600_000;
    return news
      .filter((n) => {
        if (n.importance < minImportance) return false;
        const t = Date.parse(n.publishedAt);
        if (Number.isNaN(t)) return true; // tarih parse edilemiyorsa ele
        return now - t <= maxAgeMs;
      })
      .sort((a, b) => {
        // Önem skoru yüksekten düşüğe, eş skorda en taze önce
        if (b.importance !== a.importance) return b.importance - a.importance;
        return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
      })
      .slice(0, 12);
  }, [news, minImportance, maxAgeHours]);

  if (breaking.length === 0) return null;

  // Sonsuz akış için içeriği iki kez koy
  const repeated = [...breaking, ...breaking];

  return (
    <div className="relative overflow-hidden rounded-lg border border-danger/40 bg-gradient-to-r from-danger/15 via-danger/5 to-danger/15">
      {/* Sol "SON DAKİKA" etiketi — sabit, akıştan etkilenmez */}
      <div className="absolute inset-y-0 left-0 z-20 flex items-center gap-1.5 bg-danger px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-white shadow-md">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/80 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
        </span>
        <AlertTriangle size={12} />
        <span className="hidden sm:inline">Son Dakika</span>
      </div>

      {/* Sağ ve sol soldaki etikete denk gelen fade maskeleri */}
      <div className="pointer-events-none absolute inset-y-0 left-[120px] z-10 w-8 bg-gradient-to-r from-danger/15 to-transparent sm:left-[136px]" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-danger/15 to-transparent" />

      {/* Akan içerik */}
      <div
        className="ticker-track flex items-center gap-8 py-1.5 pl-[132px] sm:pl-[148px]"
        style={{ animationDuration: `${speed}s` }}
      >
        {repeated.map((n, i) => {
          const importanceTone =
            n.importance >= 9 ? 'text-danger' :
            n.importance >= 8 ? 'text-warning' :
            'text-slate-200';
          const content = (
            <span
              key={`${n.id}-${i}`}
              className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-xs"
            >
              <span className={cn('font-mono text-[10px] font-bold tracking-wider', importanceTone)}>
                ●{n.importance}
              </span>
              <span className="rounded border border-slate-500/30 bg-bg-card/60 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-slate-300">
                {n.source}
              </span>
              {n.symbols.slice(0, 2).map((s) => (
                <span key={s} className="rounded bg-accent/15 px-1.5 py-0.5 text-[9px] font-mono font-semibold text-accent">
                  {s}
                </span>
              ))}
              <span className="font-medium text-slate-100">{n.title}</span>
              <span className="text-[10px] text-slate-400">· {formatRelative(n.publishedAt)}</span>
              <span className="text-slate-600">|</span>
            </span>
          );
          return n.url ? (
            <a
              key={`${n.id}-${i}`}
              href={n.url}
              target="_blank"
              rel="noreferrer"
              className="group transition-colors hover:text-accent"
            >
              {content}
            </a>
          ) : (
            content
          );
        })}
      </div>
    </div>
  );
}
