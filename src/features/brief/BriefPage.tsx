/**
 * /brief — Sabah AI Brief sayfasi.
 *
 * Bugunku brief'i + son 30 gun arsivi gosterir.
 * Veri /api/briefs/latest + /api/briefs/history endpoint'lerinden gelir.
 * Brief'i cron 07:30 TR'de uretir; yoksa "yarin sabah" placeholder gosterilir.
 */

import { useEffect, useState } from 'react';
import { Calendar, Sparkles, Clock, ChevronDown, AlertCircle } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { SeoHead } from '@/components/seo/SeoHead';
import { cn } from '@/lib/utils';

interface Brief {
  date: string;
  contentMd: string;
  generatedAt: number;
  modelVersion: string | null;
}

interface HistoryItem {
  date: string;
  generatedAt: number;
  preview: string;
}

interface LatestResponse { ok: boolean; brief: Brief | null }
interface HistoryResponse { ok: boolean; briefs: HistoryItem[]; total: number }

export function BriefPage() {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadLatest();
    loadHistory();
  }, []);

  async function loadLatest() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/briefs/latest');
      const j = (await r.json()) as LatestResponse;
      if (j.ok) {
        setBrief(j.brief);
        if (j.brief) setSelectedDate(j.brief.date);
      } else {
        setError('Brief alinamadi');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory() {
    try {
      const r = await fetch('/api/briefs/history?limit=30');
      const j = (await r.json()) as HistoryResponse;
      if (j.ok) setHistory(j.briefs);
    } catch { /* sessizce */ }
  }

  async function loadByDate(date: string) {
    setLoading(true);
    setError(null);
    setSelectedDate(date);
    try {
      const r = await fetch(`/api/briefs/${date}`);
      const j = (await r.json()) as LatestResponse;
      if (j.ok) setBrief(j.brief);
      else setError('Bu tarihteki brief bulunamadi');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <SeoHead title="Sabah Brief — Hane Finans" description="Gunluk BIST, makro ve haber ozeti." />
      <PageHeader
        title="Sabah Brief"
        subtitle="Her sabah 07:30'da BIST + makro + son 24 saat haber ozeti — AI destekli."
      />

      <div className="mx-auto max-w-3xl">
        {/* Tarih secici */}
        {history.length > 1 && (
          <div className="mb-4 flex items-center gap-2 flex-wrap">
            <Calendar size={14} className="text-slate-400" />
            <span className="text-xs text-slate-400">Tarih:</span>
            <select
              value={selectedDate ?? ''}
              onChange={(e) => loadByDate(e.target.value)}
              className="input h-8 text-xs max-w-[200px]"
            >
              {history.map((h) => (
                <option key={h.date} value={h.date}>
                  {formatDate(h.date)} {h.date === todayTr() ? '(bugun)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {loading && (
          <div className="rounded-xl border border-border bg-bg-soft p-6 text-center text-sm text-slate-400">
            Brief yukleniyor...
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger flex items-start gap-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        {!loading && !error && !brief && (
          <EmptyState />
        )}

        {!loading && !error && brief && (
          <article className="rounded-xl border border-border bg-bg-soft p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent/15 text-accent">
                <Sparkles size={16} />
              </div>
              <div className="flex-1">
                <h2 className="text-base sm:text-lg font-bold text-slate-100">
                  {formatDate(brief.date)}
                </h2>
                <div className="text-[11px] text-slate-500 flex items-center gap-1">
                  <Clock size={10} />
                  {new Date(brief.generatedAt).toLocaleString('tr-TR', {
                    hour: '2-digit', minute: '2-digit',
                  })} uretildi
                </div>
              </div>
            </div>

            <MarkdownContent content={brief.contentMd} />
          </article>
        )}

        {history.length > 0 && (
          <div className="mt-6">
            <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-2">Gecmis brief'ler</h3>
            <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
              {history.slice(0, 10).map((h) => (
                <button
                  key={h.date}
                  type="button"
                  onClick={() => loadByDate(h.date)}
                  className={cn(
                    'rounded-lg border p-3 text-left transition hover:bg-bg-card',
                    selectedDate === h.date
                      ? 'border-accent/40 bg-accent/5'
                      : 'border-border bg-bg-soft',
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-200">{formatDate(h.date)}</span>
                    <ChevronDown size={12} className="text-slate-500 -rotate-90" />
                  </div>
                  <div className="text-[11px] text-slate-400 line-clamp-2">{h.preview}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-border bg-bg-soft p-8 text-center">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-accent/10 text-accent">
        <Sparkles size={20} />
      </div>
      <h3 className="text-sm font-semibold text-slate-200 mb-1">Henuz brief yok</h3>
      <p className="text-xs text-slate-400 max-w-sm mx-auto">
        Sabah brief'i her gun saat <strong className="text-slate-300">07:30</strong>'da otomatik uretilir.
        Yarin sabah ilk brief'in burada olur.
      </p>
      <p className="text-[11px] text-slate-500 mt-3">
        Push bildirimleri acik ise brief hazir oldugunda haber veririz.
      </p>
    </div>
  );
}

/**
 * Basit Markdown render — brief icerigi yapilandirilmis (header + bold + bullet + paragraf).
 * react-markdown bundle'a binmesin diye inline parser.
 */
function MarkdownContent({ content }: { content: string }) {
  const blocks = parseMarkdown(content);
  return (
    <div className="prose-brief space-y-3 text-sm leading-relaxed text-slate-200">
      {blocks.map((block, i) => (
        <BlockRender key={i} block={block} />
      ))}
    </div>
  );
}

type Block =
  | { type: 'h1' | 'h2' | 'h3'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'bullets'; items: string[] }
  | { type: 'hr' }
  | { type: 'blank' };

function parseMarkdown(md: string): Block[] {
  const lines = md.split('\n');
  const blocks: Block[] = [];
  let currentPara: string[] = [];
  let currentBullets: string[] = [];

  function flushPara() {
    if (currentPara.length > 0) {
      blocks.push({ type: 'paragraph', text: currentPara.join(' ').trim() });
      currentPara = [];
    }
  }
  function flushBullets() {
    if (currentBullets.length > 0) {
      blocks.push({ type: 'bullets', items: currentBullets });
      currentBullets = [];
    }
  }

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line === '') { flushPara(); flushBullets(); continue; }
    if (line === '---' || line === '***') { flushPara(); flushBullets(); blocks.push({ type: 'hr' }); continue; }
    if (line.startsWith('### ')) { flushPara(); flushBullets(); blocks.push({ type: 'h3', text: line.slice(4) }); continue; }
    if (line.startsWith('## ')) { flushPara(); flushBullets(); blocks.push({ type: 'h2', text: line.slice(3) }); continue; }
    if (line.startsWith('# ')) { flushPara(); flushBullets(); blocks.push({ type: 'h1', text: line.slice(2) }); continue; }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      flushPara();
      currentBullets.push(line.slice(2));
      continue;
    }
    flushBullets();
    currentPara.push(line);
  }
  flushPara();
  flushBullets();
  return blocks;
}

function BlockRender({ block }: { block: Block }) {
  switch (block.type) {
    case 'h1': return <h2 className="text-lg sm:text-xl font-bold text-slate-100 mt-4 mb-1">{renderInline(block.text)}</h2>;
    case 'h2': return <h3 className="text-base sm:text-lg font-bold text-slate-100 mt-3 mb-1">{renderInline(block.text)}</h3>;
    case 'h3': return <h4 className="text-sm font-semibold text-slate-200 mt-2 mb-0.5">{renderInline(block.text)}</h4>;
    case 'paragraph': return <p>{renderInline(block.text)}</p>;
    case 'bullets': return (
      <ul className="list-disc pl-5 space-y-1">
        {block.items.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>
    );
    case 'hr': return <hr className="border-border my-3" />;
    default: return null;
  }
}

function renderInline(text: string): React.ReactNode {
  // **bold**, *italic*, `code`
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;
  while (remaining.length > 0) {
    const boldMatch = remaining.match(/^(.*?)\*\*([^*]+)\*\*/);
    const italicMatch = remaining.match(/^(.*?)\*([^*]+)\*/);
    const codeMatch = remaining.match(/^(.*?)`([^`]+)`/);
    // Pick the earliest match
    const candidates = [
      boldMatch ? { match: boldMatch, type: 'bold' as const } : null,
      italicMatch ? { match: italicMatch, type: 'italic' as const } : null,
      codeMatch ? { match: codeMatch, type: 'code' as const } : null,
    ].filter((c): c is NonNullable<typeof c> => c != null);
    if (candidates.length === 0) {
      parts.push(remaining);
      break;
    }
    candidates.sort((a, b) => (a.match[1] ?? '').length - (b.match[1] ?? '').length);
    const winner = candidates[0];
    const prefix = winner.match[1] ?? '';
    const inner = winner.match[2];
    if (prefix) parts.push(prefix);
    if (winner.type === 'bold') parts.push(<strong key={key++} className="font-semibold text-slate-100">{inner}</strong>);
    else if (winner.type === 'italic') parts.push(<em key={key++}>{inner}</em>);
    else parts.push(<code key={key++} className="rounded bg-bg-card px-1 py-0.5 text-[12px] font-mono text-accent">{inner}</code>);
    remaining = remaining.slice(winner.match[0].length);
  }
  return parts;
}

function formatDate(iso: string): string {
  // 2026-05-31 → 31 Mayis Pazar
  const [y, m, d] = iso.split('-').map((s) => parseInt(s, 10));
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  });
}

function todayTr(): string {
  const now = new Date();
  const tr = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return tr.toISOString().slice(0, 10);
}
