/**
 * Cloudflare Pages Function — YouTube kanalı son video özeti.
 *
 * Query:
 *   ?handle=hanemodstudio    (önce HTML scrape ile channelId resolve)
 *   ?channelId=UCxxxx        (direkt RSS feed)
 *
 * Response:
 *   { ok: true, channelId, channelTitle, videos: [{ id, title, published, thumbnail, url }] }
 *   { ok: false, error: string }
 *
 * Cache: 30 dakika (CDN edge cache) — analist kanalları sıklıkla güncellenmez,
 * her sayfa açılışında YouTube'a istek atmamak için.
 */

interface VideoEntry {
  id: string;
  title: string;
  published: string;
  thumbnail: string;
  url: string;
}

interface FeedResponse {
  ok: boolean;
  channelId?: string;
  channelTitle?: string;
  videos?: VideoEntry[];
  error?: string;
}

const CACHE_TTL_SECONDS = 30 * 60; // 30 dk

async function resolveChannelId(handle: string): Promise<string | null> {
  const cleanHandle = handle.replace(/^@/, '');
  const url = `https://www.youtube.com/@${cleanHandle}`;
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 HaneFinans/1.0' },
    });
    if (!r.ok) return null;
    const html = await r.text();
    // YouTube HTML içinde "channelId":"UC..." pattern'i
    const m = html.match(/"channelId":"(UC[A-Za-z0-9_-]{22})"/);
    if (m) return m[1];
    // Alternatif: "externalId":"UC..."
    const m2 = html.match(/"externalId":"(UC[A-Za-z0-9_-]{22})"/);
    if (m2) return m2[1];
    return null;
  } catch {
    return null;
  }
}

async function fetchRss(channelId: string): Promise<{ channelTitle: string; videos: VideoEntry[] } | null> {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 HaneFinans/1.0' },
    });
    if (!r.ok) return null;
    const xml = await r.text();
    // Basit XML parsing — entry/title/published/videoId/thumbnail
    const channelTitleMatch = xml.match(/<title>([^<]+)<\/title>/);
    const channelTitle = channelTitleMatch ? channelTitleMatch[1].trim() : '';

    const entries = xml.split('<entry>').slice(1, 6); // ilk 5 video
    const videos: VideoEntry[] = entries.map((entry) => {
      const idMatch = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
      const titleMatch = entry.match(/<title>([^<]+)<\/title>/);
      const publishedMatch = entry.match(/<published>([^<]+)<\/published>/);
      const thumbMatch = entry.match(/<media:thumbnail[^>]+url="([^"]+)"/);
      const id = idMatch ? idMatch[1] : '';
      return {
        id,
        title: titleMatch ? titleMatch[1].trim() : '',
        published: publishedMatch ? publishedMatch[1] : '',
        thumbnail: thumbMatch ? thumbMatch[1] : (id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : ''),
        url: id ? `https://www.youtube.com/watch?v=${id}` : '',
      };
    }).filter((v) => v.id);

    return { channelTitle, videos };
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function onRequestGet(context: any) {
  const { request } = context;
  const url = new URL(request.url);
  const handle = url.searchParams.get('handle');
  let channelId = url.searchParams.get('channelId');

  const respond = (body: FeedResponse, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, s-maxage=${CACHE_TTL_SECONDS}`,
        'Access-Control-Allow-Origin': '*',
      },
    });

  if (!handle && !channelId) {
    return respond({ ok: false, error: 'handle veya channelId parametresi gerekli' }, 400);
  }

  // Handle verilmişse önce channelId resolve et
  if (handle && !channelId) {
    channelId = await resolveChannelId(handle);
    if (!channelId) {
      return respond({ ok: false, error: `Channel ID resolve edilemedi: @${handle}` });
    }
  }

  if (!channelId) {
    return respond({ ok: false, error: 'channelId boş' });
  }

  const feed = await fetchRss(channelId);
  if (!feed) {
    return respond({ ok: false, channelId, error: 'RSS feed alınamadı' });
  }

  return respond({
    ok: true,
    channelId,
    channelTitle: feed.channelTitle,
    videos: feed.videos,
  });
}
