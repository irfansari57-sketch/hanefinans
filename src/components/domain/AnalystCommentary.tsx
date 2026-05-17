import { ExternalLink, MessageCircle, Globe, Mic, FileText, TrendingUp } from 'lucide-react';
import { ANALYSTS, analystTwitterUrl, type Analyst } from '@/data/analysts';

/**
 * Aracı kurum günlük bülten ve strateji raporlarına hızlı erişim kartı.
 * Sadece resmi aracı kurumlar (Osmanlı Yatırım, KT Yatırım) — bireysel
 * analist hesapları burada listelenmez.
 */

export function AnalystCommentary() {
  return (
    <section className="glass-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent/15 text-accent">
          <Mic size={14} />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-slate-200">Aracı Kurum Bültenleri</h2>
          <p className="text-[11px] text-slate-500">
            Osmanlı Yatırım ve KT Yatırım'ın günlük piyasa bültenleri ve strateji raporları
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {ANALYSTS.map((a) => <AnalystCard key={a.id} a={a} />)}
      </div>

      <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
        ℹ️ Bu sayfada paylaşılan aracı kurumlar bilgi amaçlıdır; herhangi bir aracı kurum ile{' '}
        Hane Finans'ın resmi bir bağı yoktur. Bültenler yatırım tavsiyesi değildir.
      </p>
    </section>
  );
}

function AnalystCard({ a }: { a: Analyst }) {
  return (
    <div className="flex flex-col rounded-lg border border-border bg-bg-card p-4 transition hover:border-accent/40">
      {/* Header — avatar + isim + rol */}
      <div className="flex items-start gap-3">
        <span
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-base font-bold text-white"
          style={{ background: a.colorSeed }}
        >
          {a.initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-100">{a.name}</div>
          <div className="truncate text-[11px] text-slate-400">{a.affiliation}</div>
          <div className="mt-0.5 text-[10px] leading-snug text-slate-500">{a.role}</div>
        </div>
      </div>

      {/* Ana CTA — Bugünkü Bülten */}
      <a
        href={a.bulletinUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-4 inline-flex items-center justify-center gap-2 rounded-md border border-accent/40 bg-accent/10 px-3 py-2.5 text-xs font-semibold text-accent transition hover:bg-accent/20"
      >
        <FileText size={13} />
        Günlük Bülten / Strateji Raporu
        <ExternalLink size={11} />
      </a>

      <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
        Her sabah güncellenen piyasa özeti, BIST yorumu ve sektörel öneriler — doğrudan{' '}
        {a.name} resmi sayfası.
      </p>

      {/* Sekonder linkler */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-3">
        {a.twitterHandle && (
          <a
            href={analystTwitterUrl(a)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-soft px-2 py-1 text-[10px] font-medium text-slate-400 transition hover:border-accent/40 hover:text-accent"
            title="Twitter / X"
          >
            <MessageCircle size={10} /> @{a.twitterHandle} <ExternalLink size={8} />
          </a>
        )}
        <a
          href={a.websiteUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-soft px-2 py-1 text-[10px] font-medium text-slate-400 transition hover:border-slate-500 hover:text-slate-200"
          title="Resmi web sayfası"
        >
          <Globe size={10} /> Web <ExternalLink size={8} />
        </a>
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-slate-600">
          <TrendingUp size={10} /> Aracı Kurum
        </span>
      </div>
    </div>
  );
}
