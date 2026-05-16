import { useMemo, useState } from 'react';
import { Calculator, TrendingUp, Info, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * BES Birikim Hesaplayıcısı.
 *
 * Mantık (EGM Emeklilik Gözetim Merkezi metoduyla uyumlu):
 *  - Aylık katkı × 12 = yıllık katkı
 *  - Yıllık brüt asgari ücret tavanına kadar olan katkıya devlet %20 ekler
 *  - Tavan üstü katkıya devlet katkısı YOK (sadece kendin biriktirirsin)
 *  - Her yıl sonunda toplam birikim = (önceki birikim + yıllık katkı + devlet katkısı) × (1 + yıllık getiri)
 *  - 3 senaryo: kötümser / orta / iyimser yıllık getiri
 *
 * Not: Yönetim/giriş kesintileri ve enflasyon basitlik için ihmal edilmiştir
 * (kullanıcı nominal getiri girer). Detaylı kesinti için EGM hesaplayıcısı linkini sunuyoruz.
 */

const STATE_CONTRIBUTION_RATE = 0.20; // 2026 başı itibariyle %20
// 2026 brüt asgari ücret ≈ 33.000₺/ay → yıllık katkı tavanı ≈ 396.000₺
// (Tavanın üstüne devlet katkısı yapmaz. Yıl içinde değişir, yaklaşık değer.)
const ANNUAL_BRUT_MINIMUM_WAGE_2026 = 396_000;

const SCENARIOS = [
  { key: 'pess', label: 'Kötümser', rate: 0.15, tone: 'danger',  hint: 'Borçlanma ağırlıklı muhafazakar fon, düşük dönem' },
  { key: 'mid',  label: 'Orta',     rate: 0.25, tone: 'accent',  hint: 'Karma fon, uzun vadeli BES ortalaması' },
  { key: 'opt',  label: 'İyimser',  rate: 0.35, tone: 'success', hint: 'Hisse ağırlıklı agresif fon, güçlü dönem' },
] as const;

type Scenario = typeof SCENARIOS[number];

interface Projection {
  totalContributed: number;     // sadece sen yatırdın
  totalStateContribution: number; // devlet katkısı (hak ediş düşülmeden, brüt)
  totalEarnings: number;        // bileşik faizden gelen kazanç
  endBalance: number;           // yıl sonu toplam birikim
  yearlySnapshot: number[];     // her yılın sonu birikim — chart için
}

function projectScenario(monthly: number, years: number, annualRate: number): Projection {
  const yearlyContribution = monthly * 12;
  const eligibleForState = Math.min(yearlyContribution, ANNUAL_BRUT_MINIMUM_WAGE_2026);
  const yearlyStateContribution = eligibleForState * STATE_CONTRIBUTION_RATE;

  let balance = 0;
  let totalContributed = 0;
  let totalStateContribution = 0;
  const yearlySnapshot: number[] = [];

  for (let y = 1; y <= years; y++) {
    balance = (balance + yearlyContribution + yearlyStateContribution) * (1 + annualRate);
    totalContributed += yearlyContribution;
    totalStateContribution += yearlyStateContribution;
    yearlySnapshot.push(balance);
  }

  const totalEarnings = balance - totalContributed - totalStateContribution;
  return { totalContributed, totalStateContribution, totalEarnings, endBalance: balance, yearlySnapshot };
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
  const [monthly, setMonthly] = useState(2500);
  const [years, setYears] = useState(20);
  const [advanced, setAdvanced] = useState(false);
  const [rates, setRates] = useState({ pess: 15, mid: 25, opt: 35 });

  const projections = useMemo(() => {
    return SCENARIOS.map((s) => {
      const rate = (advanced ? rates[s.key as keyof typeof rates] : s.rate * 100) / 100;
      return { scenario: s, rate, projection: projectScenario(monthly, years, rate) };
    });
  }, [monthly, years, advanced, rates]);

  const yearlyContribution = monthly * 12;
  const yearlyContributionEligible = Math.min(yearlyContribution, ANNUAL_BRUT_MINIMUM_WAGE_2026);
  const yearlyStateContribution = yearlyContributionEligible * STATE_CONTRIBUTION_RATE;
  const isOverCap = yearlyContribution > ANNUAL_BRUT_MINIMUM_WAGE_2026;

  return (
    <section className="glass-card overflow-hidden p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent/15 text-accent">
            <Calculator size={16} />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-slate-100">BES Birikim Hesaplayıcısı</h3>
            <p className="text-[11px] text-slate-500">
              Aylık katkı + %20 devlet katkısı + bileşik getiri ile geleceği projeksiyonla
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

      {/* Girdiler */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-500">
            Aylık Katkı
            <span className="font-mono text-accent">{formatTL(monthly)}</span>
          </label>
          <input
            type="range"
            min={500}
            max={50_000}
            step={500}
            value={monthly}
            onChange={(e) => setMonthly(parseInt(e.target.value, 10))}
            className="mt-2 w-full accent-accent"
          />
          <div className="flex items-center justify-between text-[10px] text-slate-500">
            <span>500₺</span>
            <input
              type="number"
              value={monthly}
              min={0}
              step={100}
              onChange={(e) => setMonthly(Math.max(0, parseInt(e.target.value, 10) || 0))}
              className="input text-xs w-24 text-right py-1 px-2"
            />
            <span>50.000₺</span>
          </div>
        </div>
        <div>
          <label className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-500">
            Süre
            <span className="font-mono text-accent">{years} yıl</span>
          </label>
          <input
            type="range"
            min={3}
            max={40}
            step={1}
            value={years}
            onChange={(e) => setYears(parseInt(e.target.value, 10))}
            className="mt-2 w-full accent-accent"
          />
          <div className="flex items-center justify-between text-[10px] text-slate-500">
            <span>3 yıl</span>
            <span>40 yıl</span>
          </div>
        </div>
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
              <span className="font-semibold text-slate-200">Bu katkı için yıllık devlet katkın:</span>
              <span className="font-mono text-base font-bold text-success">{formatTL(yearlyStateContribution)}</span>
            </div>
            {isOverCap ? (
              <p className="mt-1 text-[10px] text-warning">
                ⚠️ Aylık <strong>{formatTL(ANNUAL_BRUT_MINIMUM_WAGE_2026 / 12)}</strong> üstüne yaptığın katkıya devlet katkı sağlamıyor (2026 brüt asgari ücret tavanı).
              </p>
            ) : (
              <p className="mt-1 text-[10px] text-slate-400">
                Yıllık katkı: {formatTL(yearlyContribution)} × %20 = {formatTL(yearlyStateContribution)} devlet katkısı. Brüt asgari ücret tavanı altında kaldığın için tam yararlanıyorsun.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Gelişmiş ayarlar */}
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setAdvanced((a) => !a)}
          className="text-[11px] text-accent hover:underline"
        >
          {advanced ? '− Senaryo getirilerini gizle' : '+ Senaryo getirilerini ayarla'}
        </button>
        {advanced && (
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {SCENARIOS.map((s) => (
              <div key={s.key} className="rounded-lg border border-border bg-bg-card p-2">
                <label className="block text-[10px] uppercase tracking-wider text-slate-500">
                  {s.label} (% yıllık)
                </label>
                <input
                  type="number"
                  value={rates[s.key as keyof typeof rates]}
                  min={0}
                  max={100}
                  step={1}
                  onChange={(e) =>
                    setRates((r) => ({ ...r, [s.key]: parseFloat(e.target.value) || 0 }))
                  }
                  className="input mt-1 text-sm py-1 px-2"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sonuçlar — 3 senaryo */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {projections.map(({ scenario, rate, projection }) => (
          <ScenarioCard
            key={scenario.key}
            scenario={scenario}
            rate={rate}
            projection={projection}
          />
        ))}
      </div>

      {/* Karşılaştırma tablosu */}
      <div className="mt-4 rounded-xl border border-border bg-bg-soft overflow-hidden">
        <div className="border-b border-border bg-bg-card px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Detaylı Karşılaştırma
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Senaryo</th>
                <th className="px-3 py-2 text-right">Yıllık Getiri</th>
                <th className="px-3 py-2 text-right">Senin Yatırdığın</th>
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
                  <td className="px-3 py-2 text-right tabular-nums">%{(rate * 100).toFixed(0)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatTL(projection.totalContributed)}</td>
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
        ⚠️ <strong>Not:</strong> Hesaplamalar nominal (enflasyon dahil) getirilerdir; yönetim ücretleri ve giriş kesintileri ihmal edilmiştir.
        Devlet katkısı brüt değerle gösterilmiştir — erken çıkış halinde hak ediş oranı uygulanır (3 yıl %15, 6 yıl %35, 10 yıl %60, 56 yaş + 10 yıl %100).
        Daha hassas hesaplama için <a className="text-accent hover:underline" href="https://www.egm.org.tr/bilgi-merkezi/birikim-hesaplayicisi/" target="_blank" rel="noreferrer">EGM resmi hesaplayıcısını</a> kullanabilirsin.
      </p>
    </section>
  );
}

function ScenarioCard({
  scenario,
  rate,
  projection,
}: {
  scenario: Scenario;
  rate: number;
  projection: Projection;
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
          <TrendingUp size={10} /> %{(rate * 100).toFixed(0)}/yıl
        </span>
      </div>
      <div className="mt-2">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">Toplam Birikim</div>
        <div className="mt-0.5 text-2xl font-bold tabular-nums text-slate-100">
          {formatCompactTL(projection.endBalance)}
        </div>
      </div>
      <div className="mt-3 space-y-1 text-[11px]">
        <Row label="Senin yatırdığın" value={formatCompactTL(projection.totalContributed)} />
        <Row label="Devlet katkısı" value={`+${formatCompactTL(projection.totalStateContribution)}`} tone="success" />
        <Row label="Bileşik kazanç" value={`+${formatCompactTL(projection.totalEarnings)}`} tone="accent" />
      </div>
      <p className="mt-2 text-[10px] text-slate-500">{scenario.hint}</p>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'accent' }) {
  const toneClass = tone === 'success' ? 'text-success' : tone === 'accent' ? 'text-accent' : 'text-slate-200';
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-slate-400">{label}</span>
      <span className={cn('font-mono font-semibold', toneClass)}>{value}</span>
    </div>
  );
}
