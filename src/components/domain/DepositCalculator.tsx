import { useMemo, useState } from 'react';
import { Landmark, DollarSign, Shield, Coins, Info, TrendingUp, Wallet, Calculator } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Mevduat Hesaplayıcı — TL Vadeli / Döviz / KKM / Altın Mevduatı
 *
 * Bankacılık kuralları (2026 TR):
 *  - TL Vadeli Mevduat:  Stopaj %10 (vade fark etmez, 2024 sonrası)
 *                        Faiz basit (vade sonu tek ödeme) veya bileşik
 *  - Döviz Mevduat:      Stopaj %25 (USD/EUR)
 *                        Faiz oranları düşük (%1-4/yıl)
 *  - KKM (Kur Korumalı): Stopaj %0 (hazine muafiyeti)
 *                        Vade sonunda TL faiz getirisi vs kur artışı karşılaştırılır,
 *                        hangisi yüksekse onu öderler. TL değer kaybını devlet
 *                        kompanse eder (kur farkı hazine tarafından).
 *  - Altın Mevduat:      Stopaj %25 faiz kısmına, ana getiri gram altın fiyat artışı
 *
 * Formüller:
 *  Basit faiz:  Brüt = P * (r/100) * (gün/365)
 *  Bileşik:     Brüt = P * ((1 + r/100)^(gün/365) - 1)
 *  Net kazanç:  Brüt * (1 - stopaj/100)
 *  Vade sonu:   P + Net kazanç
 */

type DepositKind = 'tl' | 'doviz' | 'kkm' | 'altin';

interface DepositConfig {
  label: string;
  icon: typeof Landmark;
  color: string;
  defaultAmount: number;
  defaultTerm: number;   // gün
  defaultRate: number;   // yıllık %
  stopaj: number;        // %
  currency: string;
  note: string;
}

const DEPOSITS: Record<DepositKind, DepositConfig> = {
  tl: {
    label: 'TL Vadeli',
    icon: Landmark,
    color: 'text-emerald-400 bg-emerald-500/15',
    defaultAmount: 100_000,
    defaultTerm: 32,
    defaultRate: 47,
    stopaj: 10,
    currency: '₺',
    note: 'TL vadeli mevduatta stopaj %10 (2024 sonrası tek oran). Vade seçenekleri: 32/45/91/182/365 gün. Enflasyona karşı reel getiri için TÜFE-endeksli mevduat da değerlendirilebilir.',
  },
  doviz: {
    label: 'Döviz Mevduat',
    icon: DollarSign,
    color: 'text-blue-400 bg-blue-500/15',
    defaultAmount: 10_000,
    defaultTerm: 90,
    defaultRate: 3.5,
    stopaj: 25,
    currency: '$',
    note: 'USD/EUR mevduatta stopaj %25. Kur riskini üstlenirsin — kur düşerse TL bazında zarar edebilirsin. Faiz oranları düşük (%2-5/yıl). Bankalar dolarizasyonu caydırmak için yüksek stopaj uyguluyor.',
  },
  kkm: {
    label: 'KKM (Kur Korumalı)',
    icon: Shield,
    color: 'text-amber-400 bg-amber-500/15',
    defaultAmount: 100_000,
    defaultTerm: 180,
    defaultRate: 42,
    stopaj: 0,
    currency: '₺',
    note: 'Kur Korumalı Mevduat — TL yatırırsın, vade sonunda ya TL faiz getirisi ya da kur artışı (hangisi yüksek) sana ödenir. Aradaki farkı hazine karşılar. Stopaj %0. Rekabet için TL faizler görece cazip.',
  },
  altin: {
    label: 'Altın Mevduat',
    icon: Coins,
    color: 'text-yellow-400 bg-yellow-500/15',
    defaultAmount: 100, // gram
    defaultTerm: 180,
    defaultRate: 1.5,
    stopaj: 25,
    currency: 'gr',
    note: 'Gram altın olarak yatırılır ve gram olarak geri alınır. Faiz oranı çok düşük (%0.5-2/yıl). Asıl getiri altın fiyat değişimi. Faiz üzerinden stopaj %25. Fiziki altın yerine kayıt bazında saklama.',
  },
};

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
  yillikGetiri: number;   // %
  netYillikGetiri: number; // %
  extraInfo?: string;
}

