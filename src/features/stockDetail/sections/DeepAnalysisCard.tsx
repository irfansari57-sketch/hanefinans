/**
 * DeepAnalysisCard — Hisse detay sayfasinda "AI Derin Analiz" bolumu.
 *
 * Tier:
 *   - Free → paywall preview (3 satir teaser + "Pro'ya yukselt" CTA)
 *   - Pro → ayda 2 analiz hakki, kullanildikca quota azalir
 *   - Elite → limitsiz
 *
 * Cache: 24 saat — ayni hisse icin tekrar tikla AI cagrilmaz, D1'den doner.
 */

import { useState } from 'react';
import { Sparkles, Lock, AlertCircle, Loader2, RefreshCw, Crown } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { cn } from '@/lib/utils';

interface Props {
  symbol: string;
  name?: string;
  price: number;
  changePct: number;
  sector?: string;
  rsi?: number;
  macd?: 'bullish' | 'bearish' | 'neutral';
  trend?: 'long' | 'short' | 'neutral';
  ema?: { period: number; above: boolean }[];
  // Sonraki seansta entegre edilir (financials + sector avg + macro)
}

interface AnalyzeResponse {
  ok: boolean;
  content_md?: string;
  cached?: boolean;
  generated_at?: number;
  quota?: { used: number; limit: number; remaining: number };
  error?: string;
  message?: string;
  requiredTier?: string;
}

