import { useMemo, useState } from 'react';
import { Landmark, Info, TrendingUp, Wallet, Calculator, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * TL Mevduat Hesaplayıcı
 *
 * Bankacılık kuralları (2026 TR — güncel):
 *  - TL Vadeli Mevduat: Stopaj **%17.5** (sabit, güncel oran)
 *  - Klasik vadeler: 32/45/91/182/365 gün
 *  - Basit faiz (vade sonu tek ödeme) veya bileşik (kartopu) seçimi
 *
 * Formüller:
 *  Basit:   Brüt = P × r × (gün/365)
 *  Bileşik: Brüt = P × ((1 + r)^(gün/365) - 1)
 *  Net:     Brüt × (1 - stopaj)
 *  Vade sonu: P + Net
 */

const STOPAJ_PCT = 17.5;

function formatMoney(v: number, decimals = 0): string {
  return new Intl.NumberFormat('tr-TR', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(v);
}

interface DepositResult {
  brutFaiz: number;
  stopaj: number;
  netFaiz: number;
  vadeSonu: number;
  yillikGetiri: number;
  netYillikGetiri: number;
}

function computeDeposit(amount: number, annualRate: number, termDays: number, compound: boolean): DepositResult {
  if (amount <= 0 || termDays <= 0) {
    return { brutFaiz: 0, stopaj: 0, netFaiz: 0, vadeSonu: amount, yillikGetiri: 0, netYillikGetiri: 0 };
  }
  const r = annualRate / 100;
  const t = termDays / 365;
  const brut = compound ? amount * (Math.pow(1 + r, t) - 1) : amount * r * t;
  const stopajTutar = brut * (STOPAJ_PCT / 100);
  const net = brut - stopajTutar;
  return {
    brutFaiz: brut,
    stopaj: stopajTutar,
    netFaiz: net,
    vadeSonu: amount + net,
    yillikGetiri: t > 0 ? (brut / amount / t) * 100 : 0,
    netYillikGetiri: t > 0 ? (net / amount / t) * 100 : 0,
  };
}

const VADE_PRESETS = [
  { label: '32 gün', days: 32 },
  { label: '45 gün', days: 45 },
  { label: '91 gün', days: 91 },
  { label: '182 gün', days: 182 },
  { label: '365 gün', days: 365 },
];

export function DepositCalculator() {
  const [amount, setAmount] = useState(100_000);
  const [term, setTerm] = useState(32);
  const [rate, setRate] = useState(47);
  const [compound, setCompound] = useState(false);

  const result = useMemo(
    () => computeDeposit(amount, rate, term, compound),
    [amount, rate, term, compound],
  );

  return (
    <section className="glass-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <Wallet size={18} className="text-accent" />
        <h3 className="text-base font-bold text-slate-100">TL Vadeli Mevduat Hesaplayıcısı</h3>
        <span className="ml-auto text-[10px] text-slate-500">Stopaj sabit %{STOPAJ_PCT}</span>
      </div>

      {/* Kural bilgisi */}
      <div className="mb-4 rounded-lg border border-slate-700/40 bg-slate-900/40 p-2.5 text-[11px] text-slate-400">
        <div className="flex items-start gap-1.5">
          <Info size={11} className="mt-0.5 shrink-0 text-slate-500" />
          <span>
            TL vadeli mevduatta güncel stopaj oranı <strong className="text-slate-200">%{STOPAJ_PCT}</strong>{' '}
            (2024 sonrası tek oran). Klasik vade seçenekleri: 32, 45, 91, 182 ve 365 gün. Enflasyona karşı
            reel getiri için TÜFE-endeksli mevduat da değerlendirilebilir.
          </span>
        </div>
      </div>

      {/* Vade preset chip'leri */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {VADE_PRESETS.map((v) => (
          <button
            key={v.days}
            onClick={() => setTerm(v.days)}
            className={cn(
              'rounded-full border px-3 py-1 text-[11px] font-medium transition',
              term === v.days
                ? 'border-accent/40 bg-accent/10 text-accent'
                : 'border-slate-700/50 bg-bg-card text-slate-400 hover:border-slate-600 hover:text-slate-200',
            )}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Girdi formu */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Anapara" suffix="₺" value={amount} onChange={setAmount} min={1000} max={100_000_000} step={1000} />
        <Field label="Vade" suffix="gün" value={term} onChange={setTerm} min={7} max={1825} step={1} />
        <Field label="Yıllık Faiz" suffix="%" value={rate} onChange={setRate} min={0} max={100} step={0.1} decimals={2} />
      </div>

      {/* Bileşik faiz seçeneği */}
      <div className="mt-3 flex items-center gap-2 text-[11px]">
        <label className="flex items-center gap-1.5 text-slate-400">
          <input
            type="checkbox"
            checked={compound}
            onChange={(e) => setCompound(e.target.checked)}
            className="rounded border-slate-600 bg-bg-card text-accent focus:ring-accent"
          />
          <span>Bileşik faiz</span>
          <span className="text-slate-600">(vade içi kartopu)</span>
        </label>
      </div>

      {/* Sonuçlar */}
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <ResultCard
          icon={<TrendingUp size={14} />}
          label="Brüt Faiz"
          value={formatMoney(result.brutFaiz)}
          suffix="₺"
          color="bg-slate-500/10 text-slate-300 border-slate-500/20"
        />
        <ResultCard
          icon={<Calculator size={14} />}
          label={`Stopaj (%${STOPAJ_PCT})`}
          value={formatMoney(result.stopaj)}
          suffix="₺"
          color="bg-red-500/10 text-red-400 border-red-500/20"
        />
        <ResultCard
          icon={<TrendingUp size={14} />}
          label="Net Kazanç"
          value={formatMoney(result.netFaiz)}
          suffix="₺"
          color="bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
        />
        <ResultCard
          icon={<Wallet size={14} />}
          label="Vade Sonu"
          value={formatMoney(result.vadeSonu)}
          suffix="₺"
          color="bg-accent/10 text-accent border-accent/20"
        />
      </div>

      {/* Efektif getiri özeti */}
      <div className="mt-3 rounded-lg bg-slate-900/40 p-3 text-[11px] text-slate-400">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span><Calendar size={10} className="mr-1 inline" />Vade: {term} gün ({(term / 30).toFixed(1)} ay)</span>
          <span>·</span>
          <span>Brüt yıllık: %{result.yillikGetiri.toFixed(2)}</span>
          <span>·</span>
          <span className="text-emerald-400">Net yıllık: %{result.netYillikGetiri.toFixed(2)}</span>
          <span>·</span>
          <span>{compound ? 'Bileşik' : 'Basit'}</span>
        </div>
      </div>

      <p className="mt-3 text-center text-[10px] text-slate-500">
        Yalnızca gösterge amaçlıdır. Reel faiz için TÜFE ile karşılaştırın. TMSF garanti tavanı 950.000 ₺ (Şubat 2024).
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
}: {
  label: string;
  suffix: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  decimals?: number;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</label>
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
