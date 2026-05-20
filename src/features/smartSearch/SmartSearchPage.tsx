import { useState } from 'react';
import { Sparkles, Search, AlertCircle, Info } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { NewsCard } from '@/components/domain/NewsCard';
import { smartSearch, type SmartSearchResult } from '@/data/api/smartSearchClient';

export function SmartSearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SmartSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ totalSearched?: number; model?: string }>({});

  const onSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    setError(null);
    setResults([]);
    try {
      const r = await smartSearch(query.trim(), 10);
      if (!r) {
        setError('Smart Search endpoint cevap vermedi (yerel dev sunucuda Pages Functions çalışmaz — production\'da görülür).');
        return;
      }
      if (!r.ok) {
        setError(r.error ?? 'Arama başarısız.');
        return;
      }
      setResults(r.results ?? []);
      setMeta({ totalSearched: r.totalSearched, model: r.model });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Akıllı Arama"
        subtitle="Voyage AI embeddings + cosine similarity ile anlam tabanlı haber araması."
      />

      <div className="mb-4 rounded-xl border border-border bg-bg-soft p-3">
        <div className="relative">
          <Sparkles size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-accent" />
          <input
            className="input pl-8"
            placeholder="ör: havayolu sektörü kâr açıklaması, bankacılık yapılandırması, Fed faiz kararı…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSearch()}
          />
        </div>
        <div className="mt-2 flex justify-end">
          <button
            className="btn-primary"
            disabled={!query.trim() || loading}
            onClick={onSearch}
          >
            <Search size={14} /> {loading ? 'Aranıyor…' : 'Anlam tabanlı ara'}
          </button>
        </div>
        <p className="mt-2 flex items-start gap-1 text-[11px] text-slate-500 leading-relaxed">
          <Info size={11} className="mt-0.5 flex-shrink-0 text-accent" />
          <span>
            Sorgunuz Voyage AI ile embed edilir, son 50 haber başlığı ile cosine similarity karşılaştırılır.
            Kelime eşleşmesinden çok anlam yakınlığı önemli.
            {meta.model && <span className="ml-1 text-slate-600">· model: {meta.model}</span>}
          </span>
        </p>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3">
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-warning" />
          <p className="text-xs leading-relaxed text-slate-300">{error}</p>
        </div>
      )}

      {searched && !loading && !error && results.length === 0 && (
        <EmptyState
          icon={<Search size={28} />}
          title="Eşleşme yok"
          description="Bu sorguya yakın haber bulunamadı. Farklı bir ifadeyle dene."
        />
      )}

      {results.length > 0 && (
        <>
          <div className="mb-2 text-[11px] text-slate-500">
            {results.length} sonuç {meta.totalSearched ? `· ${meta.totalSearched} haber tarandı` : ''}
          </div>
          <div className="grid gap-3">
            {results.map((r) => (
              <div key={r.item.id} className="relative">
                <NewsCard item={r.item} />
                <div className="absolute right-3 top-3 rounded-full bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent">
                  {(r.similarity * 100).toFixed(0)}% match
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
