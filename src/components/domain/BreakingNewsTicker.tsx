import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
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
  /**
   * Yatay kayma hızı — px/saniye cinsinden. Eskiden "tek tur saniye" idi;
   * JS-kontrollü scroll'a geçtikten sonra net "saniyede kaç px" ile ifade ediyoruz.
   * 30 px/sn iyi okuma hızı.
   */
  speed?: number;
  /** Veri yenileme periyodu (ms). */
  refreshMs?: number;
}

const DEFAULT_REFRESH_MS = 60_000;
const SCROLL_TICK_MS = 30; // her tick'te scrollLeft'i guncelle
const ITEM_STEP_PX = 320;  // prev/next adim mesafesi (yaklasik 1 haber genisligi)

/**
 * Tek satırda yatay olarak akan "SON DAKİKA" haber bandı.
 * JS-kontrollu scroll: hover'da durur, kullanici Pause/Prev/Next butonlariyla
 * manuel kontrol edebilir. Sonuna gelince basa doner (sonsuz akis).
 *
 * Yüksek önem skoruna sahip ve son saatlerde yayımlanmış canlı haberleri filtreler.
 * Hiç eşleşme yoksa hiçbir şey render etmez (sessiz).
 */
export function BreakingNewsTicker({
  minImportance = 7,
  maxAgeHours = 24,
  fallback,
  speed = 30,
  refreshMs = DEFAULT_REFRESH_MS,
}: BreakingNewsTickerProps) {
  const [news, setNews] = useState<NewsItem[]>(fallback ?? []);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // --- Canli haber fetch ---
  useEffect(() => {
    let cancelled = false;
    const fetchIt = () => {
      loadNews({ max: 30 }).then((r) => {
        if (cancelled) return;
        if (r.data.length > 0) {
          setNews(r.data);
        }
      }).catch(() => { /* ignore */ });
    };
    fetchIt();
    const id = setInterval(fetchIt, refreshMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [refreshMs]);

  // --- Filtreleme + siralama ---
  const breaking = useMemo(() => {
    const now = Date.now();
    const maxAgeMs = maxAgeHours * 3_600_000;
    return news
      .filter((n) => {
        if (n.importance < minImportance) return false;
        const t = Date.parse(n.publishedAt);
        if (Number.isNaN(t)) return true;
        return now - t <= maxAgeMs;
      })
      .sort((a, b) => {
        if (b.importance !== a.importance) return b.importance - a.importance;
        return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
      })
      .slice(0, 12);
  }, [news, minImportance, maxAgeHours]);

  // --- Auto-scroll engine: hover'da veya pause'da durur, sonsuza dek akar ---
  useEffect(() => {
    if (paused || hovered) return;
    if (breaking.length === 0) return;
    const el = scrollRef.current;
    if (!el) return;
    const pxPerTick = (speed * SCROLL_TICK_MS) / 1000;
    const id = setInterval(() => {
      // Yariya gelince basa atla — icerigi 2 kere koydugumuz icin gorunmez
      const half = el.scrollWidth / 2;
      if (el.scrollLeft >= half) {
        el.scrollLeft = el.scrollLeft - half;
      }
      el.scrollLeft += pxPerTick;
    }, SCROLL_TICK_MS);
    return () => clearInterval(id);
  }, [paused, hovered, breaking.length, speed]);

  const handlePrev = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: -ITEM_STEP_PX, behavior: 'smooth' });
  };

  const handleNext = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: ITEM_STEP_PX, behavior: 'smooth' });
  };

  const togglePause = () => setPaused((p) => !p);

  if (breaking.length === 0) return null;

  // Sonsuz akis icin icerigi iki kez koy
  const repeated = [...breaking, ...breaking];

  return (
    <div
      className="relative overflow-hidden rounded-lg border border-danger/40 bg-gradient-to-r from-danger/15 via-danger/5 to-danger/15"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Sol "SON DAKİKA" etiketi — sabit */}
      <div className="absolute inset-y-0 left-0 z-20 flex items-center gap-1.5 bg-danger px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-white shadow-md">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/80 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
        </span>
        <AlertTriangle size={12} />
        <span className="hidden sm:inline">Son Dakika</span>
      </div>

      {/* Sag taraf kontrol butonlari + fade mask */}
      <div className="absolute inset-y-0 right-0 z-20 flex items-center gap-0.5 bg-gradient-to-l from-danger/25 via-danger/15 to-transparent pl-6 pr-1.5">
        <button
          type="button"
          onClick={handlePrev}
          className="grid h-6 w-6 place-items-center rounded text-white/80 transition hover:bg-white/15 hover:text-white"
          aria-label="Onceki haber"
          title="Onceki"
        >
          <ChevronLeft size={14} />
        </button>
        <button
          type="button"
          onClick={togglePause}
          className="grid h-6 w-6 place-items-center rounded text-white/80 transition hover:bg-white/15 hover:text-white"
          aria-label={paused ? 'Devam' : 'Durdur'}
          title={paused ? 'Devam' : 'Durdur'}
        >
          {paused ? <Play size={12} /> : <Pause size={12} />}
        </button>
        <button
          type="button"
          onClick={handleNext}
          className="grid h-6 w-6 place-items-center rounded text-white/80 transition hover:bg-white/15 hover:text-white"
          aria-label="Sonraki haber"
          title="Sonraki"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Sol fade — etiketten icerige gecisi yumusatir */}
      <div className="pointer-events-none absolute inset-y-0 left-[120px] z-10 w-8 bg-gradient-to-r from-danger/15 to-transparent sm:left-[136px]" />

      {/* Akan icerik — JS scroll, scrollbar gizli */}
      <div
        ref={scrollRef}
        className="ticker-scroll flex items-center gap-8 overflow-x-hidden py-1.5 pl-[132px] pr-24 sm:pl-[148px]"
      >
        {repeated.map((n, i) => {
          const importanceTone =
            n.importance >= 9 ? 'text-danger' :
            n.importance >= 8 ? 'text-warning' :
            'text-slate-200';
          const content = (
            <span
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
              className="group shrink-0 transition-colors hover:text-accent"
            >
              {content}
            </a>
          ) : (
            <span key={`${n.id}-${i}`} className="shrink-0">{content}</span>
          );
        })}
      </div>
    </div>
  );
}
