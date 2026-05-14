import { useParams, useNavigate, Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft, PiggyBank, ExternalLink, BarChart3, StickyNote, Trash2, AlertCircle, Activity, Radio,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { NoteButton } from '@/components/domain/NoteButton';
import { fundsRepo, notesRepo, activityRepo } from '@/data/repositories';
import { formatDateTR, formatRelative } from '@/lib/date';
import { useEffect, useState } from 'react';
import { fetchTefasFund, isTefasWorkerConfigured, type TefasFundDetail } from '@/data/api/tefasWorker';
import { fetchTefasFundByCode, isTefasGithubConfigured, type TefasFundData } from '@/data/api/tefasGithub';
import { cn } from '@/lib/utils';

export function FundDetailPage() {
  const { code = '' } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const fundCode = code.toUpperCase();

  const fund = useLiveQuery(async () => {
    const list = await fundsRepo.list();
    return list.find((f) => f.code === fundCode);
  }, [fundCode]);

  const notes = useLiveQuery(() => notesRepo.bySymbol(fundCode), [fundCode]) ?? [];
  const activity = useLiveQuery(() => activityRepo.list({ symbol: fundCode, limit: 20 }), [fundCode]) ?? [];

  const [liveData, setLiveData] = useState<TefasFundDetail | null>(null);
  const [githubData, setGithubData] = useState<TefasFundData | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);

  useEffect(() => {
    activityRepo.log({ type: 'page-view', symbol: fundCode, detail: `/fund/${fundCode}` }).catch(() => {});
    if (!fundCode) return;
    setLiveLoading(true);
    // Önce GitHub feed (daha kolay setup), sonra CF Worker fallback
    (async () => {
      try {
        if (isTefasGithubConfigured()) {
          const g = await fetchTefasFundByCode(fundCode);
          if (g) {
            setGithubData(g);
            return;
          }
        }
        if (isTefasWorkerConfigured()) {
          const w = await fetchTefasFund(fundCode);
          setLiveData(w);
        }
      } finally {
        setLiveLoading(false);
      }
    })();
  }, [fundCode]);

  const tefasUrl = `https://www.tefas.gov.tr/FonAnaliz.aspx?FonKod=${encodeURIComponent(fundCode)}`;
  const tefasComp = `https://www.tefas.gov.tr/FonKarsilastirma.aspx?FonKod=${encodeURIComponent(fundCode)}`;
  const mynetUrl = `https://finans.mynet.com/yatirim-fonlari/${fundCode.toLowerCase()}/`;
  const fintablesUrl = `https://fintables.com/fonlar/${fundCode}`;

  if (fund === undefined) {
    return <div className="p-6 text-center text-sm text-slate-500">Yükleniyor…</div>;
  }

  if (fund === null || !fund) {
    return (
      <>
        <button onClick={() => navigate(-1)} className="btn-ghost mb-3">
          <ArrowLeft size={14} /> Geri
        </button>
        <EmptyState
          icon={<AlertCircle size={28} />}
          title="Fon bulunamadı"
          description={`"${fundCode}" listende yok. Fonlar sayfasından ekleyebilirsin.`}
          action={
            <Link to="/funds" className="btn-primary">
              <PiggyBank size={16} /> Fonlara git
            </Link>
          }
        />
      </>
    );
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="btn-ghost">
          <ArrowLeft size={14} /> Geri
        </button>
        <NoteButton symbol={fundCode} hint={`${fundCode} fonu için not`} />
      </div>

      {/* Hero */}
      <div className="card relative mb-4 overflow-hidden p-6">
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-warning/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-warning/15 text-warning">
                <PiggyBank size={20} />
              </span>
              <h1 className="font-mono text-3xl font-bold tracking-tight text-slate-100">{fundCode}</h1>
              {fund.category && (
                <span className="rounded-md border border-border bg-bg-soft px-2 py-0.5 text-xs text-slate-300">
                  {fund.category}
                </span>
              )}
            </div>
            {fund.name && <p className="mt-2 text-base text-slate-300">{fund.name}</p>}
            <p className="mt-1 text-[11px] text-slate-500">
              Eklendi {formatDateTR(new Date(fund.addedAt).toISOString())}
            </p>
          </div>
          <div className="text-right">
            <a
              href={tefasUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-primary"
            >
              <ExternalLink size={14} /> TEFAS'ta canlı veri
            </a>
          </div>
        </div>
      </div>

      {/* Canlı TEFAS verisi — GitHub feed birinci, CF Worker yedek */}
      {githubData ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Birim Pay Değeri (NAV)</div>
              <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success">
                <Radio size={9} /> CANLI
              </span>
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-slate-100">
              {githubData.nav.toLocaleString('tr-TR', { maximumFractionDigits: 6 })}₺
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">{githubData.date}</div>
          </div>
          <div className="card sm:col-span-2 p-4">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Performans (TEFAS)</div>
            <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-6 text-xs">
              {[
                { k: '1w', l: '1 Hafta' },
                { k: '1m', l: '1 Ay' },
                { k: '3m', l: '3 Ay' },
                { k: '6m', l: '6 Ay' },
                { k: 'ytd', l: 'YTD' },
                { k: '1y', l: '1 Yıl' },
              ].map(({ k, l }) => {
                const v = (githubData.returns as Record<string, number | null>)[k];
                if (v == null) return (
                  <div key={k} className="rounded bg-bg-soft px-2 py-1">
                    <div className="text-[10px] text-slate-500">{l}</div>
                    <div className="tabular-nums text-slate-600">—</div>
                  </div>
                );
                return (
                  <div key={k} className="rounded bg-bg-soft px-2 py-1">
                    <div className="text-[10px] text-slate-500">{l}</div>
                    <div className={cn('tabular-nums font-medium', v >= 0 ? 'text-success' : 'text-danger')}>
                      {v >= 0 ? '+' : ''}{v.toFixed(2)}%
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {githubData.marketCap || githubData.investorCount ? (
            <div className="card sm:col-span-3 p-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {githubData.marketCap ? (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">Fon Büyüklüğü</div>
                    <div className="mt-1 text-base font-semibold tabular-nums">
                      {(githubData.marketCap / 1_000_000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}M ₺
                    </div>
                  </div>
                ) : null}
                {githubData.investorCount ? (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">Yatırımcı Sayısı</div>
                    <div className="mt-1 text-base font-semibold tabular-nums">
                      {githubData.investorCount.toLocaleString('tr-TR')}
                    </div>
                  </div>
                ) : null}
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Kategori</div>
                  <div className="mt-1 text-base font-semibold text-slate-200">{githubData.category || '—'}</div>
                </div>
              </div>
              <p className="mt-3 text-[10px] text-slate-500">Kaynak: TEFAS via GitHub Actions feed (saatlik)</p>
            </div>
          ) : null}
        </div>
      ) : isTefasWorkerConfigured() ? (
        liveLoading ? (
          <div className="mb-4 rounded-xl border border-accent/30 bg-accent/5 p-4 text-xs text-slate-400">
            TEFAS canlı veri çekiliyor (Cloudflare Worker → headless Chrome → TEFAS)…
          </div>
        ) : liveData?.nav ? (
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <div className="card p-4">
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Birim Pay Değeri (NAV)</div>
                <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success">
                  <Radio size={9} /> CANLI
                </span>
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-slate-100">
                {liveData.nav.toLocaleString('tr-TR', { maximumFractionDigits: 6 })}₺
              </div>
              {liveData.fetchedAt && (
                <div className="mt-0.5 text-[11px] text-slate-500">
                  {formatRelative(liveData.fetchedAt)}{liveData.fromCache ? ' (cache)' : ''}
                </div>
              )}
            </div>
            {liveData.perf && Object.keys(liveData.perf).length > 0 && (
              <div className="card sm:col-span-2 p-4">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Performans</div>
                <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4 text-xs">
                  {Object.entries(liveData.perf).slice(0, 8).map(([k, v]) => (
                    <div key={k} className="rounded bg-bg-soft px-2 py-1">
                      <div className="text-[10px] text-slate-500">{k}</div>
                      <div className={cn('tabular-nums font-medium', v >= 0 ? 'text-success' : 'text-danger')}>
                        {v >= 0 ? '+' : ''}{v.toFixed(2)}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {liveData.allocation && liveData.allocation.length > 0 && (
              <div className="card sm:col-span-3 p-4">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Varlık Dağılımı</div>
                <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 text-xs">
                  {liveData.allocation.map((a) => (
                    <div key={a.label} className="flex items-center justify-between rounded bg-bg-soft px-2.5 py-1.5">
                      <span className="text-slate-300">{a.label}</span>
                      <span className="tabular-nums text-accent">%{a.pct.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mb-4 rounded-xl border border-warning/30 bg-warning/5 p-4 text-xs text-warning">
            TEFAS Worker yapılandırıldı ama bu fon için veri alınamadı. Worker log'larını kontrol et.
          </div>
        )
      ) : (
        <div className="mb-4 rounded-xl border border-accent/30 bg-accent/5 p-4 text-xs leading-relaxed text-slate-300">
          <strong>İpucu:</strong> GitHub Actions feed'i kurarsan bu sayfada canlı NAV ve performans gözükür.{' '}
          Projedeki <code className="rounded bg-bg-card px-1 font-mono">SETUP_GITHUB_TEFAS.md</code> dosyasını
          takip et (10 dk, ücretsiz, sadece GitHub hesabı yeter).
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* External resources */}
        <section className="lg:col-span-2 space-y-3">
          <h2 className="text-sm font-semibold text-slate-200">Detaylı Bilgi Kaynakları</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <ExtLink
              title="TEFAS — Fon Analizi"
              description="Resmi: NAV, getiri, fon büyüklüğü, yatırımcı sayısı, varlık dağılımı"
              url={tefasUrl}
            />
            <ExtLink
              title="TEFAS — Karşılaştırma"
              description="Benchmark karşılaştırma, getiri grafikleri"
              url={tefasComp}
            />
            <ExtLink
              title="Mynet Yatırım Fonları"
              description="Türkçe özet, geçmiş fiyat, yorumlar"
              url={mynetUrl}
            />
            <ExtLink
              title="Fintables (Premium)"
              description="Detaylı portföy analizi, en büyük pozisyonlar"
              url={fintablesUrl}
            />
          </div>
        </section>

        <aside className="space-y-4">
          {/* Notes */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
                <StickyNote size={12} /> Notlarım
              </h3>
              <span className="text-[10px] text-slate-500">{notes.length}</span>
            </div>
            {notes.length === 0 ? (
              <p className="px-4 py-4 text-center text-xs text-slate-500">Not yok.</p>
            ) : (
              <div className="divide-y divide-border">
                {notes.slice(0, 5).map((n) => (
                  <div key={n.id} className="p-3">
                    <p className="text-xs text-slate-300">{n.body}</p>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                      <span>{formatDateTR(new Date(n.updatedAt).toISOString())}</span>
                      <button
                        onClick={() => n.id && notesRepo.remove(n.id)}
                        className="text-danger/70 hover:text-danger"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Activity */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
                <Activity size={12} /> Aktivite
              </h3>
            </div>
            {activity.length === 0 ? (
              <p className="px-4 py-4 text-center text-xs text-slate-500">Henüz etkileşim yok.</p>
            ) : (
              <div className="divide-y divide-border max-h-80 overflow-y-auto">
                {activity.slice(0, 15).map((a) => (
                  <div key={a.id} className="px-3 py-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-300">{a.type}</span>
                      <span className="text-[10px] text-slate-500">
                        {formatRelative(new Date(a.timestamp).toISOString())}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}

function ExtLink({ title, description, url }: { title: string; description: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="card group flex items-start gap-3 p-4 hover:border-accent/40"
    >
      <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent group-hover:bg-accent/25">
        <BarChart3 size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-medium text-slate-100">
          {title}
          <ExternalLink size={11} className="text-slate-500 group-hover:text-accent" />
        </div>
        <p className="mt-0.5 text-xs text-slate-400">{description}</p>
      </div>
    </a>
  );
}
