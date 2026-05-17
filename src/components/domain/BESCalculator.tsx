import { useMemo, useState } from 'react';
import { Calculator, TrendingUp, Info, ExternalLink, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * BES Birikim Hesaplayıcısı — EGM (Emeklilik Gözetim Merkezi) ile uyumlu.
 *
 * Hesaplama mantığı (her yıl için):
 *  1. Yıllık katkı = aylık × 12  (yıllık reel %X katkı payı artışıyla büyür)
 *  2. Yönetim gideri kesintisi = yıllık katkı × yönetim oranı (kesintiden sonra net yatırıma gider)
 *  3. Devlet katkısı = min(brüt yıllık katkı, BAU tavan) × %20
 *     - BAU tavanı her yıl reel %Y oranında artar
 *  4. Yıllık net reel getiri = reel getiri − FİGK (fon işletim gider kesintisi)
 *  5. Yıl sonu bakiye = (önceki bakiye + net katkı + devlet katkısı) × (1 + net reel getiri)
 *
 * Tüm oranlar REEL (enflasyondan arındırılmış). Sonuçlar bugünkü satın alma gücüyle gösterilir.
 */

const STATE_CONTRIBUTION_RATE = 0.20; // 2026: %30 → %20
// 2026 brüt asgari ücret yıllık tutarı (aylık ~33.000₺ × 12 ~ 396.000₺)
const INITIAL_ANNUAL_BAU_CAP = 396_000;

const SCENARIOS = [
  { key: 'pess', label: 'Kötümser', rate: 0.00, tone: 'danger',  hint: 'Reel %0 — fonlar enflasyonla başa baş' },
  { key: 'mid',  label: 'Orta',     rate: 0.03, tone: 'accent',  hint: 'Reel %3 — EGM varsayılan, uzun vadeli ortalama' },
  { key: 'opt',  label: 'İyimser',  rate: 0.05, tone: 'success', hint: 'Reel %5 — güçlü fon performansı dönemi' },
] as const;

type Scenario = typeof SCENARIOS[number];

interface CalcInputs {
  initialDeposit: number;             // başlangıçta tek seferlik yatırım (lump sum)
  monthlyContribution: number;
  years: number;
  contributionIncreaseRate: number;   // yıllık reel katkı artışı (örn 0.05 = %5)
  managementFeeRate: number;          // yıllık yönetim gideri kesintisi (örn 0.02 = %2)
  fundOperatingExpenseRate: number;   // FİGK yıllık (örn 0.01 = %1)
  bauIncreaseRate: number;            // yıllık reel BAU artışı (örn 0.03 = %3)
  realReturnRate: number;             // yıllık net reel getiri
}

interface Projection {
  initialDeposit: number;
  totalContributed: number;       // aylık katkılardan toplam (lump sum hariç)
  totalManagementFees: number;    // toplam yönetim gideri kesintisi
  totalStateContribution: number; // toplam devlet katkısı
  totalEarnings: number;          // bileşik kazanç (yönetim sonrası net)
  endBalance: number;             // yıl sonu birikim
  yearlySnapshot: number[];       // her yıl sonu bakiye
}

function project(p: CalcInputs): Projection {
  // Başlangıç yatırımı (lump sum) — yönetim gideri kesintisinden geçer
  // ama EGM'ye göre BES'te devlet katkısı yıllık katkı limitiyle hesaplanır,
  // tek seferlik büyük yatırım da yıllık katkı tavanına dahildir.
  const initialMgmtFee = p.initialDeposit * p.managementFeeRate;
  const initialNet = p.initialDeposit - initialMgmtFee;
  let balance = initialNet;

  let totalContributed = 0;
  let totalStateContribution = 0;
  let totalManagementFees = initialMgmtFee;
  let currentMonthly = p.monthlyContribution;
  let currentBauCap = INITIAL_ANNUAL_BAU_CAP;
  const netReturnRate = p.realReturnRate - p.fundOperatingExpenseRate;
  const yearlySnapshot: number[] = [];

  // İlk yılın katkısı: aylık × 12 + (initial deposit'in BAU tavanı içindeki kısmı için devlet katkısı)
  // BES'te yıllık katkı = düzenli + ek katkı; tavan altındaysa hepsine devlet katkısı uygulanır
  for (let y = 1; y <= p.years; y++) {
    const monthlyYearly = currentMonthly * 12;
    // 1. yıl: lump sum'u da yıllık katkıya ekle (devlet katkısı için)
    const totalYearlyForState = monthlyYearly + (y === 1 ? p.initialDeposit : 0);
    const eligibleForState = Math.min(totalYearlyForState, currentBauCap);
    const stateContribution = eligibleForState * STATE_CONTRIBUTION_RATE;

    const yearMgmtFee = monthlyYearly * p.managementFeeRate;
    const netContribution = monthlyYearly - yearMgmtFee;

    balance = (balance + netContribution + stateContribution) * (1 + netReturnRate);

    totalContributed += monthlyYearly;
    totalManagementFees += yearMgmtFee;
    totalStateContribution += stateContribution;
    yearlySnapshot.push(balance);

    // Sonraki yıl için reel artışlar
    currentMonthly *= 1 + p.contributionIncreaseRate;
    currentBauCap *= 1 + p.bauIncreaseRate;
  }

  // Bileşik kazanç = bakiye − (lump sum + aylık katkılar − yönetim gideri) − devlet katkısı
  const totalContributedAll = p.initialDeposit + totalContributed;
  const totalEarnings = balance - (totalContributedAll - totalManagementFees) - totalStateContribution;
  return {
    initialDeposit: p.initialDeposit,
    totalContributed,
    totalManagementFees,
    totalStateContribution,
    totalEarnings,
    endBalance: balance,
    yearlySnapshot,
  };
}

const formatTL = (n: number) =>
  n.toLocaleString('tr-TR', { maximumFractionDigits: 0 }) + '₺';

const formatCompactTL = (n: number) => {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + ' Mr ₺';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + ' M ₺';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'B ₺';
  return formatTL(n);
};

export function BESCalculator() {
  // Temel girdiler
  const [currentAge, setCurrentAge] = useState(31);
  const [retirementAge, setRetirementAge] = useState(56);
  const [monthly, setMonthly] = useState(2500);
  const [initialDeposit, setInitialDeposit] = useState(0);

  // Ek parametreler (EGM ile aynı varsayılanlar)
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [contribIncrease, setContribIncrease] = useState(5);   // % yıllık reel katkı artışı
  const [mgmtFee, setMgmtFee] = useState(2);                    // % yıllık yönetim gideri
  const [fundFee, setFundFee] = useState(1);                    // % FİGK
  const [bauIncrease, setBauIncrease] = useState(3);            // % yıllık reel BAU artışı

  // Senaryo getirileri (gelişmiş düzenleme)
  const [editRates, setEditRates] = useState(false);
  const [rates, setRates] = useState({ pess: 0, mid: 3, opt: 5 });

  const years = Math.max(0, retirementAge - currentAge);

  const projections = useMemo(() => {
    return SCENARIOS.map((s) => {
      const realReturn = (editRates ? rates[s.key as keyof typeof rates] : s.rate * 100) / 100;
      const projection = project({
        initialDeposit,
        monthlyContribution: monthly,
        years,
        contributionIncreaseRate: contribIncrease / 100,
        managementFeeRate: mgmtFee / 100,
        fundOperatingExpenseRate: fundFee / 100,
        bauIncreaseRate: bauIncrease / 100,
        realReturnRate: realReturn,
      });
      return { scenario: s, rate: realReturn, projection };
    });
  }, [initialDeposit, monthly, years, contribIncrease, mgmtFee, fundFee, bauIncrease, editRates, rates]);

  const yearlyContribution = monthly * 12;
  const yearlyStateContribution = Math.min(yearlyContribution, INITIAL_ANNUAL_BAU_CAP) * STATE_CONTRIBUTION_RATE;
  const isOverCap = yearlyContribution > INITIAL_ANNUAL_BAU_CAP;
  const yearsInvalid = years <= 0;

  return (
    <section className="glass-card overflow-hidden p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent/15 text-accent">
            <Calculator size={16} />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-slate-100">BES Birikim Hesaplayıcısı</h3>
            <p className="text-[11px] text-slate-500">
              EGM uyumlu — reel getiri, yönetim gideri, FİGK ve katkı artışı dahil
            </p>
          </div>
        </div>
        <a
          href="https://www.egm.org.tr/bilgi-merkezi/birikim-hesaplayicisi/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-bg-card px-2 py-1 text-[10px] text-slate-300 hover:border-accent/40 hover:text-accent"
        >
          EGM Hesaplayıcısı <ExternalLink size={10} />
        </a>
      </div>

      {/* Temel girdiler */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <NumberField label="Yaşınız" value={currentAge} min={18} max={70} step={1} suffix="yaş" onChange={setCurrentAge} />
        <NumberField label="Emeklilik Yaşı" value={retirementAge} min={Math.max(currentAge + 1, 30)} max={75} step={1} suffix="yaş" onChange={setRetirementAge} />
        <NumberField label="Aylık Katkı" value={monthly} min={0} step={500} suffix="₺" onChange={setMonthly} />
        <NumberField label="Başlangıç Yatırımı" value={initialDeposit} min={0} step={10_000} suffix="₺" onChange={setInitialDeposit} />
      </div>
      {initialDeposit > 0 && (
        <p className="mt-1 text-[10px] text-slate-500">
          ℹ️ Tek seferlik başlangıç tutarı sisteme gün-1'de eklenir; bileşik getiri tüm süre boyunca üzerine işler.
          1. yılda BAU tavanı içinde kaldığı kısma %20 devlet katkısı uygulanır.
        </p>
      )}
      <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
        <span>Süre: <strong className="text-accent">{years} yıl</strong></span>
        {yearsInvalid && (
          <span className="text-warning">⚠️ Emeklilik yaşı şu anki yaşından büyük olmalı</span>
        )}
      </div>

      {/* Devlet katkısı özeti */}
      <div className={cn(
        'mt-3 rounded-lg border p-3 text-xs',
        isOverCap ? 'border-warning/40 bg-warning/5' : 'border-success/30 bg-success/5',
      )}>
        <div className="flex items-start gap-2">
          <Info size={12} className={cn('mt-0.5 shrink-0', isOverCap ? 'text-warning' : 'text-success')} />
          <div className="flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-semibold text-slate-200">İlk yıl devlet katkın:</span>
              <span className="font-mono text-base font-bold text-success">{formatTL(yearlyStateContribution)}</span>
            </div>
            {isOverCap ? (
              <p className="mt-1 text-[10px] text-warning">
                ⚠️ Aylık <strong>{formatTL(INITIAL_ANNUAL_BAU_CAP / 12)}</strong> üstüne yaptığın katkıya devlet katkı yok. Tavan ileriki yıllarda BAU artışıyla büyür.
              </p>
            ) : (
              <p className="mt-1 text-[10px] text-slate-400">
                Yıllık {formatTL(yearlyContribution)} × %20 = {formatTL(yearlyStateContribution)}. BAU tavanının altındasın, tam yararlanıyorsun.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Ek Parametreler toggle */}
      <button
        type="button"
        onClick={() => setAdvancedOpen((v) => !v)}
        className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
      >
        <ChevronDown size={14} className={cn('transition', advancedOpen && 'rotate-180')} />
        {advancedOpen ? 'Ek Parametreleri Kapat' : 'Ek Parametreleri Göster'}
      </button>

      {advancedOpen && (
        <div className="mt-3 rounded-xl border border-border bg-bg-soft/60 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <PercentField
              label="Yıllık Katkı Payı Artışı"
              value={contribIncrease}
              min={0} max={20} step={0.5}
              onChange={setContribIncrease}
              hint="Katkı payının her yıl REEL olarak artacağı oran. Ortalama %5 (terfi/kıdem)."
            />
            <PercentField
              label="Yönetim Gideri Kesintisi"
              value={mgmtFee}
              min={0} max={5} step={0.1}
              onChange={setMgmtFee}
              hint="Ödediğin katkı payından kesilen oran. Kesinti sonrası yatırıma yönlendirilir."
            />
            <PercentField
              label="Fon İşletim Gider Kesintisi (FİGK)"
              value={fundFee}
              min={0} max={3} step={0.05}
              onChange={setFundFee}
              hint="Fon portföyünün giderlerini karşılamak için. Reel getiriden düşülür. Azami yıllık %2.28."
            />
            <PercentField
              label="Yıllık BAU Artışı"
              value={bauIncrease}
              min={0} max={10} step={0.5}
              onChange={setBauIncrease}
              hint="Brüt asgari ücretin yıllık reel artışı — devlet katkısı tavanını büyütür."
            />
          </div>

          <div className="mt-4 border-t border-border pt-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Senaryo Reel Getirileri
              </span>
              <button
                type="button"
                onClick={() => setEditRates((v) => !v)}
                className="text-[11px] text-accent hover:underline"
              >
                {editRates ? 'Varsayılana dön (0/3/5)' : 'Düzenle'}
              </button>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {SCENARIOS.map((s) => (
                <div key={s.key} className="rounded-lg border border-border bg-bg-card p-2">
                  <label className="block text-[10px] uppercase tracking-wider text-slate-500">
                    {s.label} (reel % / yıl)
                  </label>
                  <input
                    type="number"
                    value={editRates ? rates[s.key as keyof typeof rates] : s.rate * 100}
                    disabled={!editRates}
                    min={-5} max={20} step={0.5}
                    onChange={(e) =>
                      setRates((r) => ({ ...r, [s.key]: parseFloat(e.target.value) || 0 }))
                    }
                    className="input mt-1 text-sm py-1 px-2 disabled:opacity-60"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Sonuçlar */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {projections.map(({ scenario, rate, projection }) => (
          <ScenarioCard
            key={scenario.key}
            scenario={scenario}
            rate={rate}
            netRate={rate - fundFee / 100}
            projection={projection}
            years={years}
          />
        ))}
      </div>

      {/* Karşılaştırma tablosu */}
      <div className="mt-4 rounded-xl border border-border bg-bg-soft overflow-hidden">
        <div className="border-b border-border bg-bg-card px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Detaylı Karşılaştırma — {years} yıl projeksiyonu
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Senaryo</th>
                <th className="px-3 py-2 text-right">Reel Getiri</th>
                {initialDeposit > 0 && <th className="px-3 py-2 text-right">Başlangıç</th>}
                <th className="px-3 py-2 text-right">Aylık Katkılar</th>
                <th className="px-3 py-2 text-right">Yönetim Gideri</th>
                <th className="px-3 py-2 text-right">Devlet Katkısı</th>
                <th className="px-3 py-2 text-right">Bileşik Kazanç</th>
                <th className="px-3 py-2 text-right">Toplam Birikim</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-slate-200">
              {projections.map(({ scenario, rate, projection }) => (
                <tr key={scenario.key}>
                  <td className="px-3 py-2 font-semibold">
                    <span className={cn(
                      'inline-flex items-center gap-1.5',
                      scenario.tone === 'success' ? 'text-success' :
                      scenario.tone === 'danger' ? 'text-danger' : 'text-accent',
                    )}>
                      ● {scenario.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">%{(rate * 100).toFixed(1)}</td>
                  {initialDeposit > 0 && (
                    <td className="px-3 py-2 text-right tabular-nums text-slate-300">{formatTL(projection.initialDeposit)}</td>
                  )}
                  <td className="px-3 py-2 text-right tabular-nums">{formatTL(projection.totalContributed)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-danger">−{formatTL(projection.totalManagementFees)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-success">+{formatTL(projection.totalStateContribution)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-accent">+{formatTL(projection.totalEarnings)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold">{formatTL(projection.endBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
        ℹ️ Tüm oranlar <strong className="text-slate-400">reel</strong> (enflasyondan arındırılmış). Sonuçlar bugünkü satın alma gücüyle.
        Net getiri = reel getiri − FİGK. Devlet katkısı brüt değerdir; erken çıkış halinde hak ediş uygulanır (3 yıl %15, 6 yıl %35, 10 yıl %60, 56 yaş + 10 yıl %100).
        Karşılaştırma için <a className="text-accent hover:underline" href="https://www.egm.org.tr/bilgi-merkezi/birikim-hesaplayicisi/" target="_blank" rel="noreferrer">EGM resmi hesaplayıcısı</a>.
      </p>
    </section>
  );
}

function NumberField({
  label, value, min, max, step, suffix, onChange,
}: {
  label: string; value: number; min?: number; max?: number; step?: number;
  suffix?: string; onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-500">
        {label}
        {suffix && <span className="font-mono text-accent">{value.toLocaleString('tr-TR')} {suffix}</span>}
      </label>
      <div className="mt-1 flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(Math.max(min ?? 0, value - (step ?? 1)))}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border bg-bg-card text-slate-300 hover:border-accent/40 hover:text-accent"
        >−</button>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="input text-sm py-1 px-2 text-center"
        />
        <button
          type="button"
          onClick={() => onChange(max != null ? Math.min(max, value + (step ?? 1)) : value + (step ?? 1))}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border bg-bg-card text-slate-300 hover:border-accent/40 hover:text-accent"
        >+</button>
      </div>
    </div>
  );
}

function PercentField({
  label, value, min, max, step, hint, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number;
  hint?: string; onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="flex items-center justify-between text-[11px] font-medium text-slate-300">
        {label}
        <span className="font-mono text-accent">%{value.toFixed(2)}</span>
      </label>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="mt-2 w-full accent-accent"
      />
      <div className="flex items-center justify-between text-[10px] text-slate-500">
        <span>%{min}</span>
        <input
          type="number"
          value={value}
          min={min} max={max} step={step}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="input text-xs w-20 text-right py-1 px-2"
        />
        <span>%{max}</span>
      </div>
      {hint && <p className="mt-1 text-[10px] text-slate-500 leading-snug">{hint}</p>}
    </div>
  );
}

function ScenarioCard({
  scenario,
  rate,
  netRate,
  projection,
  years,
}: {
  scenario: Scenario;
  rate: number;
  netRate: number;
  projection: Projection;
  years: number;
}) {
  const borderTone =
    scenario.tone === 'success' ? 'border-success/40 bg-success/5'
    : scenario.tone === 'danger' ? 'border-danger/40 bg-danger/5'
    : 'border-accent/40 bg-accent/5';
  const labelTone =
    scenario.tone === 'success' ? 'text-success'
    : scenario.tone === 'danger' ? 'text-danger'
    : 'text-accent';

  return (
    <div className={cn('rounded-xl border p-4', borderTone)}>
      <div className="flex items-baseline justify-between">
        <span className={cn('text-[10px] font-bold uppercase tracking-wider', labelTone)}>
          {scenario.label}
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
          <TrendingUp size={10} /> reel %{(rate * 100).toFixed(1)}
        </span>
      </div>
      <div className="mt-2">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">
          {years} yıl sonra
        </div>
        <div className="mt-0.5 text-2xl font-bold tabular-nums text-slate-100">
          {formatCompactTL(projection.endBalance)}
        </div>
        <div className="text-[10px] text-slate-500">net reel getiri: %{(netRate * 100).toFixed(1)}/yıl</div>
      </div>
      <div className="mt-3 space-y-1 text-[11px]">
        {projection.initialDeposit > 0 && (
          <Row label="Başlangıç" value={formatCompactTL(projection.initialDeposit)} />
        )}
        <Row label="Aylık katkılar" value={formatCompactTL(projection.totalContributed)} />
        <Row label="Yönetim gideri" value={`−${formatCompactTL(projection.totalManagementFees)}`} tone="danger" />
        <Row label="Devlet katkısı" value={`+${formatCompactTL(projection.totalStateContribution)}`} tone="success" />
        <Row label="Bileşik kazanç" value={`+${formatCompactTL(projection.totalEarnings)}`} tone="accent" />
      </div>
      <p className="mt-2 text-[10px] text-slate-500">{scenario.hint}</p>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'accent' | 'danger' }) {
  const toneClass =
    tone === 'success' ? 'text-success'
    : tone === 'accent' ? 'text-accent'
    : tone === 'danger' ? 'text-danger'
    : 'text-slate-200';
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-slate-400">{label}</span>
      <span className={cn('font-mono font-semibold', toneClass)}>{value}</span>
    </div>
  );
}
