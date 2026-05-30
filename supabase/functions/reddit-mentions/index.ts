// Hane Finans — Reddit sentiment scraper
// Çağrı: invoke('reddit-mentions', { symbols: ['THYAO', 'ASELS', ...] })
// Secrets: REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USER_AGENT
//
// Mantık:
//   1. OAuth client_credentials ile access_token al
//   2. r/borsa, r/Turkey, r/BorsaIstanbul subreddit'lerinde son 24 saatin postlarını çek
//   3. Her sembol için başlık + body'de geçme sayısını say
//   4. Basit anahtar kelime tabanlı sentiment puanı (yükseliyor/yatay/düşüyor)
//   5. sentiment_mentions tablosuna upsert

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const SUBREDDITS = ['borsa', 'Turkey', 'BorsaIstanbul'];

const POSITIVE_WORDS = ['yükselir', 'yükseliş', 'yükseldi', 'al', 'long', 'fırlar', 'patlar', 'rally', 'bullish', 'iyi', 'güçlü'];
const NEGATIVE_WORDS = ['düşer', 'düşüş', 'düştü', 'sat', 'short', 'çakılır', 'bearish', 'kötü', 'zayıf', 'iflas'];

interface RedditPost {
  data: { title: string; selftext?: string; created_utc: number };
}

async function getToken(clientId: string, clientSecret: string, userAgent: string): Promise<string | null> {
  const credentials = btoa(`${clientId}:${clientSecret}`);
  const r = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': userAgent,
    },
    body: 'grant_type=client_credentials',
  });
  if (!r.ok) return null;
  const j = (await r.json()) as { access_token: string };
  return j.access_token;
}

async function fetchPosts(subreddit: string, token: string, userAgent: string): Promise<RedditPost[]> {
  const r = await fetch(`https://oauth.reddit.com/r/${subreddit}/new?limit=100`, {
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': userAgent },
  });
  if (!r.ok) return [];
  const j = (await r.json()) as { data: { children: RedditPost[] } };
  return j.data.children;
}

function scoreSentiment(text: string): 'positive' | 'neutral' | 'negative' {
  const lower = text.toLowerCase();
  let pos = 0;
  let neg = 0;
  for (const w of POSITIVE_WORDS) if (lower.includes(w)) pos++;
  for (const w of NEGATIVE_WORDS) if (lower.includes(w)) neg++;
  if (pos - neg >= 2) return 'positive';
  if (neg - pos >= 2) return 'negative';
  return 'neutral';
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const clientId = Deno.env.get('REDDIT_CLIENT_ID');
  const clientSecret = Deno.env.get('REDDIT_CLIENT_SECRET');
  const userAgent = Deno.env.get('REDDIT_USER_AGENT') ?? 'HaneFinans/0.1';
  if (!clientId || !clientSecret) return jsonResponse({ error: 'Reddit secrets eksik' }, 500);

  const { symbols } = (await req.json().catch(() => ({}))) as { symbols?: string[] };
  if (!symbols || symbols.length === 0) {
    return jsonResponse({ error: 'symbols listesi gerekli' }, 400);
  }

  const token = await getToken(clientId, clientSecret, userAgent);
  if (!token) return jsonResponse({ error: 'Reddit OAuth başarısız' }, 502);

  const allPosts: { text: string; created: number }[] = [];
  for (const sr of SUBREDDITS) {
    const posts = await fetchPosts(sr, token, userAgent);
    for (const p of posts) {
      allPosts.push({
        text: `${p.data.title} ${p.data.selftext ?? ''}`,
        created: p.data.created_utc,
      });
    }
  }

  const oneDayAgo = Date.now() / 1000 - 86400;
  const recent = allPosts.filter((p) => p.created >= oneDayAgo);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(supabaseUrl, serviceRoleKey);

  const windowStart = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const windowEnd = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];

  for (const symbol of symbols.map((s) => s.toUpperCase())) {
    const re = new RegExp(`\\b${symbol}\\b`, 'i');
    const matches = recent.filter((p) => re.test(p.text));
    const count = matches.length;
    if (count === 0) continue;
    const combinedText = matches.map((m) => m.text).join(' ');
    const sentiment = scoreSentiment(combinedText);
    rows.push({
      symbol,
      source: 'reddit',
      count,
      sentiment,
      window_start: windowStart,
      window_end: windowEnd,
    });
  }

  if (rows.length > 0) {
    const { error } = await sb.from('sentiment_mentions').insert(rows);
    if (error) return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse({ ok: true, recorded: rows.length, mentions: rows });
});
