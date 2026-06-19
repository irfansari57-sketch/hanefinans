import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Shield, ArrowLeft, ArrowRight, RotateCcw, Sparkles, CheckCircle2, PieChart, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { PremiumCard } from '@/components/ui/PremiumCard';
import { SeoHead } from '@/components/seo/SeoHead';
import { cn } from '@/lib/utils';
import {
  buildRiskProfile,
  saveRiskProfile,
  readRiskProfile,
  clearRiskProfile,
  type RiskAnswers,
  type AgeBracket,
  type Horizon,
  type RiskTolerance,
  type Goal,
  type Experience,
  type RiskProfile,
} from '@/lib/riskProfile';
import { buildPortfolio, type PortfolioRecommendation } from '@/lib/portfolioBuilder';
import { loadFundsAsPerformance } from '@/data/api/tefasGithub';
import type { FundPerformance } from '@/data/types';

type StepKey = 'age' | 'horizon' | 'tolerance' | 'goal' | 'experience' | 'principle' | 'qualified';
const STEPS: StepKey[] = ['age', 'horizon', 'tolerance', 'goal', 'experience', 'principle', 'qualified'];

const QUESTIONS: Record<StepKey, {
  title: string;
  subtitle: string;
  options: Array<{ value: string; label: string; hint?: string }>;
}> = {
  age: {
    title: 'Yas araliginiz hangisi?',
    subtitle: 'Yas, yatirim ufkunu belirlemenin en onemli faktorudur.',
    options: [
      { value: 'under30', label: '30 yas altı', hint: 'Uzun yatırım ufku, yüksek risk alabilir' },
      { value: '30to45', label: '30 - 45', hint: 'Orta-uzun vade, dengeli risk' },
      { value: '45to60', label: '45 - 60', hint: 'Orta vade, ölçülü risk' },
      { value: 'over60', label: '60+ yas', hint: 'Kısa vade, sermaye koruma' },
    ],
  },
  horizon: {
    title: 'Yatirim vadeniz ne kadar?',
    subtitle: 'Ne kadar sure parayi yatirimda tutmayi planliyorsunuz?',
    options: [
      { value: 'lessThan1y', label: '1 yıldan az', hint: 'Acil ihtiyaç olabilir, düşük risk' },
      { value: '1to3y', label: '1 - 3 yıl', hint: 'Kısa orta vade' },
      { value: '3to10y', label: '3 - 10 yıl', hint: 'Uzun vade, fırsat zamanı' },
      { value: 'moreThan10y', label: '10 yıldan uzun', hint: 'Çok uzun vade, agresif uygun' },
    ],
  },
  tolerance: {
    title: 'Hangi kayıp seviyesi sizi rahatsız etmez?',
    subtitle: 'Piyasalar bazen düşer. Hangi geçici kayıp seviyesine tahammülünüz var?',
    options: [
      { value: 'loss10', label: '-%10 ya da daha az', hint: 'Düşük tolerans, sermaye koruma' },
      { value: 'loss20', label: '-%20', hint: 'Orta tolerans' },
      { value: 'loss30', label: '-%30', hint: 'Yüksek tolerans, agresif' },
      { value: 'loss50plus', label: '-%50+', hint: 'Çok yüksek tolerans, profesyonel' },
    ],
  },
  goal: {
    title: 'Yatirim amaciniz nedir?',
    subtitle: 'Ana hedefiniz hangi tarafa daha yakın?',
    options: [
      { value: 'preserve', label: 'Sermaye koruma', hint: 'Enflasyon karşısı koruma' },
      { value: 'income', label: 'Düzenli gelir', hint: 'Faiz/temettü odaklı' },
      { value: 'growth', label: 'Sermaye büyütme', hint: 'Uzun vadede artış' },
      { value: 'speculate', label: 'Spekülatif kazanç', hint: 'Yüksek getiri arayışı' },
    ],
  },
  experience: {
    title: 'Yatirim deneyiminiz var mi?',
    subtitle: 'Hangi seviyede yatirim bilgisine sahipsiniz?',
    options: [
      { value: 'beginner', label: 'Yeni', hint: 'İlk kez yatırım yapıyorum' },
      { value: 'intermediate', label: 'Orta', hint: '1-3 yıl deneyim' },
      { value: 'experienced', label: 'Tecrübeli', hint: '3+ yıl, aktif takip' },
      { value: 'professional', label: 'Profesyonel', hint: 'Türev araç, opsiyon deneyimi' },
    ],
  },
  principle: {
    title: 'Yatirim ilkeniz hangisi?',
    subtitle: 'Faiz/etik kisitlariniz var mi? Katilim Endeksi (faizsiz) ilkelerine uygun fonlar onerelim mi?',
    options: [
      { value: 'standard', label: 'Standart', hint: 'Tüm fon kategorileri uygun (faiz dahil)' },
      { value: 'participation', label: 'Katılım (Faizsiz)', hint: 'Sadece Katılım Endeksi, Altın ve Kıymetli Maden fonları' },
    ],
  },
  qualified: {
    title: 'SPK Nitelikli Yatirimci statunuz var mi?',
    subtitle:
      'SPK II-13.1 mevzuati uyarinca toplam yatirilabilir varligi 10 milyon TL+ (TL/doviz/altin/hisse/fon) olan kisiler nitelikli yatirimci sayilir. Bu statu Serbest fonlar (TEFAS Kapali) gibi nitelikli yatirimci sart fonlara erisim hakki verir.',
    options: [
      { value: 'no', label: 'Hayır / Bilmiyorum', hint: 'Sadece TEFAS\'ta açık fonlar önerilecek (varsayılan)' },
      { value: 'yes', label: 'Evet, nitelikli yatırımcıyım', hint: 'Serbest fonlar (TEFAS Kapalı) da öneriye dahil olacak' },
    ],
  },
};

