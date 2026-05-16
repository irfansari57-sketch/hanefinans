import { useState, useMemo } from 'react';
import { Calculator, Shield, Target } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PositionSizerProps {
  symbol: string;
  currentPrice: number;
  /** Support level (varsa) */
  support?: number;
  /** Resistance level (varsa) */
  resistance?: number;
}

const DEFAULT_CAPITAL = 100_000;
const DEFAULT_RISK_PCT = 2;

/**
 * Trader'lar için pozisyon büyüklüğü hesaplayıcısı + Stop/TP öneri.
 *
 * - Risk %'sini, sermaye ve stop fiyatından lot adedi hesaplar
 * - Destek/direnç bazlı otomatik stop ve TP1/TP2 önerir
 */
export function PositionSizer({ symbol, currentPrice, support, resistance }: PositionSizerProps) {
  const [capital, setCapital] = useState(DEFAULT_CAPITAL);
  const [riskPct, setRiskPct] = useState(DEFAULT_RISK_PCT);
  // Default stop = support (varsa), yoksa -%3
  const [stopPrice, setStopPrice] = useState(
    support && support < currentPrice ? support : currentPrice * 0.97,
  );

  const calc = useMemo(() => {
    const riskAmount = capital * (riskPct / 100);
    const stopDistance = currentPrice - stopPrice;
    if (stopDistance <= 0) return null;
    const lotSize = Math.floor(riskAmount / stopDistance);
    const positionValue = lotSize * currentPrice;
    const positionPct = (positionValue / capital) * 100;
    const stopPct = ((currentPrice - stopPrice) / currentPrice) * 100;

    // TP önerileri
    const tp1 = resistance && resistance > currentPrice
      ? resistance
      : currentPrice + stopDistance * 2; // 1:2 risk/reward
    const tp2 = resistance && resistance > currentPrice
      ? resistance + stopDistance * 1.5 // direnç + 1.5x daha
      : currentPrice + stopDistance * 3; // 1:3 risk/reward
    const tp1Pct = ((tp1 - currentPrice) / currentPrice) * 100;
    const tp2Pct = ((tp2 - currentPrice) / currentPrice) * 100;
    const rrTp1 = (tp1 - currentPrice) / stopDistance;
    const rrTp2 = (tp2 - currentPrice) / stopDistance;
    const profit1 = lotSize * (tp1 - currentPrice);
    const profit2 = lotSize * (tp2 - currentPrice);

    return {
      riskAmount, stopDistance, lotSize, positionValue, positionPct,
      stopPct, tp1, tp2, tp1Pct, tp2Pct, rrTp1, rrTp2, profit1, profit2,
    };
  }, [capital, riskPct, stopPrice, currentPrice, resistance]);

  return (
    <div className="card p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
        <Calculator size={14} className="text-accent" />
        Pozisyon Hesaplayıcı + Stop/TP
      </h3>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500">Sermaye (₺)</label>
          <input
            type="number"
            className="input mt-1"
            value={capital}
            onChange={(e) => setCapital(parseFloat(e.target.value) || 0)}
            min={0}
            step={1000}
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500">Risk %</label>
          <input
            type="number"
            className="input mt-1"
            value={riskPct}
            onChange={(e) => setRiskPct(parseFloat(e.target.value) || 0)}
            min={0.1}
            max={10}
            step={0.5}
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500">
            Stop Fiyatı (₺) {support && <span className="text-success">— Destek: {support.toFixed(2)}</span>}
          </label>
          <input
            type="number"
            className="input mt-1"
            value={stopPrice.toFixed(2)}
            onChange={(e) => setStopPrice(parseFloat(e.target.value) || 0)}
            min={0}
            step={0.1}
          />
        </div>
      </div>

      {!calc ? (
        <div className="mt-3 rounded border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
          ⚠️ Stop fiyatı mevcut fiyattan ({currentPrice.toFixed(2)}₺) düşük olmalı.
        </div>
      ) : (
        <>
          {/* Pozisyon büyüklüğü */}
          <div className="mt-3 rounded-lg border border-accent/30 bg-accent/5 p-3">
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
              <Metric label="Lot Adedi" value={calc.lotSize.toString()} highlight />
              <Metric label="Pozisyon Değeri" value={`${calc.positionValue.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}₺`} />
              <Metric label="Portföy %" value={`%${calc.positionPct.toFixed(1)}`} />
              <Metric label="Risk Tutarı" value={`${calc.riskAmount.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}₺`} tone="danger" />
            </div>
          </div>

          {/* Stop + TP detayları */}
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-danger/30 bg-danger/5 p-3">
              <div className="flex items-center gap-1.5">
                <Shield size={12} className="text-danger" />
                <span className="text-[10px] uppercase tracking-wider text-danger">Stop-Loss</span>
              </div>
              <div className="mt-1 text-lg font-bold tabular-nums text-slate-100">{stopPrice.toFixed(2)}₺</div>
              <div className="text-[10px] text-slate-400">%{calc.stopPct.toFixed(2)} aşağıda</div>
              <div className="text-[10px] text-danger mt-0.5">-{(calc.lotSize * calc.stopDistance).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}₺ zarar</div>
            </div>

            <div className="rounded-lg border border-success/30 bg-success/5 p-3">
              <div className="flex items-center gap-1.5">
                <Target size={12} className="text-success" />
                <span className="text-[10px] uppercase tracking-wider text-success">TP1 (1:{calc.rrTp1.toFixed(1)})</span>
              </div>
              <div className="mt-1 text-lg font-bold tabular-nums text-slate-100">{calc.tp1.toFixed(2)}₺</div>
              <div className="text-[10px] text-slate-400">+%{calc.tp1Pct.toFixed(2)} yukarıda</div>
              <div className="text-[10px] text-success mt-0.5">+{calc.profit1.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}₺ kar</div>
            </div>

            <div className="rounded-lg border border-success/40 bg-success/10 p-3">
              <div className="flex items-center gap-1.5">
                <Target size={12} className="text-success" />
                <span className="text-[10px] uppercase tracking-wider text-success">TP2 (1:{calc.rrTp2.toFixed(1)})</span>
              </div>
              <div className="mt-1 text-lg font-bold tabular-nums text-slate-100">{calc.tp2.toFixed(2)}₺</div>
              <div className="text-[10px] text-slate-400">+%{calc.tp2Pct.toFixed(2)} yukarıda</div>
              <div className="text-[10px] text-success mt-0.5">+{calc.profit2.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}₺ kar</div>
            </div>
          </div>

          <p className="mt-3 text-[10px] text-slate-500">
            ℹ️ Stop fiyatı destek seviyesine, TP'ler direnç seviyesine göre otomatik önerilir. 1:2 minimum risk-getiri oranı tavsiye edilir.
          </p>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, highlight, tone }: { label: string; value: string; highlight?: boolean; tone?: 'danger' | 'success' }) {
  const toneClass = tone === 'danger' ? 'text-danger'
    : tone === 'success' ? 'text-success'
    : highlight ? 'text-accent'
    : 'text-slate-100';
  return (
    <div className={cn(highlight && 'col-span-2 sm:col-span-1')}>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={cn('mt-0.5 text-lg font-bold tabular-nums', toneClass)}>{value}</div>
    </div>
  );
}
