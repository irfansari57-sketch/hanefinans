-- Hane Finans — Supabase başlangıç şeması
-- Çalıştırma: Supabase Dashboard → SQL Editor → New Query → bu dosyanın içeriğini yapıştır → Run

-- =============================================================
-- 1) Extensions
-- =============================================================
create extension if not exists vector with schema public;
create extension if not exists pgcrypto with schema public;

-- =============================================================
-- 2) Cache tabloları (Edge Function'lar yazar, frontend okur)
-- =============================================================

-- Makro seriler (TCMB EVDS + Yahoo)
create table if not exists public.macro_series (
  key text primary key,                -- ör. 'tcmb_policy_rate', 'tufe_yoy', 'bist100', 'vix'
  label text not null,                 -- ör. 'Politika Faizi'
  value numeric(18, 6) not null,
  change_pct numeric(10, 4),
  unit text,                           -- '%', '$', '₺'
  source text not null,                -- 'tcmb', 'yahoo', 'goldapi', 'frankfurter'
  raw jsonb,                           -- ham yanıt (debug için)
  fetched_at timestamptz not null default now()
);

-- Haberler (GNews + KAP scrapers tarafından yazılır)
create table if not exists public.news (
  id text primary key,                 -- kaynak-bazlı stabil id
  source text not null,                -- 'KAP' | 'Reuters' | 'Bloomberg' | 'GNews' | 'Diğer'
  symbols text[] not null default '{}',
  importance smallint not null default 4 check (importance between 0 and 10),
  title text not null,
  summary text,
  url text,
  published_at timestamptz not null,
  fetched_at timestamptz not null default now()
);
create index if not exists news_published_at_idx on public.news (published_at desc);
create index if not exists news_symbols_idx on public.news using gin (symbols);

-- Haber embeddings (Voyage AI → pgvector)
-- voyage-large-2 = 1024 boyut
create table if not exists public.news_embeddings (
  news_id text primary key references public.news(id) on delete cascade,
  embedding vector(1024) not null,
  model text not null default 'voyage-large-2',
  embedded_at timestamptz not null default now()
);
create index if not exists news_embeddings_ivfflat
  on public.news_embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Sentiment / mention (Reddit scraper)
create table if not exists public.sentiment_mentions (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  source text not null default 'reddit',
  count integer not null default 0,
  sentiment text not null check (sentiment in ('positive','neutral','negative')),
  last_change integer,                  -- son 1 saat delta
  window_start timestamptz not null,
  window_end timestamptz not null,
  fetched_at timestamptz not null default now()
);
create index if not exists sentiment_window_idx on public.sentiment_mentions (window_end desc, symbol);

-- =============================================================
-- 3) RLS — public read, yazma yalnızca service_role
-- =============================================================
alter table public.macro_series enable row level security;
alter table public.news enable row level security;
alter table public.news_embeddings enable row level security;
alter table public.sentiment_mentions enable row level security;

create policy "macro_series read all" on public.macro_series for select using (true);
create policy "news read all" on public.news for select using (true);
create policy "news_embeddings read all" on public.news_embeddings for select using (true);
create policy "sentiment_mentions read all" on public.sentiment_mentions for select using (true);

-- Yazma izinleri sadece service_role içindir (Edge Function'lar service_role ile çalışır).
-- Anon (frontend) yazma yapamaz.

-- =============================================================
-- 4) Yardımcı RPC: semantik haber arama (cosine similarity)
-- =============================================================
create or replace function public.match_news(
  query_embedding vector(1024),
  match_count int default 10,
  min_similarity float default 0.7
)
returns table (
  id text,
  title text,
  summary text,
  source text,
  symbols text[],
  importance smallint,
  published_at timestamptz,
  similarity float
)
language sql stable
as $$
  select
    n.id, n.title, n.summary, n.source, n.symbols, n.importance, n.published_at,
    1 - (e.embedding <=> query_embedding) as similarity
  from public.news n
  join public.news_embeddings e on e.news_id = n.id
  where 1 - (e.embedding <=> query_embedding) > min_similarity
  order by e.embedding <=> query_embedding
  limit match_count;
$$;
