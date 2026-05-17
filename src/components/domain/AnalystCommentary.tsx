import { useEffect, useState } from 'react';
import { ExternalLink, MessageCircle, Globe, Mic, FileText, Calendar, AlertTriangle } from 'lucide-react';
import { ANALYSTS, analystTwitterUrl, type Analyst } from '@/data/analysts';
import { fetchBrokerBulletins, type BrokerBulletin } from '@/data/api/brokerBulletins';

/**
 * Aracı kurum günlük bülten özet kartı.
 * GH Actions her sabah Osmanlı Menkul PDF'ini indirir + metin çıkarır → JSON.
 * Bu component JSON'u CDN'den çeker ve özeti direkt kart içinde gösterir.
 * KT Yatırım sitesi JS-rendered olduğu için sadece bülten linki gösterilir.
 */

export function AnalystCommentary() {
  const [bulletins, setBulletins] = useState<Record<string, BrokerBulletin> | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBrokerBulletins()
      .then((feed) => {
        if (feed) {
          setBulletins(feed.bulletins);
          setFetchedAt(feed.fetchedAt);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="glass-card p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent/15 text-accent">
            <Mic size={14} />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-200">Aracı Kurum Bültenleri</h2>
            <p className="text-[11px] text-slate-500">
              Osmanlı Yatırım ve KT Yatırım'ın günlük piyasa yorumları
            </p>
          </div>
        </div>
        {fetchedAt && fetchedAt !== '1970-01-01T00:00:00Z' && (
          <span className="text-[10px] text-slate-500">
            Son güncelleme: {new Date(fetchedAt).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
          </span>
        )}
      </div>

      <div className={ANALYSTS.length > 1 ? 'grid gap-3 sm:grid-cols-2' : 'grid gap-3'}>
        {ANALYSTS.map((a) => (
          <AnalystCard key={a.id} a={a} bulletin={bulletins?.[a.id]} loading={loading} />
        ))}
      </div>

      <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
        ℹ️ Bültenler ilgili aracı kurumun resmi PDF/sayfasından otomatik özetlenmiştir.{' '}
        Hane Finans'ın bu kurumlarla resmi bir bağı yoktur. Yatırım tavsiyesi değildir.
      </p>
    </section>
  );
}

interface CardProps {
  a: Analyst;
  bulletin: BrokerBulletin | undefined;
  loading: boolean;
}

function AnalystCard({ a, bulletin, loading }: CardProps) {
  const primaryUrl = bulletin?.pdfUrl ?? bulletin?.sourceUrl ?? a.bulletinUrl;
  const hasSections = bulletin?.ok && bulletin.sections && bulletin.sections.length > 0;
  const hasExcerpt = bulletin?.ok && bulletin.excerpt;

  return (
    <div className="flex flex-col rounded-lg border border-border bg-bg-card p-4 transition hover:border-accent/40">
      {/* Header — avatar + isim + tarih */}
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
          {bulletin?.date ? (
            <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-accent">
              <Calendar size={9} /> {bulletin.date}
            </div>
          ) : (
            <div className="mt-0.5 truncate text-[10px] text-slate-500">{a.role}</div>
          )}
        </div>
      </div>

      {/* Bülten içeriği */}
      <div className="mt-3 flex-1">
        {loading ? (
          <div className="space-y-1.5">
            <div className="h-2 w-full animate-pulse rounded bg-bg-soft/60" />
            <div className="h-2 w-11/12 animate-pulse rounded bg-bg-soft/60" />
            <div className="h-2 w-9/12 animate-pulse rounded bg-bg-soft/60" />
            <div className="h-2 w-10/12 animate-pulse rounded bg-bg-soft/60" />
          </div>
        ) : hasSections ? (
          <div className="space-y-3 rounded-md border border-border/60 bg-bg-soft/40 p-3">
            {bulletin.sections!.map((sec, i) => (
              <div key={i}>
                <h4 className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-accent">
                  <FileText size={10} /> {sec.title}
                </h4>
                <p className="text-[11px] leading-relaxed text-slate-300">
                  {sec.content}
                </p>
              </div>
            ))}
          </div>
        ) : hasExcerpt ? (
          <div className="rounded-md border border-border/60 bg-bg-soft/40 p-2.5">
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium text-slate-400">
              <FileText size={10} className="text-accent" />
              {bulletin.title ?? 'Günlük Bülten'}
            </div>
            <p className="text-[11px] leading-relaxed text-slate-300">
              {bulletin.excerpt}
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-warning/20 bg-warning/5 p-2.5">
            <div className="flex items-start gap-1.5 text-[10px] text-warning/90">
              <AlertTriangle size={11} className="mt-0.5 shrink-0" />
              <span className="leading-relaxed">
                {bulletin?.error
                  ? bulletin.error
                  : 'Bülten özeti henüz alınamadı — aşağıdaki link aktif'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Ana CTA — bülten kaynağına git */}
      <a
        href={primaryUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-[11px] font-semibold text-accent transition hover:bg-accent/20"
      >
        <FileText size={11} />
        {bulletin?.pdfUrl ? 'Bültenin Tam PDF Halini Aç' : 'Bülten Sayfasına Git'}
        <ExternalLink size={10} />
      </a>

      {/* Sekonder linkler */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-2.5">
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
