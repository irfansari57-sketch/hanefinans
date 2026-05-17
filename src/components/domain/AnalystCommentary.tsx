import { ExternalLink, Youtube, MessageCircle, Globe, Mic } from 'lucide-react';
import { ANALYSTS, analystYoutubeUrl, analystTwitterUrl, type Analyst } from '@/data/analysts';

/**
 * Aracı kurum & bağımsız analist yorumlarına hızlı erişim kartı.
 * MorningReportPage'de "Piyasa Yorumcuları" bölümünde gösterilir.
 *
 * Her kart: avatar (baş harfler) + isim + kurum + YouTube + Twitter + web linki.
 * Sonraki iterasyonda: RSS feed ile YouTube son video thumbnail + tarih.
 */

export function AnalystCommentary() {
  return (
    <section className="glass-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent/15 text-accent">
          <Mic size={14} />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-slate-200">Piyasa Yorumcuları</h2>
          <p className="text-[11px] text-slate-500">
            Aracı kurum analistleri + bağımsız stratejistlerin günlük yorumları
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
  return (
    <div className="rounded-lg border border-border bg-bg-card p-3 transition hover:border-accent/40">
      <div className="flex items-start gap-3">
        {/* Avatar — baş harfler */}
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

      {/* Sosyal linkler — yatay sıra */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <a
          href={analystYoutubeUrl(a)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-danger/30 bg-danger/10 px-2 py-1 text-[10px] font-medium text-danger transition hover:bg-danger/20"
          title="YouTube"
        >
          <Youtube size={10} /> YouTube
          <ExternalLink size={8} />
        </a>
        <a
          href={analystTwitterUrl(a)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-2 py-1 text-[10px] font-medium text-accent transition hover:bg-accent/20"
          title="Twitter / X"
        >
          <MessageCircle size={10} /> X
          <ExternalLink size={8} />
        </a>
        {a.websiteUrl && (
          <a
            href={a.websiteUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-soft px-2 py-1 text-[10px] font-medium text-slate-400 transition hover:border-slate-500 hover:text-slate-200"
            title="Resmi web sayfası"
          >
            <Globe size={10} /> Web
            <ExternalLink size={8} />
          </a>
        )}
      </div>
    </div>
  );
}
