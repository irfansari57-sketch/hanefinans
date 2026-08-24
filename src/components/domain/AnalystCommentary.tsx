import { ExternalLink, MessageCircle, Globe, Mic, FileText } from 'lucide-react';
import { ANALYSTS, analystTwitterUrl, type Analyst } from '@/data/analysts';

/**
 * Aracı kurum günlük bülten linklerinin hızlı erişim kartı.
 * Her kurumun bültenine 1 tıkla gidilir; bülten içeriği parse edilmez
 * (PDF formatları farklılaştığı için ham metin okunamıyor — direkt link
 * en sağlıklı ve hızlı yol).
 */

export function AnalystCommentary() {
  return (
    <section className="glass-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent/15 text-accent">
          <Mic size={14} />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-slate-200">Aracı Kurum Günlük Bültenleri</h2>
          <p className="text-[11px] text-slate-500">
            Türkiye'nin büyük aracı kurumlarının günlük piyasa bültenlerine direkt erişim
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ANALYSTS.map((a) => <AnalystCard key={a.id} a={a} />)}
      </div>

      <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
        ℹ️ Linkler ilgili aracı kurumun resmi web sayfasına yönlendirir.{' '}
        InvestliQ'ın bu kurumlarla resmi bir bağı yoktur. Yatırım tavsiyesi değildir.
      </p>
    </section>
  );
}

function AnalystCard({ a }: { a: Analyst }) {
  return (
    <div className="flex flex-col rounded-lg border border-border bg-bg-card p-4 transition hover:border-accent/40">
      {/* Header — avatar + isim */}
      <div className="flex items-start gap-3">
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
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

      {/* Ana CTA — bülten sayfasına git */}
      <a
        href={a.bulletinUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-3 py-2.5 text-[11px] font-semibold text-accent transition hover:bg-accent/20"
      >
        <FileText size={11} />
        Günlük Bülteni Aç
        <ExternalLink size={10} />
      </a>

      {/* Sekonder linkler */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {a.twitterHandle && (
          <a
            href={analystTwitterUrl(a)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-soft px-2 py-1 text-[10px] font-medium text-slate-400 transition hover:border-accent/40 hover:text-accent"
            title="Twitter / X"
          >
            <MessageCircle size={10} /> @{a.twitterHandle}
          </a>
        )}
        <a
          href={a.websiteUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-soft px-2 py-1 text-[10px] font-medium text-slate-400 transition hover:border-slate-500 hover:text-slate-200"
          title="Resmi web sayfası"
        >
          <Globe size={10} /> Web
        </a>
      </div>
    </div>
  );
}
