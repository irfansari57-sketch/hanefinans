// Hane Finans — Voyage AI embedding
// İki kullanım:
//   1) invoke('voyage-embed', { mode: 'index' })            → embed-edilmemiş haberleri toplu embedle
//   2) invoke('voyage-embed', { mode: 'query', text: '...' }) → tek bir sorguyu embed et + benzer haberleri döndür
//
// Secret gerekli: VOYAGE_API_KEY
// Model: voyage-large-2 (1024 boyut)

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';
const MODEL = 'voyage-large-2';

async function embed(texts: string[], apiKey: string, inputType: 'document' | 'query'): Promise<number[][] | null> {
  const r = await fetch(VOYAGE_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, input: texts, input_type: inputType }),
  });
  if (!r.ok) {
    console.error('Voyage hata:', r.status, await r.text());
    return null;
  }
  const j = (await r.json()) as { data: Array<{ embedding: number[] }> };
  return j.data.map((d) => d.embedding);
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const voyageKey = Deno.env.get('VOYAGE_API_KEY');
  if (!voyageKey) return jsonResponse({ error: 'VOYAGE_API_KEY tanımlı değil' }, 500);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(supabaseUrl, serviceRoleKey);

  const body = (await req.json().catch(() => ({}))) as { mode?: 'index' | 'query'; text?: string; limit?: number };

  if (body.mode === 'query') {
    if (!body.text) return jsonResponse({ error: 'text gerekli' }, 400);
    const vecs = await embed([body.text], voyageKey, 'query');
    if (!vecs) return jsonResponse({ error: 'Embed başarısız' }, 502);
    const { data, error } = await sb.rpc('match_news', {
      query_embedding: vecs[0],
      match_count: body.limit ?? 10,
      min_similarity: 0.6,
    });
    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse({ ok: true, matches: data });
  }

  // mode === 'index' (default)
  const { data: pending, error: pendingErr } = await sb
    .from('news')
    .select('id, title, summary')
    .not('id', 'in', `(select news_id from news_embeddings)`)
    .order('published_at', { ascending: false })
    .limit(50);
  if (pendingErr) return jsonResponse({ error: pendingErr.message }, 500);
  if (!pending || pending.length === 0) return jsonResponse({ ok: true, embedded: 0 });

  const texts = pending.map((n) => `${n.title}\n\n${n.summary ?? ''}`);
  const vecs = await embed(texts, voyageKey, 'document');
  if (!vecs) return jsonResponse({ error: 'Embed başarısız' }, 502);

  const rows = pending.map((n, i) => ({
    news_id: n.id,
    embedding: vecs[i],
    model: MODEL,
  }));
  const { error: insErr } = await sb.from('news_embeddings').insert(rows);
  if (insErr) return jsonResponse({ error: insErr.message }, 500);

  return jsonResponse({ ok: true, embedded: rows.length });
});
