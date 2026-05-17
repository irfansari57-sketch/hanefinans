import { useEffect, useState } from 'react';
import { ExternalLink, Youtube, MessageCircle, Globe, Mic, Play, Clock } from 'lucide-react';
import { ANALYSTS, analystYoutubeUrl, analystTwitterUrl, type Analyst } from '@/data/analysts';
import { formatRelative } from '@/lib/date';

/**
 * Aracı kurum & bağımsız analist yorumlarına hızlı erişim kartı.
 * Her analist için YouTube son video özetini de getirir (/api/youtube-feed).
 */

interface FeedVideo {
  id: string;
  title: string;
  published: string;
  thumbnail: string;
  url: string;
}

interface FeedResponse {
  ok: boolean;
  videos?: FeedVideo[];
  channelTitle?: string;
  error?: string;
}

const CACHE_KEY_PREFIX = 'fa.analyst.feed.';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 dk client cache

function readCachedFeed(handle: string): FeedVideo[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + handle);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { fetchedAt: number; videos: FeedVideo[] };
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed.videos;
  } catch {
    return null;
  }
}

function writeCachedFeed(handle: string, videos: FeedVideo[]) {
  try {
    localStorage.setItem(
      CACHE_KEY_PREFIX + handle,
      JSON.stringify({ fetchedAt: Date.now(), videos }),
    );
  } catch {
    /* ignore */
  }
}

export function AnalystCommentary() {
  return (
    <section className="glass-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent/15 text-accent">
          <Mic size={14} />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-slate-200">Piyasa Yorumcuları — Son Yorumlar</h2>
          <p className="text-[11px] text-slate-500">
            Aracı kurum analistleri + bağımsız stratejistlerin son YouTube videoları (otomatik 30 dk cache)
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ANALYSTS.map((a) => <AnalystCard key={a.id} a={a} />)}
      </div>

      <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
        ℹ️ Bu sayfada paylaşılan analistler bilgi amaçlıdır; herhangi bir aracı kurum veya kişi ile{' '}
        Hane Finans'ın resmi bir bağı yoktur. Yorumlar yatırım tavsiyesi değildir.
      </p>
    </section>
  );
}

function AnalystCard({ a }: { a: Analyst }) {
  const [videos, setVideos] = useState<FeedVideo[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const key = a.youtubeChannelId || a.youtubeHandle || '';
    if (!key) {
      setLoading(false);
      return;
    }

    // Önce cache
    const cached = readCachedFeed(key);
    if (cached) {
      setVideos(cached);
      setLoading(false);
      return;
    }

    // Pages Function — handle veya channelId
    const params = a.youtubeChannelId
      ? `?channelId=${encodeURIComponent(a.youtubeChannelId)}`
      : `?handle=${encodeURIComponent(a.youtubeHandle!)}`;
    fetch(`/api/youtube-feed${params}`)
      .then((r) => r.json() as Promise<FeedResponse>)
      .then((data) => {
        if (data.ok && data.videos && data.videos.length > 0) {
          setVideos(data.videos.slice(0, 3));
          writeCachedFeed(key, data.videos.slice(0, 3));
        } else {
          setError(true);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [a.youtubeChannelId, a.youtubeHandle]);

  const latestVideo = videos?.[0];

  return (
    <div className="flex flex-col rounded-lg border border-border bg-bg-card p-3 transition hover:border-accent/40">
      {/* Header — avatar + isim + rol */}
      <div className="flex items-start gap-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
          style={{ background: a.colorSeed }}
        >
          {a.initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-100">{a.name}</div>
          <div className="truncate text-[11px] text-slate-400">{a.affiliation}</div>
          <div className="mt-0.5 truncate text-[10px] text-slate-500">{a.role}</div>
        </div>
      </div>

      {/* Son video özeti */}
      <div className="mt-3 flex-1">
        {loading ? (
          <div className="rounded-md bg-bg-soft/50 px-2 py-3 text-[10px] text-slate-500 text-center">
            Son yorumlar yükleniyor…
          </div>
        ) : latestVideo ? (
          <a
            href={latestVideo.url}
            target="_blank"
            rel="noreferrer"
            className="group/v block rounded-md border border-border bg-bg-soft p-2 transition hover:border-danger/30 hover:bg-bg-soft/70"
          >
            <div className="flex gap-2">
              <div className="relative aspect-video w-20 shrink-0 overflow-hidden rounded">
                <img
                  src={latestVideo.thumbnail}
                  alt={latestVideo.title}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
                <span className="absolute inset-0 grid place-items-center bg-black/30 opacity-0 transition group-hover/v:opacity-100">
                  <Play size={16} className="fill-white text-white" />
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 text-[11px] font-medium leading-snug text-slate-200">
                  {latestVideo.title}
                </div>
                <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-500">
                  <Clock size={9} /> {formatRelative(latestVideo.published)}
                </div>
              </div>
            </div>
          </a>
        ) : error ? (
          <div className="rounded-md border border-warning/20 bg-warning/5 px-2 py-2 text-[10px] text-warning/80">
            ⚠️ Son videolar çekilemedi (handle güncellenebilir)
          </div>
        ) : (
          <div className="rounded-md bg-bg-soft/50 px-2 py-2 text-[10px] text-slate-500 text-center">
            YouTube kanalı yapılandırılmamış
          </div>
        )}

        {/* Daha fazla video (varsa) — küçük başlık listesi */}
        {videos && videos.length > 1 && (
          <ul className="mt-2 space-y-1">
            {videos.slice(1, 3).map((v) => (
              <li key={v.id}>
                <a
                  href={v.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-start gap-1.5 rounded px-1.5 py-1 text-[10px] leading-snug text-slate-400 hover:bg-bg-soft hover:text-slate-200"
                >
                  <Play size={9} className="mt-0.5 shrink-0 text-danger/70" />
                  <span className="line-clamp-1 flex-1">{v.title}</span>
                  <span className="shrink-0 text-slate-600">{formatRelative(v.published)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Sosyal linkler */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <a
          href={analystYoutubeUrl(a)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-danger/30 bg-danger/10 px-2 py-1 text-[10px] font-medium text-danger transition hover:bg-danger/20"
          title="YouTube"
        >
          <Youtube size={10} /> Kanal <ExternalLink size={8} />
        </a>
        <a
          href={analystTwitterUrl(a)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-2 py-1 text-[10px] font-medium text-accent transition hover:bg-accent/20"
          title="Twitter / X"
        >
          <MessageCircle size={10} /> X <ExternalLink size={8} />
        </a>
        {a.websiteUrl && (
          <a
            href={a.websiteUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-soft px-2 py-1 text-[10px] font-medium text-slate-400 transition hover:border-slate-500 hover:text-slate-200"
            title="Resmi web sayfası"
          >
            <Globe size={10} /> Web <ExternalLink size={8} />
          </a>
        )}
      </div>
    </div>
  );
}