export function DeepAnalysisCard(props: Props) {
  const user = useAuth((s) => s.user);
  const tier = user?.tier ?? 'free';
  const [content, setContent] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<number | null>(null);
  const [quota, setQuota] = useState<AnalyzeResponse['quota']>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; requiredTier?: string } | null>(null);

  async function generateAnalysis() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/ai/deep-analyze', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: props.symbol,
          name: props.name,
          price: props.price,
          changePct: props.changePct,
          sector: props.sector,
          rsi: props.rsi,
          macd: props.macd,
          trend: props.trend,
          ema: props.ema,
        }),
      });
      const j = (await r.json()) as AnalyzeResponse;
      if (!j.ok) {
        setError({
          message: j.message ?? j.error ?? 'Bilinmeyen hata',
          requiredTier: j.requiredTier,
        });
        if (j.quota) setQuota(j.quota);
        return;
      }
      setContent(j.content_md ?? '');
      setCached(j.cached ?? false);
      setGeneratedAt(j.generated_at ?? null);
      if (j.quota) setQuota(j.quota);
    } catch (e) {
      setError({ message: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }

  // Free + Pro tier paywall — AI Derin Analiz sadece ELITE'a acik
  if (tier !== 'elite') {
    return (
      <div className="rounded-xl border border-warning/30 bg-gradient-to-br from-warning/5 to-transparent p-5">
        <div className="flex items-start gap-3 mb-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-warning/15 text-warning">
            <Crown size={18} />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold text-slate-100 mb-1">AI Derin Analiz</h3>
            <p className="text-sm text-slate-300">
              Premium kapsamli teknik + makro + finansal + senaryo analizi.
            </p>
          </div>
        </div>
        <div className="rounded-lg bg-bg-card/50 p-4 text-xs text-slate-400 mb-4 italic">
          <strong className="text-slate-300 not-italic">Ornek icerik:</strong> Genel degerlendirme,
          teknik analiz (RSI/MACD/EMA), sektor karsilastirmasi, makro etkiler, risk faktorleri ve
          uc senaryolu hedef fiyat tahmini. 600-900 kelimelik premium icerik.
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Lock size={14} className="text-warning" />
          <span className="text-slate-300">
            Sadece <strong className="text-warning">Elite</strong> uyeligine acik (limitsiz analiz).
          </span>
        </div>
        <a
          href="/uyelik"
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-warning px-4 py-2 text-sm font-bold text-bg-base hover:brightness-110 transition"
        >
          <Crown size={14} />
          Elite'a Yukselt
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-accent/30 bg-gradient-to-br from-accent/5 to-transparent p-5">
      <div className="flex items-start gap-3 mb-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent">
          <Sparkles size={18} />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-bold text-slate-100">AI Derin Analiz</h3>
          <p className="text-[11px] text-slate-400">
            Premium kapsamli analiz: teknik + makro + finansal + senaryo.
            {tier === 'pro' && quota && quota.limit > 0 && (
              <span className="ml-1">
                · <strong className={cn(quota.remaining > 0 ? 'text-success' : 'text-warning')}>
                  {quota.used}/{quota.limit}
                </strong> kullanildi
              </span>
            )}
            {tier === 'elite' && <span className="ml-1">· <strong className="text-warning">Elite</strong> · limitsiz</span>}
          </p>
        </div>
      </div>

      {!content && !loading && !error && (
        <button
          type="button"
          onClick={generateAnalysis}
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-bg-base hover:brightness-110 transition flex items-center justify-center gap-2"
        >
          <Sparkles size={14} />
          Derin Analiz Olustur
        </button>
      )}

      {loading && (
        <div className="rounded-lg bg-bg-card/50 p-6 text-center">
          <Loader2 size={24} className="mx-auto mb-2 animate-spin text-accent" />
          <div className="text-sm text-slate-300">AI analiz uretiliyor...</div>
          <div className="text-[11px] text-slate-500 mt-1">10-20 saniye surebilir</div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          <div className="flex items-start gap-2 mb-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <div className="flex-1">{error.message}</div>
          </div>
          {error.requiredTier && (
            <a
              href="/uyelik"
              className="inline-flex items-center gap-1.5 mt-2 rounded-md bg-warning px-3 py-1.5 text-xs font-bold text-bg-base hover:brightness-110"
            >
              <Crown size={11} />
              {error.requiredTier === 'elite' ? 'Elite\'a Yukselt' : 'Pro\'ya Yukselt'}
            </a>
          )}
        </div>
      )}

      {content && (
        <>
          <div className="rounded-lg bg-bg-card/30 p-4 mb-3">
            <MarkdownBlocks content={content} />
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <div>
              {generatedAt && new Date(generatedAt).toLocaleString('tr-TR', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
              })} uretildi
              {cached && <span className="ml-2 text-warning">· 24h cache</span>}
            </div>
            {/* Elite icin yeniden olustur (cache bypass eklensin sonra) */}
            {tier === 'elite' && (
              <button
                type="button"
                onClick={generateAnalysis}
                className="inline-flex items-center gap-1 hover:text-accent transition"
                title="Cache'i bypass et + yeniden uret"
              >
                <RefreshCw size={11} />
                Yenile
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Basit Markdown render — DeepAnalysis icerigi yapilandirilmis (## headers + bold + bullets).
 */
function MarkdownBlocks({ content }: { content: string }) {
  const lines = content.split('\n');
  const nodes: React.ReactNode[] = [];
  let bullets: string[] = [];
  let para: string[] = [];

  const flushPara = () => {
    if (para.length > 0) {
      nodes.push(<p key={`p${nodes.length}`} className="text-sm text-slate-200 leading-relaxed mb-2">{renderInline(para.join(' '))}</p>);
      para = [];
    }
  };
  const flushBullets = () => {
    if (bullets.length > 0) {
      nodes.push(
        <ul key={`u${nodes.length}`} className="list-disc pl-5 space-y-1 mb-2 text-sm text-slate-200">
          {bullets.map((b, i) => <li key={i}>{renderInline(b)}</li>)}
        </ul>,
      );
      bullets = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line === '') { flushPara(); flushBullets(); continue; }
    if (line.startsWith('## ')) {
      flushPara(); flushBullets();
      nodes.push(<h4 key={`h${nodes.length}`} className="text-sm font-bold text-slate-100 mt-3 mb-1">{line.slice(3)}</h4>);
      continue;
    }
    if (line.startsWith('### ')) {
      flushPara(); flushBullets();
      nodes.push(<h5 key={`h${nodes.length}`} className="text-xs font-semibold text-slate-200 mt-2">{line.slice(4)}</h5>);
      continue;
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      flushPara();
      bullets.push(line.slice(2));
      continue;
    }
    flushBullets();
    para.push(line);
  }
  flushPara();
  flushBullets();
  return <>{nodes}</>;
}

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;
  while (remaining.length > 0) {
    const boldMatch = remaining.match(/^(.*?)\*\*([^*]+)\*\*/);
    if (boldMatch) {
      if (boldMatch[1]) parts.push(boldMatch[1]);
      parts.push(<strong key={key++} className="font-semibold text-slate-100">{boldMatch[2]}</strong>);
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }
    parts.push(remaining);
    break;
  }
  return parts;
}
