import { useState } from 'react';
import { Sparkles, Search, AlertCircle } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { NewsCard } from '@/components/domain/NewsCard';
import { semanticSearch } from '@/data/api/voyage';
import { isSupabaseConfigured } from '@/data/supabase';
import type { NewsItem } from '@/data/types';

export function SmartSearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const enabled = isSupabaseConfigured();

  const onSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const r = await semanticSearch(query.trim(), 10);
      setResults(r);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Akıllı Arama"
        subtitle="Voyage AI embeddings + pgvector ile anlam tabanlı haber araması."
      />

      {!enabled && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3">
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-warning" />
          <p className="text-xs leading-relaxed text-slate-300">
            <span className="font-semibold text-warning">Supabase bağlı değil.</span> Bu sayfanın çalışması için
            <code className="mx-1 rounded bg-bg-card px-1 font-mono">VITE_SUPABASE_URL</code> ve
            <code className="mx-1 rounded bg-bg-card px-1 font-mono">VITE_SUPABASE_ANON_KEY</code>'in
            .env.local'a eklenmesi, ardından
            <code className="mx-1 rounded bg-bg-card px-1 font-mono">voyage-embed</code> Edge Function'ının
            deploy edilmesi gerekir.
          </p>
        </div>
      )}

      <div className="mb-4 rounded-xl border border-border bg-bg-soft p-3">
        <div className="relative">
          <Sparkles size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-accent" />
          <input
            className="input pl-8"
            placeholder="ör: havayolu sektörü satın alma anlaşması, banka yapılandırması…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSearch()}
            disabled={!enabled}
          />
        </div>
        <div className="mt-2 flex justify-end">
          <button className="btn-primary" disabled={!enabled || !query.trim() || loading} onClick={onSearch}>
            <Search size={14} /> {loading ? 'Aranıyor…' : 'Anlam tabanlı ara'}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Sorgun Voyage AI ile embed edilir, pgvector cosine similarity ile en yakın haberleri buluruz.
          Kelime eşleşmesinden çok anlam yakınlığı önemli.
        </p>
      </div>

      {searched && results.length === 0 && !loading ? (
        <EmptyState
          icon={<Search size={28} />}
          title="Eşleşme yok"
          description="Henüz embed edilmiş haber bulunmuyor olabilir. Edge Function 'voyage-embed' tek seferlik index modunda çağrılmalı."
        />
      ) : (
        <div className="grid gap-3">
          {results.map((n) => (
            <NewsCard key={n.id} item={n} />
          ))}
        </div>
      )}
    </>
  );
}
