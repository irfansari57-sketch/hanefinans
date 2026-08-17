import { useMemo, useState } from 'react';
import { Home, Car, ShoppingBag, Info, TrendingDown, Wallet, Calendar, Percent } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Finansman (Kredi) Hesaplayıcı — Konut / Taşıt / İhtiyaç
 *
 * Bankacılık kuralları (2026 TR — güncel oranlar):
 *  - Konut kredisi:     KKDF %0, BSMV %0 (istisna kapsamında)
 *                       Max vade 240 ay, faiz %2.5-4/ay aralığı
 *  - Taşıt kredisi:     KKDF %15, BSMV %15, Max vade 48 ay, faiz %3.5-5/ay
 *  - İhtiyaç kredisi:   KKDF %15, BSMV %15, Max vade 36 ay, faiz %4-6/ay
 *
 * Formül (eşit taksitli - annuity):
 *   Efektif aylık faiz: r_ef = r_base * (1 + KKDF + BSMV)
 *   Aylık taksit:       A = P * r_ef * (1+r_ef)^n / ((1+r_ef)^n - 1)
 *   Toplam ödeme:       A * n
 *   Toplam faiz+vergi:  A*n - P
 *
 * Sadece bilgi amaçlı — kesin oran ve tutar için banka teklifi al.
 */

type LoanKind = 'konut' | 'tasit' | 'ihtiyac';

interface LoanConfig {
  label: string;
  icon: typeof Home;
  color: string;
  defaultAmount: number;
  defaultTerm: number;
  defaultRate: number;
  maxTerm: number;
  kkdf: number;   // 0.00 - 0.15
  bsmv: number;   // 0.00 - 0.05
  note: string;
}

const LOANS: Record<LoanKind, LoanConfig> = {
  konut: {
    label: 'Konut Kredisi',
    icon: Home,
    color: 'text-emerald-400 bg-emerald-500/15',
    defaultAmount: 2_000_000,
    defaultTerm: 120,
    defaultRate: 2.99,
    maxTerm: 240,
    kkdf: 0,
    bsmv: 0,
    note: 'İlk konut alımında KKDF ve BSMV muafiyeti uygulanır (istisna kapsamı). Dosya masrafı, ekspertiz, DASK ve tapu harcı ayrı ödenir.',
  },
  tasit: {
    label: 'Taşıt Kredisi',
    icon: Car,
    color: 'text-blue-400 bg-blue-500/15',
    defaultAmount: 500_000,
    defaultTerm: 36,
    defaultRate: 4.29,
    maxTerm: 48,
    kkdf: 0.15,
    bsmv: 0.15,
    note: 'KKDF %15 + BSMV %15 = toplam %30 vergi yükü faize eklenir. Kasko zorunlu, dosya masrafı ayrı.',
  },
  ihtiyac: {
    label: 'İhtiyaç Kredisi',
    icon: ShoppingBag,
    color: 'text-amber-400 bg-amber-500/15',
    defaultAmount: 100_000,
    defaultTerm: 24,
    defaultRate: 4.99,
    maxTerm: 36,
    kkdf: 0.15,
    bsmv: 0.15,
    note: 'KKDF %15 + BSMV %15 = toplam %30 vergi yükü. Vade en fazla 36 ay. Erken kapama tazminatı vade ve tutara göre %2 civarındadır.',
  },
};

function formatMoney(v: number): string {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(Math.round(v));
}

interface CalcResult {
  monthlyPayment: number;
  totalPayment: number;
  totalInterest: number;
  effectiveRate: number; // aylık %
  amortization: Array<{ month: number; interest: number; principal: number; balance: number }>;
}

function computeLoan(amount: number, monthlyRate: number, term: number, kkdf: number, bsmv: number): CalcResult {
  const r_base = monthlyRate / 100;
  const r_ef = r_base * (1 + kkdf + bsmv);
  const n = term;
  const P = amount;

  if (r_ef <= 0 || n <= 0 || P <= 0) {
    return { monthlyPayment: 0, totalPayment: 0, totalInterest: 0, effectiveRate: 0, amortization: [] };
  }

  const factor = Math.pow(1 + r_ef, n);
  const A = (P * r_ef * factor) / (factor - 1);
  const total = A * n;

  // Amortisman — sadece ilk 6 + son 3 + toplam gösterelim compact
  const schedule: CalcResult['amortization'] = [];
  let balance = P;
  for (let i = 1; i <= n; i++) {
    const interest = balance * r_ef;
    const principal = A - interest;
    balance -= principal;
    schedule.push({ month: i, interest, principal, balance: Math.max(0, balance) });
  }

  return {
    monthlyPayment: A,
    totalPayment: total,
    totalInterest: total - P,
    effectiveRate: r_ef * 100,
    amortization: schedule,
  };
}