export function RiskProfilePage() {
  const [stepIdx, setStepIdx] = useState(0);
  const [answers, setAnswers] = useState<Partial<RiskAnswers>>({});
  const [showResult, setShowResult] = useState(false);
  const [profile, setProfile] = useState<RiskProfile | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioRecommendation | null>(null);
  const [funds, setFunds] = useState<FundPerformance[]>([]);
  const [fundsLoading, setFundsLoading] = useState(true);

  // Onceden kaydedilmis profil varsa yukle (read-only sonuc gosterimi)
  useEffect(() => {
    const saved = readRiskProfile();
    if (saved) {
      setAnswers(saved.answers);
      setProfile(saved.profile);
      setShowResult(true);
    }
  }, []);

  // Fon listesini yukle (portfoy onerisi icin)
  useEffect(() => {
    let alive = true;
    loadFundsAsPerformance().then((r) => {
      if (!alive) return;
      if (r && r.funds) setFunds(r.funds);
      setFundsLoading(false);
    });
    return () => { alive = false; };
  }, []);

  // Profil + fonlar hazirsa portfoy uret
  useEffect(() => {
    if (profile && funds.length > 0) {
      setPortfolio(buildPortfolio(profile, funds));
    }
  }, [profile, funds]);

  const currentStep = STEPS[stepIdx];
  const currentQuestion = QUESTIONS[currentStep];
  const currentAnswer = answers[currentStep];
  const isAllAnswered = STEPS.every((s) => answers[s]);

  const handleAnswer = (value: string) => {
    setAnswers((prev) => ({ ...prev, [currentStep]: value }));
  };

  const handleNext = () => {
    if (stepIdx < STEPS.length - 1) {
      setStepIdx(stepIdx + 1);
    } else if (isAllAnswered) {
      // Profil hesabi
      const p = buildRiskProfile(answers as RiskAnswers);
      setProfile(p);
      saveRiskProfile(answers as RiskAnswers, p);
      setShowResult(true);
    }
  };

  const handlePrev = () => {
    if (stepIdx > 0) setStepIdx(stepIdx - 1);
  };

  const handleReset = () => {
    clearRiskProfile();
    setAnswers({});
    setProfile(null);
    setPortfolio(null);
    setShowResult(false);
    setStepIdx(0);
  };

  if (showResult && profile) {
    return (
      <>
        <SeoHead title="Risk Profili Sonucu" description="Kisisel risk profiliniz ve onerilen fon portfoyu." path="/risk-profili" />
        <PageHeader title="Risk Profilim" subtitle="Anket sonucunuza gore portfoy onerisi" />

        {/* Profil ozet karti */}
        <PremiumCard accent="cyan" hover="lift" density="comfortable" className="mb-4">
          <div className="flex items-start gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent">
              <Shield size={22} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-slate-100">{profile.label}</h2>
                <span className="rounded-md bg-accent/15 px-2 py-0.5 text-[10px] font-bold text-accent">
                  Skor: {profile.score}/100
                </span>
                {profile.principle === 'participation' && (
                  <span className="rounded-md bg-success/15 px-2 py-0.5 text-[10px] font-bold text-success">
                    Katılım (Faizsiz)
                  </span>
                )}
                {profile.qualified === 'yes' && (
                  <span className="rounded-md bg-purple-500/15 px-2 py-0.5 text-[10px] font-bold text-purple-300" title="SPK II-13.1 nitelikli yatirimci - Serbest fonlar dahil">
                    Nitelikli Yatırımcı
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-300 leading-relaxed">{profile.description}</p>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="rounded-md border border-border bg-bg-card px-2.5 py-1.5 text-[11px] font-medium text-slate-400 transition hover:border-warning/40 hover:text-warning"
            >
              <RotateCcw size={11} className="inline mr-1" /> Yenile
            </button>
          </div>

          {/* Skor cubugu */}
          <div className="mt-4">
            <div className="flex justify-between text-[10px] uppercase tracking-wider text-slate-500 mb-1">
              <span>Konservatif</span>
              <span>Agresif</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-bg-card">
              <div
                className="h-full bg-gradient-to-r from-success via-accent to-danger transition-all"
                style={{ width: `${profile.score}%` }}
              />
            </div>
          </div>
        </PremiumCard>

        {/* Kategori dagilimi */}
        <PremiumCard accent="cyan" density="comfortable" className="mb-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <PieChart size={14} className="text-accent" />
            Onerilen Kategori Dagilimi
          </h3>
          <div className="mt-3 space-y-2">
            {Object.entries(profile.weights).map(([cat, weight]) => (
              <div key={cat} className="flex items-center gap-3">
                <span className="w-32 text-[11px] text-slate-400 truncate">{cat}</span>
                <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-bg-card">
                  <div className="h-full bg-accent" style={{ width: `${weight}%` }} />
                </div>
                <span className="w-12 text-right text-[11px] font-semibold tabular-nums text-slate-300">%{weight}</span>
              </div>
            ))}
          </div>
        </PremiumCard>

        {/* Onerilen fonlar */}
        <PremiumCard accent="success" density="comfortable" className="mb-4">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <Sparkles size={14} className="text-success" />
              Onerilen Portfoy ({portfolio?.count ?? 0} fon)
            </h3>
            {fundsLoading && <span className="text-[10px] text-slate-500">Yukleniyor...</span>}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Risk profilinize uygun, sadece TEFAS uzerinden alinabilen fonlardan secilmistir. Son 1 yil performansa gore siralanmistir.
          </p>

          {portfolio && portfolio.funds.length > 0 ? (
            <div className="mt-3 space-y-2">
              {portfolio.funds.map((rec, i) => (
                <Link
                  key={rec.fund.code}
                  to={`/fund/${rec.fund.code}`}
                  className="block rounded-lg border border-border bg-bg-card p-3 transition hover:border-accent/40 hover:bg-bg-card/80"
                >
                  <div className="flex items-start gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-accent/15 text-[11px] font-bold text-accent">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-bold text-accent">{rec.fund.code}</span>
                        <span className="rounded border border-border px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-slate-400">
                          {rec.category}
                        </span>
                        <span className="rounded bg-success/15 px-1.5 py-0.5 text-[10px] font-bold text-success">
                          %{rec.weightPct}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-[11px] text-slate-400">{rec.fund.name}</p>
                      <p className="mt-1 text-[10px] text-slate-500">{rec.rationale}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={cn('text-sm font-bold tabular-nums', (rec.fund.year ?? 0) >= 0 ? 'text-success' : 'text-danger')}>
                        {(rec.fund.year ?? 0) >= 0 ? '+' : ''}{(rec.fund.year ?? 0).toFixed(1)}%
                      </div>
                      <div className="text-[9px] text-slate-500">1Y</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            !fundsLoading && (
              <div className="mt-3 rounded-lg border border-border bg-bg-soft p-4 text-center text-xs text-slate-500">
                Fon verileri yuklenemedi. Sayfayi yenileyin.
              </div>
            )
          )}
        </PremiumCard>

        {/* SPK / SPL mevzuat uyarisi — yatirim tavsiyesi degildir */}
        <div className="rounded-xl border-2 border-warning/50 bg-warning/10 p-4 mt-4">
          <div className="flex items-start gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-warning/20 text-warning">
              <AlertTriangle size={18} />
            </div>
            <div className="flex-1 space-y-2 text-xs leading-relaxed">
              <div className="font-bold text-warning text-sm uppercase tracking-wider">
                Önemli Bilgilendirme — Yatırım Tavsiyesi Değildir
              </div>
              <p className="text-slate-200">
                Bu sayfadaki tüm öneriler, kişisel risk profil anketinizden ve TEFAS açık verilerinden
                üretilen <strong>bilgilendirici analizdir</strong>. SPK mevzuatı çerçevesinde
                <strong> yatırım tavsiyesi sayılmaz</strong>.
              </p>
              <p className="text-slate-300">
                Geçmiş getiriler gelecekteki performansın garantisi değildir. Yatırım kararlarınızı
                kendi araştırmanız ve risk değerlendirmenizle alınız; gerektiğinde{' '}
                <strong className="text-slate-100">SPK lisanslı bir yatırım danışmanına</strong>{' '}
                danışınız.
              </p>
              <p className="text-[11px] text-slate-400 pt-1 border-t border-warning/20">
                Hane Finans, Sermaye Piyasası Kurulu (SPK) tarafından yatırım danışmanlığı yetkisi
                verilen bir kuruluş değildir. SPK&apos;nın yetkili kuruluş listesi için:{' '}
                <a href="https://www.spk.gov.tr/Sayfa/AltSayfa/187" target="_blank" rel="noreferrer"
                  className="text-accent underline hover:text-accent/80">
                  spk.gov.tr
                </a>
              </p>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Anket akisi
  return (
    <>
      <SeoHead title="Risk Profili Anketi" description="6 soruda kisisel risk profilinizi ve yatirim ilkenizi ogrenip portfoy onerisi alin." path="/risk-profili" />
      <PageHeader title="Risk Profili" subtitle="6 soruda kisisel yatirim profilinizi olusturun" />

      {/* Ilerleme barı */}
      <div className="mb-4">
        <div className="flex justify-between text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">
          <span>Adım {stepIdx + 1} / {STEPS.length}</span>
          <span>{Math.round(((stepIdx + (currentAnswer ? 1 : 0)) / STEPS.length) * 100)}% tamamlandi</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-bg-card">
          <div
            className="h-full bg-accent transition-all"
            style={{ width: `${((stepIdx + (currentAnswer ? 1 : 0)) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      <PremiumCard accent="cyan" hover="lift" density="comfortable" className="mb-4">
        <h2 className="text-base font-bold text-slate-100">{currentQuestion.title}</h2>
        <p className="mt-1 text-xs text-slate-400">{currentQuestion.subtitle}</p>

        <div className="mt-4 space-y-2">
          {currentQuestion.options.map((opt) => {
            const isSelected = currentAnswer === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleAnswer(opt.value)}
                className={cn(
                  'w-full rounded-lg border p-3 text-left transition',
                  isSelected
                    ? 'border-accent bg-accent/10 shadow-sm shadow-accent/20'
                    : 'border-border bg-bg-card hover:border-accent/40 hover:bg-bg-card/80',
                )}
              >
                <div className="flex items-start gap-3">
                  <span className={cn(
                    'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition',
                    isSelected ? 'border-accent bg-accent text-bg' : 'border-slate-600 text-transparent',
                  )}>
                    {isSelected && <CheckCircle2 size={12} />}
                  </span>
                  <div className="flex-1">
                    <div className={cn('text-sm font-medium', isSelected ? 'text-accent' : 'text-slate-200')}>
                      {opt.label}
                    </div>
                    {opt.hint && (
                      <p className="mt-0.5 text-[11px] text-slate-500">{opt.hint}</p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </PremiumCard>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handlePrev}
          disabled={stepIdx === 0}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-soft px-3 py-2 text-xs font-medium text-slate-400 transition hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ArrowLeft size={12} /> Geri
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={!currentAnswer}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-xs font-bold text-accent-fg shadow-md shadow-accent/20 transition hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {stepIdx === STEPS.length - 1 ? 'Profilimi Olustur' : 'Devam'} <ArrowRight size={12} />
        </button>
      </div>
    </>
  );
}
