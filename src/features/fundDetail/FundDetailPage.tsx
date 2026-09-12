import { useParams, useNavigate, Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft, Landmark, ExternalLink, BarChart3, StickyNote, Trash2, AlertCircle, Radio, TrendingUp,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { NoteButton } from '@/components/domain/NoteButton';
import { AlertButton } from '@/components/domain/AlertButton';
import { ShareButton } from '@/components/ui/ShareButton';
import { MiniAreaChart } from '@/components/domain/PanelStyleChart';
import { fundsRepo, notesRepo, activityRepo } from '@/data/repositories';
import type { FundEntry } from '@/data/db';
import { formatDateTR, formatRelative } from '@/lib/date';
import { useEffect, useState, useMemo } from 'react';
import { fetchTefasFund, isTefasWorkerConfigured, type TefasFundDetail } from '@/data/api/tefasWorker';
import { fetchTefasFundByCode, isTefasGithubConfigured, computeTefasOpenClient, type TefasFundData } from '@/data/api/tefasGithub';
import { readRiskProfile, evaluateFundSuitability, type SuitabilityLevel } from '@/lib/riskProfile';
import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MiniMarkdown } from '@/lib/miniMarkdown';
import { FundComparisonChart } from '@/components/domain/FundComparisonChart';

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
  // Tab yapisi — A+B hibrit (kullanici talebi 12 Eyl 2026):
  // Ozet (kapsamli) + Portfoy Agi (network diagram bize ozgu) + Getiri + Bilgi
  type FundTab = 'ozet' | 'agi' | 'getiri' | 'bilgi';
  const [activeTab, setActiveTab] = useState<FundTab>('ozet');

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
  // Fintables link kaldirildi (kullanici talebi: baska site referanslari yok).

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
              <Landmark size={16} /> Fonlara git
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
        <div className="flex items-center gap-1">
          <AlertButton
            fund={{
              code: fundCode,
              name: githubData?.name ?? fund?.name,
              nav: githubData?.nav ?? liveData?.nav ?? 0,
            }}
          />
          <NoteButton symbol={fundCode} hint={`${fundCode} fonu için not`} />
          <ShareButton
            title={`${fundCode} — ${githubData?.name ?? fund?.name ?? 'Fon'} | InvestliQ`}
            text={`${fundCode} fon detayı: NAV, performans, portföy dağılımı`}
          />
        </div>
      </div>

      {/* Hero */}
      <div className="card relative mb-4 overflow-hidden p-6">
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-warning/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-warning/15 text-warning">
                <Landmark size={20} />
              </span>
              <h1 className="font-mono text-3xl font-bold tracking-tight text-slate-100">{fundCode}</h1>
              {fund.category && (
                <span className="rounded-md border border-border bg-bg-soft px-2 py-0.5 text-xs text-slate-300">
                  {fund.category}
                </span>
              )}
              {(() => {
                // TEFAS Kapali rozet: backend tefasOpen false VEYA client heuristic false
                const cat = githubData?.category ?? fund.category ?? '';
                const name = githubData?.name ?? fund.name ?? '';
                const backendOpen = githubData?.tefasOpen;
                const clientOpen = computeTefasOpenClient(cat, name);
                const isClosed = backendOpen === false || clientOpen === false;
                if (!isClosed) return null;
                return (
                  <span
                    className="rounded-md border border-danger/40 bg-danger/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-danger"
                    title="Bu fon TEFAS'ta islem gormez. SPK nitelikli yatirimci kosulu (10M TL+ net varlik) veya banka ozel fon olabilir. Fon kuruculusunun kendi platformundan veya yetkili araci kurumdan alinir."
                  >
                    TEFAS'ta Kapali
                  </span>
                );
              })()}
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

      {/* Risk Profili Uygunluk Rozeti — kullanici risk profili kaydetmisse */}
      {(() => {
        const saved = readRiskProfile();
        if (!saved) return null;
        const cat = githubData?.category ?? fund.category ?? '';
        const name = githubData?.name ?? fund.name ?? fundCode;
        const open = (githubData?.tefasOpen !== undefined)
          ? githubData.tefasOpen
          : (computeTefasOpenClient(cat, name) ?? undefined);
        const s = evaluateFundSuitability(cat, name, open, saved.profile);
        const styles: Record<SuitabilityLevel, { bg: string; border: string; text: string; Icon: typeof Info }> = {
          good:     { bg: 'bg-success/10',  border: 'border-success/40',  text: 'text-success',  Icon: CheckCircle2 },
          caution:  { bg: 'bg-warning/10',  border: 'border-warning/40',  text: 'text-warning',  Icon: AlertTriangle },
          mismatch: { bg: 'bg-orange-500/10', border: 'border-orange-500/40', text: 'text-orange-300', Icon: AlertTriangle },
          blocked:  { bg: 'bg-danger/10',   border: 'border-danger/40',   text: 'text-danger',   Icon: XCircle },
        };
        const cfg = styles[s.level];
        const labels: Record<SuitabilityLevel, string> = {
          good: 'Profilinize Uygun',
          caution: 'Profil Dışı — Çeşitlilik için olabilir',
          mismatch: 'Katılım İlkenizle Uyumsuz Olabilir',
          blocked: 'Şu Anda Alamazsınız',
        };
        return (
          <div className={cn('mb-4 flex items-start gap-3 rounded-lg border p-3', cfg.bg, cfg.border)}>
            <cfg.Icon size={20} className={cn('shrink-0 mt-0.5', cfg.text)} />
            <div className="flex-1 text-xs">
              <div className={cn('font-bold text-sm', cfg.text)}>{labels[s.level]}</div>
              <div className="mt-0.5 text-slate-300 leading-relaxed">{s.message}</div>
              <Link to="/risk-profili" className="mt-1 inline-block text-[11px] underline text-slate-400 hover:text-slate-200">
                Risk profilim ({saved.profile.label})
              </Link>
            </div>
          </div>
        );
      })()}

      {/* Tab strip — Ozet / Getiri Detayi / Portfoy Dagilimi / Bilgi */}
      <div className="mb-4 -mx-4 sm:mx-0">
        <div className="scrollbar-none flex gap-1.5 overflow-x-auto px-4 sm:px-0 pb-1.5">
          {([
            { k: 'ozet',    label: 'Özet',           icon: '📊' },
            { k: 'agi',     label: 'Portföy Ağı',    icon: '🕸️' },
            { k: 'getiri',  label: 'Getiri Detayı',  icon: '📈' },
            { k: 'bilgi',   label: 'Bilgiler',       icon: 'ℹ️' },
          ] as Array<{ k: FundTab; label: string; icon: string }>).map((t) => {
            const isActive = activeTab === t.k;
            return (
              <button
                key={t.k}
                type="button"
                onClick={() => setActiveTab(t.k)}
                className={cn(
                  'shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold transition',
                  isActive
                    ? 'border-accent/50 bg-accent/15 text-accent'
                    : 'border-border bg-bg-card/50 text-slate-300 hover:border-accent/30',
                )}
              >
                <span className="mr-1.5">{t.icon}</span>{t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* OZET TAB — Kapsamli dashboard (kompakt, tek ekran).
          Yapı: NAV + 6 period + Skor tek satir | Chart (sol) + Yandaki karlar (sag) | Getiri tablosu alt */}
      {activeTab === 'ozet' && githubData ? (
        <>
        {/* Ust seride: NAV big + 6 periyot + InvestliQ Skor kucuk chip */}
        <div className="mb-3 card p-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* NAV */}
            <div>
              <div className="text-[9px] uppercase tracking-wider text-slate-500 leading-none">NAV</div>
              <div className="mt-0.5 text-lg font-bold tabular-nums text-slate-100">
                {githubData.nav.toLocaleString('tr-TR', { maximumFractionDigits: 4 })}₺
              </div>
              <div className="text-[9px] text-slate-500">{githubData.date}</div>
            </div>
            <div className="h-8 w-px bg-border" />
            {/* Period returns compact */}
            <div className="flex flex-1 flex-wrap items-center gap-1.5">
              {[
                { k: '1w', l: '1 HAFTA' },
                { k: '1m', l: '1 AY' },
                { k: '3m', l: '3 AY' },
                { k: '6m', l: '6 AY' },
                { k: 'ytd', l: 'YTD' },
                { k: '1y', l: '1 YIL' },
              ].map(({ k, l }) => {
                const v = (githubData.returns as Record<string, number | null>)[k];
                const t = v == null ? 'text-slate-600' : v >= 0 ? 'text-success' : 'text-danger';
                return (
                  <div key={k} className="rounded border border-border bg-bg-soft/50 px-2 py-1 min-w-[70px]">
                    <div className="text-[8px] uppercase tracking-wider text-slate-500 leading-none">{l}</div>
                    <div className={cn('mt-0.5 text-xs font-semibold tabular-nums', t)}>
                      {v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* InvestliQ Skor kompakt chip */}
            {(() => {
              const ret1y = githubData.returns['1y'] ?? 0;
              const size = githubData.marketCap ? Math.min(30, Math.log10(githubData.marketCap / 1_000_000) * 10) : 5;
              const investors = githubData.investorCount ? Math.min(20, Math.log10(githubData.investorCount) * 5) : 5;
              const returnPart = Math.max(0, Math.min(35, ret1y / 3));
              const cat = (githubData.category ?? '').toLowerCase();
              const riskPenalty = cat.includes('serbest') || cat.includes('hisse') ? 5 : 0;
              const iqScore = Math.max(0, Math.min(100, Math.round(returnPart + size + investors + 15 - riskPenalty)));
              const iqTone = iqScore >= 70 ? 'text-success border-success/40 bg-success/10'
                : iqScore >= 40 ? 'text-warning border-warning/40 bg-warning/10'
                : 'text-danger border-danger/40 bg-danger/10';
              return (
                <div className={cn('rounded border px-2.5 py-1', iqTone)}>
                  <div className="text-[8px] uppercase tracking-wider leading-none opacity-80">InvestliQ Skor</div>
                  <div className="mt-0.5 flex items-baseline gap-1">
                    <span className="text-base font-bold tabular-nums">{iqScore}</span>
                    <span className="text-[9px] opacity-70">/100</span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Orta grid: Chart (sol) + Yandaki kartlar (sag) */}
        <div className="mb-3 grid gap-3 lg:grid-cols-3">
          {/* Chart */}
          <div className="card p-3 lg:col-span-2">
            <FundPerformanceChart fund={githubData} />
          </div>
          {/* Sag column: Varlık Dağılımı + Meta bilgi kartlari */}
          <div className="space-y-3">
            {/* Varlık Dağılımı — GitHub feed birinci (top 500 fonda var), Worker fallback */}
            {(() => {
              const alloc = githubData.allocation ?? liveData?.allocation ?? [];
              return (
                <div className="card p-3">
                  <div className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">Varlık Dağılımı</div>
                  {alloc && alloc.length > 0 ? (
                    <div className="space-y-1.5 text-xs">
                      {alloc.slice(0, 5).map((a) => (
                        <div key={a.label}>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-300 truncate">{a.label}</span>
                            <span className="tabular-nums text-accent">%{a.pct.toFixed(1)}</span>
                          </div>
                          <div className="mt-0.5 h-1 rounded-full bg-bg-soft overflow-hidden">
                            <div className="h-full bg-accent" style={{ width: `${Math.min(100, a.pct)}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-500 italic">
                      Portföy Ağı tab'ında görselleştirilir.<br/>Detay TEFAS'ta.
                    </div>
                  )}
                </div>
              );
            })()}
            {/* Kategori + Yönetim + Stopaj */}
            <div className="card p-3 space-y-2 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Kategori</span>
                <span className="font-semibold text-slate-200">{githubData.category || '—'}</span>
              </div>
              {githubData.marketCap && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Fon Büyüklüğü</span>
                  <span className="font-semibold tabular-nums text-slate-200">
                    {(githubData.marketCap / 1_000_000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}M ₺
                  </span>
                </div>
              )}
              {githubData.investorCount && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Yatırımcı</span>
                  <span className="font-semibold tabular-nums text-slate-200">
                    {githubData.investorCount.toLocaleString('tr-TR')}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Stopaj</span>
                <span className="font-semibold text-slate-200">%17.5</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">TEFAS</span>
                {(() => {
                  const backendOpen = githubData.tefasOpen;
                  const clientOpen = computeTefasOpenClient(githubData.category ?? '', githubData.name ?? '');
                  const isOpen = backendOpen !== false && clientOpen !== false;
                  return isOpen
                    ? <span className="font-semibold text-success">✓ Açık</span>
                    : <span className="font-semibold text-danger">✗ Kapalı</span>;
                })()}
              </div>
              {/* Katılım endeksi uygunluğu — kategori/isim ile hızlı kontrol */}
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Katılım Endeksi</span>
                {(() => {
                  const catName = `${githubData.category ?? ''} ${githubData.name ?? ''}`.toLowerCase();
                  const isKatilim = catName.includes('katılım') || catName.includes('katilim');
                  return isKatilim
                    ? <span className="font-semibold text-success">✓ Uyumlu</span>
                    : <span className="font-semibold text-slate-400">— Uyumsuz</span>;
                })()}
              </div>
              {/* Risk profil uygunlugu — kullanici risk profili kaydetmisse */}
              {(() => {
                const saved = readRiskProfile();
                if (!saved) {
                  return (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Profil Uyumu</span>
                      <Link to="/risk-profili" className="text-[10px] text-accent hover:underline">Profil oluştur →</Link>
                    </div>
                  );
                }
                const cat = githubData.category ?? '';
                const name = githubData.name ?? githubData.code;
                const open = githubData.tefasOpen ?? computeTefasOpenClient(cat, name) ?? undefined;
                const s = evaluateFundSuitability(cat, name, open, saved.profile);
                const cfg: Record<SuitabilityLevel, { text: string; label: string }> = {
                  good:     { text: 'text-success',  label: '✓ Uygun' },
                  caution:  { text: 'text-warning',  label: '△ Dikkat' },
                  mismatch: { text: 'text-orange-300', label: '△ Uyumsuz' },
                  blocked:  { text: 'text-danger',   label: '✗ Alınamaz' },
                };
                const c = cfg[s.level];
                return (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Profil Uyumu</span>
                    <span className={cn('font-semibold', c.text)} title={s.message}>
                      {c.label}
                    </span>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
        </>
      ) : activeTab === 'ozet' && isTefasWorkerConfigured() ? (
        liveLoading ? (
          <div className="mb-4 rounded-xl border border-accent/30 bg-accent/5 p-4 text-xs text-slate-400">
            TEFAS canlı veri çekiliyor (Cloudflare Worker → headless Chrome → TEFAS)…
          </div>
        ) : liveData?.nav ? (
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <div className="card p-4">
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Birim Pay Değeri (NAV)</div>
                <></>
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
      ) : activeTab === 'ozet' ? (
        <div className="mb-4 rounded-xl border border-accent/30 bg-accent/5 p-4 text-xs leading-relaxed text-slate-300">
          <strong>İpucu:</strong> GitHub Actions feed'i kurarsan bu sayfada canlı NAV ve performans gözükür.{' '}
          Projedeki <code className="rounded bg-bg-card px-1 font-mono">SETUP_GITHUB_TEFAS.md</code> dosyasını
          takip et (10 dk, ücretsiz, sadece GitHub hesabı yeter).
        </div>
      ) : null}

      {/* GETIRI DETAYI TAB — Fon-BIST/Doviz/Altin karsilastirma grafigi */}
      {activeTab === 'getiri' && githubData && (
        <div className="mb-4">
          <FundComparisonChart
            fundCode={githubData.code}
            fundName={githubData.name}
            fundReturns={{
              '1w': githubData.returns['1w'] ?? null,
              '1m': githubData.returns['1m'] ?? null,
              '3m': githubData.returns['3m'] ?? null,
              '6m': githubData.returns['6m'] ?? null,
              ytd: githubData.returns.ytd ?? null,
              '1y': githubData.returns['1y'] ?? null,
            }}
          />
        </div>
      )}
      {activeTab === 'getiri' && !githubData && (
        <div className="mb-4 rounded-xl border border-border bg-bg-soft/50 p-6 text-center text-xs text-slate-500">
          Getiri karşılaştırma için TEFAS verisi bekleniyor.
        </div>
      )}

      {/* PORTFOY AGI TAB — network diagram (bize ozgu, kullanici talebi A+B hibrit).
          Merkez: fon kodu · etrafinda: varlik siniflari (Hisse/Fon/Mevduat/vb.) daire buyuklugu = agirlik.
          Yesil = pozitif getiri, kirmizi = negatif (o siniftan varsa)
          Fon ici hisse bilgisi TEFAS'ta yaygin yok, o yuzden varlik kategorileri gosteriyoruz. */}
      {activeTab === 'agi' && (
        <div className="mb-4 card p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-slate-200">
              Portföy Ağı
              <span className="ml-2 text-[10px] font-normal text-slate-500">bize özgü görselleştirme</span>
            </h2>
            {liveData?.allocation && liveData.allocation.length > 0 && (
              <span className="text-[10px] text-slate-500">
                {liveData.allocation.length} varlık sınıfı
              </span>
            )}
          </div>
          <FundNetworkDiagram
            fundCode={fundCode}
            allocation={githubData?.allocation ?? liveData?.allocation ?? []}
            navReturn={githubData?.returns?.['1y'] ?? null}
          />
          <p className="mt-3 text-[10px] text-slate-500 leading-relaxed">
            🕸️ Merkez fon, etrafındaki daireler varlık sınıfları — çap = fon içi ağırlık.
            Yeşil çevre = fonun 1 yıllık pozitif getirisi, kırmızı = negatif.
          </p>
        </div>
      )}

      {/* BILGI TAB — Dis kaynaklar + Notlarim */}
      {activeTab === 'bilgi' && (
        <>
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
            </div>
          </section>

          {/* Notlarım — sadece Bilgi tab'inda */}
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
                <MiniMarkdown text={n.body} className="space-y-1 text-xs text-slate-300" />
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
      )}
    </>
  );
}

/**
 * FundNetworkDiagram — Fon Ağı (bize özgü görselleştirme).
 * Merkez = fon kodu · etrafında = varlık sınıfları
 * Her varlık daire çapı = ağırlık, çevre rengi = fon yıllık getirisine göre.
 * TEFAS fon içi hisse listesi vermiyor, o yüzden varlık kategorileri ile
 * network diagram cizip InvestliQ'nun ayirt edici gorseli olusturuyoruz.
 */
function FundNetworkDiagram({ fundCode, allocation, navReturn }: {
  fundCode: string;
  allocation: Array<{ label: string; pct: number }>;
  navReturn: number | null;
}) {
  if (allocation.length === 0) {
    return (
      <div className="grid place-items-center py-16 text-xs text-slate-500">
        <div className="text-center">
          <div className="text-4xl mb-3">🕸️</div>
          <div>Portföy dağılım verisi bekleniyor</div>
          <div className="mt-1 text-[10px]">TEFAS'ın açıkladığı varlık dağılımı geldiğinde otomatik doldurulur</div>
        </div>
      </div>
    );
  }
  const W = 700;
  const H = 500;
  const cx = W / 2;
  const cy = H / 2;
  const centerR = 55;
  // Etraftaki dairelerin yarıçapları — max ağırlık büyük olsun
  const maxPct = Math.max(...allocation.map((a) => a.pct));
  const positive = (navReturn ?? 0) >= 0;
  const stroke = positive ? '#22c55e' : '#ef4444';
  // Kategori bazli renk: hisse -> mor, fon -> emerald, mevduat -> gri, doviz -> mavi
  const categoryColor = (label: string): string => {
    const l = label.toLowerCase();
    if (l.includes('hisse')) return '#a855f7';
    if (l.includes('fon') || l.includes('katılım')) return '#10b981';
    if (l.includes('mevduat') || l.includes('kkm')) return '#94a3b8';
    if (l.includes('döviz') || l.includes('altın') || l.includes('gümüş')) return '#f59e0b';
    if (l.includes('tahvil') || l.includes('bono')) return '#3b82f6';
    return '#22c55e';
  };
  // Daireler çember üstünde eşit dağıtılır
  const orbitR = 180;
  const items = allocation.map((a, i) => {
    const angle = (i / allocation.length) * Math.PI * 2 - Math.PI / 2;
    const r = 20 + (a.pct / maxPct) * 30;
    const x = cx + Math.cos(angle) * orbitR;
    const y = cy + Math.sin(angle) * orbitR;
    return { ...a, x, y, r, color: categoryColor(a.label) };
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-96 sm:h-[500px]" style={{ display: 'block' }}>
      <defs>
        <radialGradient id="fnd-center" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35"/>
          <stop offset="100%" stopColor={stroke} stopOpacity="0.05"/>
        </radialGradient>
      </defs>
      {/* Bağlantı çizgileri — merkezden her aset'e */}
      {items.map((it) => (
        <line
          key={`ln-${it.label}`}
          x1={cx} y1={cy}
          x2={it.x} y2={it.y}
          stroke={stroke}
          strokeOpacity="0.25"
          strokeWidth="1"
        />
      ))}
      {/* Yörünge dairesi */}
      <circle cx={cx} cy={cy} r={orbitR} fill="none" stroke="rgba(148,163,184,0.1)" strokeDasharray="4 4"/>
      {/* Merkez fon çemberi */}
      <circle cx={cx} cy={cy} r={centerR} fill="url(#fnd-center)" stroke={stroke} strokeWidth="2"/>
      <text x={cx} y={cy - 4} fill="#f1f5f9" fontSize="16" fontWeight="700" textAnchor="middle" fontFamily="Inter, system-ui, sans-serif">
        {fundCode}
      </text>
      <text x={cx} y={cy + 14} fill="rgba(148,163,184,0.8)" fontSize="10" textAnchor="middle" fontFamily="Inter, system-ui, sans-serif">
        {navReturn != null ? `1Y ${navReturn >= 0 ? '+' : ''}${navReturn.toFixed(1)}%` : 'InvestliQ'}
      </text>
      {/* Varlık daireleri */}
      {items.map((it) => (
        <g key={it.label}>
          <circle cx={it.x} cy={it.y} r={it.r} fill={it.color} fillOpacity="0.20" stroke={it.color} strokeWidth="1.5"/>
          <text x={it.x} y={it.y - 3} fill="#f1f5f9" fontSize="10" fontWeight="600" textAnchor="middle" fontFamily="Inter, system-ui, sans-serif">
            {it.label.length > 12 ? it.label.slice(0, 12) + '…' : it.label}
          </text>
          <text x={it.x} y={it.y + 10} fill={it.color} fontSize="11" fontWeight="700" textAnchor="middle" fontFamily="Inter, system-ui, sans-serif">
            %{it.pct.toFixed(1)}
          </text>
        </g>
      ))}
    </svg>
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
  // Hisse detay chart'in aynisi (PanelStyleChart tarzi) — period switcher + MiniAreaChart.
  // NAV history: TEFAS'in gunluk history feed'i yok, bu yuzden anchor noktalar
  // kullaniyoruz (7 noktadan interpolate). Kullanici period sec, o araligi gorur.
  type PeriodKey = '1H' | '1A' | '3A' | '6A' | 'YTD' | '1Y';
  const [period, setPeriod] = useState<PeriodKey>('1Y');
  const today = new Date();
  const allPoints: Array<{ label: string; nav: number; ts: number }> = [];

  const addPoint = (label: string, daysAgo: number, returnPct: number | null) => {
    if (returnPct == null) return;
    const d = new Date(today);
    d.setDate(d.getDate() - daysAgo);
    const pastNav = fund.nav / (1 + returnPct / 100);
    if (!Number.isFinite(pastNav) || pastNav <= 0) return;
    allPoints.push({ label, nav: pastNav, ts: d.getTime() });
  };
  const ytdDays = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 1).getTime()) / 86_400_000);
  addPoint('1Y önce',  365, fund.returns['1y']);
  addPoint('Yılbaşı',  ytdDays, fund.returns.ytd);
  addPoint('6A önce',  180, fund.returns['6m']);
  addPoint('3A önce',   90, fund.returns['3m']);
  addPoint('1A önce',   30, fund.returns['1m']);
  addPoint('1H önce',    7, fund.returns['1w']);
  allPoints.push({ label: 'Bugün', nav: fund.nav, ts: today.getTime() });
  allPoints.sort((a, b) => a.ts - b.ts);

  // Period'a gore aralik cutoff (gun cinsinden)
  const PERIOD_DAYS: Record<PeriodKey, number> = {
    '1H': 7, '1A': 30, '3A': 90, '6A': 180, YTD: ytdDays, '1Y': 365,
  };
  const cutoff = today.getTime() - PERIOD_DAYS[period] * 86_400_000;
  const filteredPoints = allPoints.filter((p) => p.ts >= cutoff);
  const points = filteredPoints.length >= 2
    ? filteredPoints
    : allPoints.slice(-2); // en az 2 nokta garanti

  if (points.length < 2) {
    return (
      <div className="text-center text-xs text-slate-500 py-8">
        Performans verisi yetersiz — grafik çizilemiyor.
      </div>
    );
  }

  const firstNav = points[0].nav;
  const lastNav = points[points.length - 1].nav;
  const totalReturn = ((lastNav - firstNav) / firstNav) * 100;
  const isPositive = totalReturn >= 0;

  // MiniAreaChart formati {date, close}
  const chartData = points.map((p) => ({ date: p.ts, close: p.nav }));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <TrendingUp size={14} className="text-accent" />
          NAV Performans Eğrisi
        </h3>
        <div className="flex items-baseline gap-2">
          <span className={cn('text-xs font-semibold tabular-nums', isPositive ? 'text-success' : 'text-danger')}>
            {isPositive ? '+' : ''}{totalReturn.toFixed(2)}%
          </span>
          {/* Period switcher — hisse detay chart ile ayni gorsel */}
          <div className="flex gap-1">
            {(['1H', '1A', '3A', '6A', 'YTD', '1Y'] as PeriodKey[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={cn(
                  'rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition',
                  period === p
                    ? 'bg-accent/15 text-accent ring-1 ring-accent/30'
                    : 'text-slate-400 hover:bg-bg-soft hover:text-slate-200',
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>
      <MiniAreaChart
        data={chartData}
        positive={isPositive}
        formatValue={(v) => v.toLocaleString('tr-TR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
      />
      <p className="mt-2 text-[10px] text-slate-500 leading-relaxed">
        ℹ️ Grafik anchor noktalardan interpolate edilir. Günlük NAV detayı için
        {' '}<a href={`https://www.tefas.gov.tr/FonAnaliz.aspx?FonKod=${fund.code}`} target="_blank" rel="noreferrer" className="text-accent hover:underline">TEFAS</a>.
      </p>
    </div>
  );
}

/**
 * Fund line chart artik PanelStyleChart'in MiniAreaChart component'ini kullaniyor —
 * sitedeki tum grafiklerle bire bir ayni gorsel (emerald/red area + Y-axis + hover tooltip).
 * Anchor points {ts, nav} formatindan {date, close} formatina cevirip pass edilir.
 */
function FundLineSvg({
  points,
  isPositive,
}: {
  points: Array<{ date: string; label: string; nav: number; ts: number }>;
  minNav: number;
  maxNav: number;
  pad: number;
  firstNav: number;
  isPositive: boolean;
}) {
  const chartData = points.map((p) => ({ date: p.ts, close: p.nav }));
  return (
    <MiniAreaChart
      data={chartData}
      positive={isPositive}
      formatValue={(v) => v.toLocaleString('tr-TR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
    />
  );
}