export function LoanCalculator() {
  const [kind, setKind] = useState<LoanKind>('konut');
  const cfg = LOANS[kind];
  const [amount, setAmount] = useState(cfg.defaultAmount);
  const [term, setTerm] = useState(cfg.defaultTerm);
  const [rate, setRate] = useState(cfg.defaultRate);
  const [showAmortization, setShowAmortization] = useState(false);

  // Tab değişince default'lara sıfırla
  const setKindWithDefaults = (k: LoanKind) => {
    setKind(k);
    setAmount(LOANS[k].defaultAmount);
    setTerm(LOANS[k].defaultTerm);
    setRate(LOANS[k].defaultRate);
    setShowAmortization(false);
  };

  const result = useMemo(
    () => computeLoan(amount, rate, term, cfg.kkdf, cfg.bsmv),
    [amount, rate, term, cfg.kkdf, cfg.bsmv],
  );

  // Amortisman gösterim: ilk 6, son 3
  const amortDisplay = useMemo(() => {
    if (!showAmortization || result.amortization.length === 0) return [];
    const total = result.amortization.length;
    if (total <= 12) return result.amortization;
    return [
      ...result.amortization.slice(0, 6),
      { month: -1, interest: 0, principal: 0, balance: 0 }, // separator
      ...result.amortization.slice(total - 3),
    ];
  }, [showAmortization, result.amortization]);

  return (
    <section className="glass-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <Wallet size={18} className="text-accent" />
        <h3 className="text-base font-bold text-slate-100">Finansman Hesaplayıcısı</h3>
        <span className="ml-auto text-[10px] text-slate-500">Eşit taksitli · KKDF+BSMV dahil</span>
      </div>

      {/* Tab seçici */}
      <div className="mb-4 grid grid-cols-3 gap-1.5">
        {(Object.keys(LOANS) as LoanKind[]).map((k) => {
          const c = LOANS[k];
          const Icon = c.icon;
          const active = kind === k;
          return (
            <button
              key={k}
              onClick={() => setKindWithDefaults(k)}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition',
                active
                  ? 'border-accent/40 bg-accent/10 text-accent'
                  : 'border-slate-700/50 bg-bg-card text-slate-400 hover:border-slate-600 hover:text-slate-200',
              )}
            >
              <Icon size={13} />
              <span className="truncate">{c.label}</span>
            </button>
          );
        })}
      </div>

      {/* Kural bilgisi */}
      <div className="mb-4 rounded-lg border border-slate-700/40 bg-slate-900/40 p-2.5 text-[11px] text-slate-400">
        <div className="flex items-start gap-1.5">
          <Info size={11} className="mt-0.5 shrink-0 text-slate-500" />
          <span>{cfg.note}</span>
        </div>
      </div>

      {/* Girdi formu */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field
          label="Kredi Tutarı"
          suffix="₺"
          value={amount}
          onChange={setAmount}
          min={1000}
          max={100_000_000}
          step={10_000}
        />
        <Field
          label="Vade"
          suffix="ay"
          value={term}
          onChange={setTerm}
          min={3}
          max={cfg.maxTerm}
          step={1}
          hint={`Max ${cfg.maxTerm} ay`}
        />
        <Field
          label="Aylık Faiz"
          suffix="%"
          value={rate}
          onChange={setRate}
          min={0.1}
          max={20}
          step={0.01}
          decimals={2}
        />
      </div>

      {/* KKDF/BSMV özet */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
        <StatChip label="KKDF" value={`%${(cfg.kkdf * 100).toFixed(0)}`} muted={cfg.kkdf === 0} />
        <StatChip label="BSMV" value={`%${(cfg.bsmv * 100).toFixed(0)}`} muted={cfg.bsmv === 0} />
        <StatChip label="Efektif Aylık" value={`%${result.effectiveRate.toFixed(3)}`} accent />
      </div>

      {/* Sonuçlar */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <ResultCard
          icon={<Calendar size={14} />}
          label="Aylık Taksit"
          value={formatMoney(result.monthlyPayment)}
          suffix="₺"
          color="bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
        />
        <ResultCard
          icon={<Wallet size={14} />}
          label="Toplam Ödeme"
          value={formatMoney(result.totalPayment)}
          suffix="₺"
          color="bg-blue-500/10 text-blue-400 border-blue-500/20"
        />
        <ResultCard
          icon={<TrendingDown size={14} />}
          label="Toplam Vade Farkı+Vergi"
          value={formatMoney(result.totalInterest)}
          suffix="₺"
          color="bg-orange-500/10 text-orange-400 border-orange-500/20"
        />
      </div>

      {/* Detay analiz */}
      <div className="mt-3 rounded-lg bg-slate-900/40 p-3 text-[11px] text-slate-400">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span><Percent size={10} className="mr-1 inline" />Yıllık maliyet: %{(result.effectiveRate * 12).toFixed(2)}</span>
          <span>·</span>
          <span>Vade farkı çarpanı: {(result.totalInterest / amount).toFixed(2)}x</span>
          <span>·</span>
          <span>Toplam anapara ödenen vade farkı oranı: %{amount > 0 ? ((result.totalInterest / amount) * 100).toFixed(0) : 0}</span>
        </div>
      </div>

      {/* Amortisman */}
      {result.amortization.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setShowAmortization((v) => !v)}
            className="text-[11px] font-medium text-accent hover:underline"
          >
            {showAmortization ? '↑ Amortisman tablosunu gizle' : '↓ Amortisman tablosunu göster'}
          </button>
          {showAmortization && (
            <div className="mt-2 overflow-hidden rounded-lg border border-slate-700/40">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-900/60 text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="p-2 text-left">Ay</th>
                    <th className="p-2 text-right">Vade Farkı</th>
                    <th className="p-2 text-right">Anapara</th>
                    <th className="p-2 text-right">Kalan Bakiye</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50 text-slate-300">
                  {amortDisplay.map((row, i) =>
                    row.month === -1 ? (
                      <tr key={`sep-${i}`} className="bg-slate-900/30">
                        <td colSpan={4} className="p-1.5 text-center text-slate-600">
                          ⋮ ({result.amortization.length - 9} ay daha)
                        </td>
                      </tr>
                    ) : (
                      <tr key={row.month} className="hover:bg-slate-900/40">
                        <td className="p-2 font-medium">{row.month}</td>
                        <td className="p-2 text-right tabular-nums text-orange-400/80">{formatMoney(row.interest)}</td>
                        <td className="p-2 text-right tabular-nums text-emerald-400/80">{formatMoney(row.principal)}</td>
                        <td className="p-2 text-right tabular-nums text-slate-400">{formatMoney(row.balance)}</td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <p className="mt-3 text-center text-[10px] text-slate-500">
        Yalnızca gösterge amaçlıdır. Kesin oran, dosya masrafı ve sigorta için bankanızın teklifini alın.
      </p>
    </section>
  );
}

// ---- helpers ----

function Field({
  label,
  suffix,
  value,
  onChange,
  min,
  max,
  step,
  decimals = 0,
  hint,
}: {
  label: string;
  suffix: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  decimals?: number;
  hint?: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <label className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</label>
        {hint && <span className="text-[10px] text-slate-600">{hint}</span>}
      </div>
      <div className="flex overflow-hidden rounded-lg border border-slate-700/50 bg-bg-card">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - step))}
          className="border-r border-slate-700/50 px-2 text-slate-400 hover:bg-slate-800/50"
        >−</button>
        <input
          type="number"
          value={decimals > 0 ? value.toFixed(decimals) : value}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v)));
          }}
          step={step}
          min={min}
          max={max}
          className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-center text-sm tabular-nums text-slate-100 focus:outline-none"
        />
        <span className="border-l border-slate-700/50 bg-slate-900/50 px-2 py-1.5 text-[11px] text-slate-500">{suffix}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + step))}
          className="border-l border-slate-700/50 px-2 text-slate-400 hover:bg-slate-800/50"
        >+</button>
      </div>
    </div>
  );
}

function StatChip({ label, value, accent, muted }: { label: string; value: string; accent?: boolean; muted?: boolean }) {
  return (
    <div className={cn(
      'rounded-md px-2 py-1.5',
      accent && 'bg-accent/15 text-accent',
      muted && 'bg-slate-800/40 text-slate-500',
      !accent && !muted && 'bg-slate-800/60 text-slate-300',
    )}>
      <div className="text-[9px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="font-bold tabular-nums">{value}</div>
    </div>
  );
}

function ResultCard({ icon, label, value, suffix, color }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  suffix: string;
  color: string;
}) {
  return (
    <div className={cn('rounded-lg border p-3', color)}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider opacity-80">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1 text-lg font-bold tabular-nums">
        {value} <span className="text-xs opacity-60">{suffix}</span>
      </div>
    </div>
  );
}