function computeDeposit(
  amount: number,
  annualRate: number,
  termDays: number,
  stopajPct: number,
  compound = false,
): DepositResult {
  if (amount <= 0 || termDays <= 0) {
    return { brutFaiz: 0, stopaj: 0, netFaiz: 0, vadeSonu: amount, yillikGetiri: 0, netYillikGetiri: 0 };
  }
  const r = annualRate / 100;
  const t = termDays / 365;

  const brut = compound ? amount * (Math.pow(1 + r, t) - 1) : amount * r * t;
  const stopajTutar = brut * (stopajPct / 100);
  const net = brut - stopajTutar;
  const vadeSonu = amount + net;

  const yillikGetiri = t > 0 ? (brut / amount / t) * 100 : 0;
  const netYillikGetiri = t > 0 ? (net / amount / t) * 100 : 0;

  return {
    brutFaiz: brut,
    stopaj: stopajTutar,
    netFaiz: net,
    vadeSonu,
    yillikGetiri,
    netYillikGetiri,
  };
}

export function DepositCalculator() {
  const [kind, setKind] = useState<DepositKind>('tl');
  const cfg = DEPOSITS[kind];

  const [amount, setAmount] = useState(cfg.defaultAmount);
  const [term, setTerm] = useState(cfg.defaultTerm);
  const [rate, setRate] = useState(cfg.defaultRate);
  const [compound, setCompound] = useState(false);
  const [customStopaj, setCustomStopaj] = useState<number | null>(null);

  // KKM için ek girdi
  const [kurArtisPct, setKurArtisPct] = useState(15);
  // Altın için ek girdi
  const [gramFiyat, setGramFiyat] = useState(4500);
  const [altinArtisPct, setAltinArtisPct] = useState(20);

  const setKindWithDefaults = (k: DepositKind) => {
    setKind(k);
    setAmount(DEPOSITS[k].defaultAmount);
    setTerm(DEPOSITS[k].defaultTerm);
    setRate(DEPOSITS[k].defaultRate);
    setCustomStopaj(null);
  };

  const stopajFinal = customStopaj ?? cfg.stopaj;
  const result = useMemo(
    () => computeDeposit(amount, rate, term, stopajFinal, compound),
    [amount, rate, term, stopajFinal, compound],
  );

  // KKM özel: TL faiz getirisi vs kur artışı (hangisi yüksekse o ödenir)
  const kkmResult = useMemo(() => {
    if (kind !== 'kkm') return null;
    const t = term / 365;
    const tlFaizGetiri = amount * (rate / 100) * t;
    const kurGetiri = amount * (kurArtisPct / 100) * t;
    const odenecek = Math.max(tlFaizGetiri, kurGetiri);
    return {
      tlFaizGetiri,
      kurGetiri,
      odenecek,
      vadeSonu: amount + odenecek,
      kaynak: tlFaizGetiri >= kurGetiri ? 'TL faiz getirisi' : 'Kur artışı (hazine)',
    };
  }, [kind, amount, rate, term, kurArtisPct]);

  // Altın özel: faiz getirisi + değer artışı
  const altinResult = useMemo(() => {
    if (kind !== 'altin') return null;
    const t = term / 365;
    const gramGetiri = amount * (rate / 100) * t;                     // ek gram
    const yeniGramFiyat = gramFiyat * (1 + (altinArtisPct / 100) * t);
    const baslangicTLDeger = amount * gramFiyat;
    const bitisTLDeger = (amount + gramGetiri) * yeniGramFiyat;
    const brutFaizTL = gramGetiri * yeniGramFiyat;
    const stopajTL = brutFaizTL * (stopajFinal / 100);
    const netVadeSonuTL = bitisTLDeger - stopajTL;
    return {
      gramGetiri,
      yeniGramFiyat,
      baslangicTLDeger,
      netVadeSonuTL,
      stopajTL,
      toplamGetiriTL: netVadeSonuTL - baslangicTLDeger,
      toplamGetiriPct: baslangicTLDeger > 0 ? ((netVadeSonuTL - baslangicTLDeger) / baslangicTLDeger) * 100 : 0,
    };
  }, [kind, amount, rate, term, gramFiyat, altinArtisPct, stopajFinal]);

  return (
    <section className="glass-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <Wallet size={18} className="text-accent" />
        <h3 className="text-base font-bold text-slate-100">Mevduat Hesaplayıcısı</h3>
        <span className="ml-auto text-[10px] text-slate-500">Stopaj & bileşik/basit dahil</span>
      </div>

      {/* Tab seçici */}
      <div className="mb-4 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {(Object.keys(DEPOSITS) as DepositKind[]).map((k) => {
          const c = DEPOSITS[k];
          const Icon = c.icon;
          const active = kind === k;
          return (
            <button
              key={k}
              onClick={() => setKindWithDefaults(k)}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-[11px] font-medium transition',
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

      {/* Standart girdi formu */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field
          label={kind === 'altin' ? 'Gram Miktarı' : 'Anapara'}
          suffix={cfg.currency}
          value={amount}
          onChange={setAmount}
          min={1}
          max={100_000_000}
          step={kind === 'altin' ? 1 : 1000}
        />
        <Field
          label="Vade"
          suffix="gün"
          value={term}
          onChange={setTerm}
          min={7}
          max={1825}
          step={1}
          hint={kind === 'tl' ? 'Klasik: 32/91/182/365' : undefined}
        />
        <Field
          label="Yıllık Faiz"
          suffix="%"
          value={rate}
          onChange={setRate}
          min={0}
          max={100}
          step={0.1}
          decimals={2}
        />
      </div>

      {/* KKM için ek input */}
      {kind === 'kkm' && (
        <div className="mt-3 grid gap-3 sm:grid-cols-1">
          <Field
            label="Yıllık Kur Artış Beklentin"
            suffix="%"
            value={kurArtisPct}
            onChange={setKurArtisPct}
            min={0}
            max={200}
            step={0.5}
            decimals={1}
            hint="KKM: yüksek olan ödenir"
          />
        </div>
      )}

      {/* Altın için ek inputlar */}
      {kind === 'altin' && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field
            label="Güncel Gram Altın (₺)"
            suffix="₺/gr"
            value={gramFiyat}
            onChange={setGramFiyat}
            min={100}
            max={100_000}
            step={10}
          />
          <Field
            label="Yıllık Altın Artış Beklentin"
            suffix="%"
            value={altinArtisPct}
            onChange={setAltinArtisPct}
            min={-50}
            max={200}
            step={0.5}
            decimals={1}
          />
        </div>
      )}

      {/* Stopaj + Bileşik seçenekleri */}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px]">
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
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-slate-500">Stopaj:</span>
          <input
            type="number"
            value={stopajFinal}
            onChange={(e) => setCustomStopaj(parseFloat(e.target.value) || 0)}
            min={0}
            max={50}
            step={0.5}
            className="w-14 rounded border border-slate-700/50 bg-bg-card px-1.5 py-0.5 text-center tabular-nums text-slate-200 focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <span className="text-slate-500">%</span>
        </div>
      </div>

      {/* Sonuçlar (KKM ve Altın için özel, diğerleri standart) */}
      {kind === 'kkm' && kkmResult ? (
        <div className="mt-4 space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className={cn('rounded-lg border p-3',
              kkmResult.tlFaizGetiri >= kkmResult.kurGetiri
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                : 'border-slate-700/40 bg-slate-900/30 text-slate-500')}>
              <div className="text-[10px] uppercase tracking-wider opacity-80">TL Faiz Getirisi</div>
              <div className="mt-0.5 text-base font-bold tabular-nums">{formatMoney(kkmResult.tlFaizGetiri)} ₺</div>
            </div>
            <div className={cn('rounded-lg border p-3',
              kkmResult.kurGetiri > kkmResult.tlFaizGetiri
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                : 'border-slate-700/40 bg-slate-900/30 text-slate-500')}>
              <div className="text-[10px] uppercase tracking-wider opacity-80">Kur Artış Getirisi</div>
              <div className="mt-0.5 text-base font-bold tabular-nums">{formatMoney(kkmResult.kurGetiri)} ₺</div>
            </div>
          </div>
          <div className="rounded-lg border border-accent/30 bg-accent/10 p-3">
            <div className="text-[10px] uppercase tracking-wider text-accent/80">Sana Ödenecek Kazanç</div>
            <div className="mt-0.5 text-xl font-bold tabular-nums text-accent">
              {formatMoney(kkmResult.odenecek)} ₺
            </div>
            <div className="mt-1 text-[11px] text-accent/70">Kaynak: {kkmResult.kaynak} · Stopaj %0</div>
          </div>
          <div className="rounded-lg bg-slate-900/40 p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Vade Sonu Toplam</div>
            <div className="mt-0.5 text-lg font-bold tabular-nums text-slate-100">
              {formatMoney(kkmResult.vadeSonu)} ₺
            </div>
          </div>
        </div>
      ) : kind === 'altin' && altinResult ? (
        <div className="mt-4 space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <MiniCard label="Faiz Kazancı" value={`+${formatMoney(altinResult.gramGetiri, 3)} gr`} color="emerald" />
            <MiniCard label="Yeni Gram Fiyatı" value={`${formatMoney(altinResult.yeniGramFiyat)} ₺`} color="yellow" />
            <MiniCard label="Stopaj" value={`${formatMoney(altinResult.stopajTL)} ₺`} color="orange" />
          </div>
          <div className="rounded-lg border border-accent/30 bg-accent/10 p-3">
            <div className="text-[10px] uppercase tracking-wider text-accent/80">Net Vade Sonu (TL Bazında)</div>
            <div className="mt-0.5 text-xl font-bold tabular-nums text-accent">
              {formatMoney(altinResult.netVadeSonuTL)} ₺
            </div>
            <div className="mt-1 flex items-center gap-2 text-[11px]">
              <span className="text-accent/70">Başlangıç: {formatMoney(altinResult.baslangicTLDeger)} ₺</span>
              <span className="text-slate-500">·</span>
              <span className={cn(altinResult.toplamGetiriTL >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                {altinResult.toplamGetiriTL >= 0 ? '+' : ''}{formatMoney(altinResult.toplamGetiriTL)} ₺
                (%{altinResult.toplamGetiriPct.toFixed(1)})
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <ResultCard
            icon={<TrendingUp size={14} />}
            label="Brüt Faiz"
            value={formatMoney(result.brutFaiz)}
            suffix={cfg.currency}
            color="bg-slate-500/10 text-slate-300 border-slate-500/20"
          />
          <ResultCard
            icon={<Calculator size={14} />}
            label={`Stopaj (%${stopajFinal})`}
            value={formatMoney(result.stopaj)}
            suffix={cfg.currency}
            color="bg-red-500/10 text-red-400 border-red-500/20"
          />
          <ResultCard
            icon={<TrendingUp size={14} />}
            label="Net Kazanç"
            value={formatMoney(result.netFaiz)}
            suffix={cfg.currency}
            color="bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
          />
          <ResultCard
            icon={<Wallet size={14} />}
            label="Vade Sonu"
            value={formatMoney(result.vadeSonu)}
            suffix={cfg.currency}
            color="bg-accent/10 text-accent border-accent/20"
          />
        </div>
      )}

      {/* Efektif getiri */}
      {kind !== 'kkm' && kind !== 'altin' && (
        <div className="mt-3 rounded-lg bg-slate-900/40 p-3 text-[11px] text-slate-400">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>Brüt yıllık: %{result.yillikGetiri.toFixed(2)}</span>
            <span>·</span>
            <span className="text-emerald-400">Net yıllık: %{result.netYillikGetiri.toFixed(2)}</span>
            <span>·</span>
            <span>Vade: {term} gün ({(term / 30).toFixed(1)} ay)</span>
            <span>·</span>
            <span>{compound ? 'Bileşik' : 'Basit'}</span>
          </div>
        </div>
      )}

      <p className="mt-3 text-center text-[10px] text-slate-500">
        Yalnızca gösterge amaçlıdır. Reel faiz için TÜFE ile karşılaştırın. TMSF garanti tavanı 950.000 ₺ (Şubat 2024).
      </p>
    </section>
  );
}

// ---- helpers (LoanCalculator ile aynı stil) ----

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

function MiniCard({ label, value, color }: { label: string; value: string; color: 'emerald' | 'yellow' | 'orange' | 'red' }) {
  const colors = {
    emerald: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
    yellow: 'border-yellow-500/20 bg-yellow-500/10 text-yellow-400',
    orange: 'border-orange-500/20 bg-orange-500/10 text-orange-400',
    red: 'border-red-500/20 bg-red-500/10 text-red-400',
  };
  return (
    <div className={cn('rounded-lg border p-2.5', colors[color])}>
      <div className="text-[9px] uppercase tracking-wider opacity-80">{label}</div>
      <div className="mt-0.5 text-sm font-bold tabular-nums">{value}</div>
    </div>
  );
}
