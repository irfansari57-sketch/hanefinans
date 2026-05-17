import { useParams, useNavigate, Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft, PiggyBank, ExternalLink, BarChart3, StickyNote, Trash2, AlertCircle, Radio, TrendingUp,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { NoteButton } from '@/components/domain/NoteButton';
import { fundsRepo, notesRepo, activityRepo } from '@/data/repositories';
import type { FundEntry } from '@/data/db';
import { formatDateTR, formatRelative } from '@/lib/date';
import { useEffect, useState, useMemo } from 'react';
import { fetchTefasFund, isTefasWorkerConfigured, type TefasFundDetail } from '@/data/api/tefasWorker';
import { fetchTefasFundByCode, isTefasGithubConfigured, type TefasFundData } from '@/data/api/tefasGithub';
import { cn } from '@/lib/utils';

export function FundDetailPage() {
  const { code = '' } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const fundCode = code.toUpperCase();

  const watchedFund = useLiveQuery(async () => {
    const list = await fundsRepo.list();
    return list.find((f) => f.code === fundCode) ?? null;
  }, [fundCode]);

  const [liveData, setLiveData] = useState<TefasFundDetail | null>(null);
  const [githubData, setGithubData] = useState<TefasFundData | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);

  // Watchlist'te değilse canlı feed'den sentetik bir entry üret —
  // detay sayfası yine de açılsın (yükleniyor ekranında takılmasın)
  const fund = useMemo<FundEntry | null | undefined>(() => {
    if (watchedFund === undefined) return undefined; // hala yükleniyor
    if (watchedFund) return watchedFund;
    if (githubData) {
      return {
        code: githubData.code,
        name: githubData.name,
        category: githubData.category,
        addedAt: Date.now(),
      } as FundEntry;
    }
    if (liveLoading) return undefined; // feed yüklenirken bekle
    if (!isTefasGithubConfigured() && !isTefasWorkerConfigured()) return null;
    // Feed konfigüre ama bu fon yok
    return null;
  }, [watchedFund, githubData, liveLoading]);

  const notes = useLiveQuery(() => notesRepo.bySymbol(fundCode), [fundCode]) ?? [];

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

          {/* Performans grafiği — anchor noktalardan reconstruct */}
          <div className="card sm:col-span-3 p-4">
            <FundPerformanceChart fund={githubData} />
          </div>
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

      {/* Dış kaynaklar — tam genişlik, 3 link tek satırda simetrik */}
      <section className="mb-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-200">Detaylı Bilgi Kaynakları</h2>
        <div className="grid gap-2 sm:grid-cols-3">
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
            title="Fintables (Premium)"
            description="Detaylı portföy analizi, en büyük pozisyonlar"
            url={fintablesUrl}
          />
        </div>
      </section>

      {/* Notlarım — tam genişlik, dış kaynakların altında simetrik şerit */}
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
            <StickyNote size={12} /> Notlarım
          </h3>
          <span className="text-[10px] text-slate-500">{notes.length}</span>
        </div>
        {notes.length === 0 ? (
          <p className="px-4 py-4 text-center text-xs text-slate-500">Not yok — sağ üstteki "Not" butonundan ekleyebilirsin.</p>
        ) : (
          <div className="grid divide-y divide-border md:grid-cols-2 md:divide-y-0 md:divide-x">
            {notes.slice(0, 6).map((n) => (
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
      </section>
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

/**
 * Fonun NAV performansını anchor noktalardan reconstruct edip çizgi grafik çizer.
 * Veri = bugünkü NAV + 1H/1A/3A/6A/YTD/1Y geri yansıtmalar.
 * Önce TEFAS sadece bu anchor return'leri verdiği için tam günlük history yok;
 * yine de eğilim ve büyüklük hakkında net bir görsel sağlar.
 */
function FundPerformanceChart({ fund }: { fund: TefasFundData }) {
  const today = new Date();
  const points: Array<{ date: string; label: string; nav: number; ts: number }> = [];

  const addPoint = (label: string, daysAgo: number, returnPct: number | null) => {
    if (returnPct == null) return;
    const d = new Date(today);
    d.setDate(d.getDate() - daysAgo);
    // pastNav × (1 + return/100) = todayNav  →  pastNav = todayNav / (1 + return/100)
    const pastNav = fund.nav / (1 + returnPct / 100);
    if (!Number.isFinite(pastNav) || pastNav <= 0) return;
    points.push({
      date: d.toISOString().slice(0, 10),
      label,
      nav: pastNav,
      ts: d.getTime(),
    });
  };

  // YTD için yıl başından geçen gün sayısı
  const ytdDays = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 1).getTime()) / 86_400_000);
  addPoint('1Y önce',   365, fund.returns['1y']);
  addPoint('Yılbaşı',   ytdDays, fund.returns.ytd);
  addPoint('6A önce',   180, fund.returns['6m']);
  addPoint('3A önce',   90,  fund.returns['3m']);
  addPoint('1A önce',   30,  fund.returns['1m']);
  addPoint('1H önce',   7,   fund.returns['1w']);

  // Bugün noktasını ekle
  points.push({
    date: fund.date || today.toISOString().slice(0, 10),
    label: 'Bugün',
    nav: fund.nav,
    ts: today.getTime(),
  });

  // Sıralı: eski → yeni
  points.sort((a, b) => a.ts - b.ts);

  if (points.length < 2) {
    return (
      <div className="text-center text-xs text-slate-500 py-8">
        Performans verisi yetersiz — grafik çizilemiyor.
      </div>
    );
  }

  const minNav = Math.min(...points.map((p) => p.nav));
  const maxNav = Math.max(...points.map((p) => p.nav));
  const pad = (maxNav - minNav) * 0.08;
  const firstNav = points[0].nav;
  const lastNav = points[points.length - 1].nav;
  const totalReturn = ((lastNav - firstNav) / firstNav) * 100;
  const isPositive = totalReturn >= 0;

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <TrendingUp size={14} className="text-accent" />
          NAV Performans Eğrisi
          <span className="text-[10px] font-normal text-slate-500">son 1 yıl • anchor noktalar</span>
        </h3>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">1Y toplam</div>
          <div className={`text-base font-bold tabular-nums ${isPositive ? 'text-success' : 'text-danger'}`}>
            {isPositive ? '+' : ''}{totalReturn.toFixed(2)}%
          </div>
        </div>
      </div>
      <FundLineSvg points={points} minNav={minNav} maxNav={maxNav} pad={pad} firstNav={firstNav} isPositive={isPositive} />
      <p className="mt-2 text-[10px] text-slate-500 leading-relaxed">
        ℹ️ Grafik, mevcut NAV ve TEFAS dönemsel getirilerinden geri-hesaplanan 7 anchor noktayı kullanır.
        Günlük NAV detayı için <a href={`https://www.tefas.gov.tr/FonAnaliz.aspx?FonKod=${fund.code}`} target="_blank" rel="noreferrer" className="text-accent hover:underline">TEFAS</a>.
      </p>
    </div>
  );
}

/** Native SVG çizgi grafik — recharts gerekmez, 7 anchor için yeter. */
function FundLineSvg({
  points,
  minNav,
  maxNav,
  pad,
  firstNav,
  isPositive,
}: {
  points: Array<{ date: string; label: string; nav: number; ts: number }>;
  minNav: number;
  maxNav: number;
  pad: number;
  firstNav: number;
  isPositive: boolean;
}) {
  const W = 800;
  const H = 200;
  const padX = 50;
  const padY = 24;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;
  const yMin = minNav - pad;
  const yMax = maxNav + pad;
  const yRange = yMax - yMin || 1;
  const stepX = innerW / Math.max(1, points.length - 1);

  const coords = points.map((p, i) => ({
    ...p,
    x: padX + i * stepX,
    y: padY + innerH - ((p.nav - yMin) / yRange) * innerH,
  }));

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${(padY + innerH).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(padY + innerH).toFixed(1)} Z`;

  const stroke = isPositive ? '#22c55e' : '#ef4444';
  const fill = isPositive ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)';

  // Referans çizgisi y koordinatı
  const refY = padY + innerH - ((firstNav - yMin) / yRange) * innerH;

  // 3 Y-axis tick
  const yTicks = [yMin + yRange * 0.1, yMin + yRange * 0.5, yMin + yRange * 0.9];

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-56" preserveAspectRatio="xMidYMid meet">
        {/* Y-axis tick labels + grid çizgileri */}
        {yTicks.map((v, i) => {
          const y = padY + innerH - ((v - yMin) / yRange) * innerH;
          return (
            <g key={`tick-${i}`}>
              <line x1={padX} x2={W - padX} y1={y} y2={y} stroke="rgba(31,42,68,0.5)" strokeDasharray="2 4" />
              <text x={padX - 6} y={y + 3} fill="#94a3b8" fontSize="10" textAnchor="end">
                {v.toFixed(4)}
              </text>
            </g>
          );
        })}

        {/* Başlangıç referans çizgisi (1Y önce NAV) */}
        <line x1={padX} x2={W - padX} y1={refY} y2={refY} stroke="#475569" strokeDasharray="3 3" strokeWidth="1" />

        {/* Area dolgusu */}
        <path d={areaPath} fill={fill} />

        {/* Çizgi */}
        <path d={linePath} fill="none" stroke={stroke} strokeWidth="2.5" />

        {/* Noktalar + label'lar */}
        {coords.map((c) => (
          <g key={c.label}>
            <circle cx={c.x} cy={c.y} r="4" fill={stroke} />
            <title>{c.label}: {c.nav.toFixed(6)}₺ ({c.date})</title>
          </g>
        ))}

        {/* X-axis label'ları */}
        {coords.map((c) => (
          <text
            key={`x-${c.label}`}
            x={c.x}
            y={H - 6}
            fill="#94a3b8"
            fontSize="10"
            textAnchor="middle"
          >
            {c.label}
          </text>
        ))}
      </svg>
    </div>
  );
}
