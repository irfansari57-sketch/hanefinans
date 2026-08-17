import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, Minus, BarChart3, Coins, Bitcoin, ArrowUpRight } from 'lucide-react';
import type { MacroIndicator } from '@/data/types';
import { macroKeyToRoute } from '@/lib/macroRoutes';
import { isBistOpen, asOfLabel } from '@/lib/marketCalendar';
import { cn } from '@/lib/utils';

/**
 * Premium 3-sutunlu Piyasa Ozeti — Panel sayfasinin ust blogu.
 * Turkuaz etiket + 3D depth (gradient + uzun golge + inset highlight).
 * Satir tiklanabilir -> detay sayfasi.
 */

interface Props {
  macro: MacroIndicator[];
}

const COL_INDICES = ['BIST 100', 'BIST 30', 'USD/TRY', 'EUR/TRY'];
const COL_METALS = ['Gram Altın', 'Gram Gümüş', 'Ons Altın', 'Ons Gümüş'];
const COL_CRYPTO = ['BTC/USD', 'ETH/USD', 'XRP/USD', 'DOGE/USD'];

function formatValue(m: MacroIndicator): string {
  if (m.key === 'BIST 100' || m.key === 'BIST 30') {
    return m.value.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
  }
  if (m.key === 'USD/TRY' || m.key === 'EUR/TRY') {
    return m.value.toFixed(2);
  }
  if (m.key === 'Gram Altın' || m.key === 'Gram Gümüş') {
    return m.value.toLocaleString('tr-TR', { maximumFractionDigits: m.value < 100 ? 2 : 0 }) + ' ₺';
  }
  if (m.key === 'Ons Altın' || m.key === 'Ons Gümüş') {
    return '$' + m.value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  if (m.value < 1) return '$' + m.value.toFixed(4);
  if (m.value < 10) return '$' + m.value.toFixed(4);
  if (m.value < 1000) return '$' + m.value.toFixed(2);
  return '$' + m.value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function Row({ m }: { m: MacroIndicator }) {
  const route = macroKeyToRoute(m.key);
  // Veri kaynagi guvenilir: BIST endeksleri Is Yatirim feed'inden, Yahoo proxy
  // override sayesinde Yahoo previousClose bug'i tamamen yok. Eski |%10|+
  // defansif sanity check'i kaldirildi — gercek %5+ hareketler "—" gostermesin.
  const cp = m.changePct;
  const isFinitePct = cp != null && Number.isFinite(cp);
  const isUp = isFinitePct && (cp as number) > 0;
  const isDown = isFinitePct && (cp as number) < 0;

  // BIST endeksleri icin piyasa kapaliysa (hafta sonu / tatil / saat disi)
  // backend snapshot'tan gelen asOf'u kullaniciya yumusak bir ribbon ile bildir.
  // "Son kapanis · Cuma 18 Haz" — kullanici neden hala ayni fiyati gordugunu anlasin.
  const isBistIdx = m.key === 'BIST 100' || m.key === 'BIST 30';
  const showAsOfRibbon = isBistIdx && !!m.asOf && !isBistOpen();
  const asOfText = showAsOfRibbon && m.asOf ? asOfLabel(m.asOf) : null;

  const content = (
    <div className="flex items-center justify-between gap-2 py-1.5 sm:py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-accent sm:text-[11px]">
          <span className="truncate">{m.label}</span>
          {route && (
            <ArrowUpRight size={10} className="shrink-0 opacity-0 transition group-hover/row:opacity-60" />
          )}
        </div>
        <div className="mt-0.5 text-sm font-bold tabular-nums text-slate-100 drop-shadow-sm sm:text-base">
          {formatValue(m)}
        </div>
        {asOfText && (
          <div className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-slate-500 sm:text-[10px]">
            {`Son kapanış · ${asOfText}`}
          </div>
        )}
      </div>
      <div className="shrink-0">
        {!isFinitePct ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-700/30 px-1.5 py-1 text-[10px] font-semibold text-slate-500">
            <Minus size={11} />
            <span className="tabular-nums">—</span>
          </span>
        ) : (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-semibold tabular-nums sm:text-[11px]',
              isUp && 'bg-success/15 text-success',
              isDown && 'bg-danger/15 text-danger',
            )}
          >
            {isUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {(cp as number) >= 0 ? '+' : ''}
            {(cp as number).toFixed(2)}%
          </span>
        )}
      </div>
    </div>
  );

  return route ? (
    <Link
      to={route}
      className="group/row -mx-2 block rounded-md px-2 transition hover:bg-slate-700/15 [&+a]:border-t [&+a]:border-slate-700/25 [&+div]:border-t [&+div]:border-slate-700/25"
    >
      {content}
    </Link>
  ) : (
    <div className="-mx-2 px-2 [&+a]:border-t [&+a]:border-slate-700/25 [&+div]:border-t [&+div]:border-slate-700/25">
      {content}
    </div>
  );
}

interface ColumnProps {
  title: string;
  icon: React.ReactNode;
  borderClass: string;
  items: MacroIndicator[];
}

function Column({ title, icon, borderClass, items }: ColumnProps) {
  return (
    <div
      className={cn(
        'relative rounded-xl border p-2.5 transition-all duration-200 sm:p-3',
        'bg-gradient-to-br from-bg-card/85 via-bg-card/60 to-bg-soft/40',
        'shadow-[0_10px_30px_-10px_rgba(0,0,0,0.7),inset_0_1px_0_0_rgba(255,255,255,0.06)]',
        'hover:shadow-[0_16px_40px_-12px_rgba(0,0,0,0.85),inset_0_1px_0_0_rgba(255,255,255,0.1)]',
        'hover:-translate-y-0.5',
        borderClass,
      )}
    >
      <div className="mb-1 flex items-center gap-1.5 border-b border-slate-700/40 pb-2">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300 sm:text-[11px]">
          {title}
        </span>
      </div>
      {items.length === 0 ? (
        <div className="py-3 text-center text-[11px] text-slate-500">Yükleniyor…</div>
      ) : (
        items.map((m) => <Row key={m.key} m={m} />)
      )}
    </div>
  );
}

export function MarketSummaryPremium({ macro }: Props) {
  const findItems = (keys: string[]) =>
    keys
      .map((k) => macro.find((m) => m.key === k))
      .filter((m): m is MacroIndicator => !!m);

  const indices = findItems(COL_INDICES);
  const metals = findItems(COL_METALS);
  const crypto = findItems(COL_CRYPTO);

  return (
    <div className="row-stagger grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
      <Column
        title="Endeks & Döviz"
        icon={<BarChart3 size={14} className="text-accent" />}
        borderClass="border-accent/25 hover:border-accent/50"
        items={indices}
      />
      <Column
        title="Kıymetli Metal"
        icon={<Coins size={14} className="text-warning" />}
        borderClass="border-warning/25 hover:border-warning/50"
        items={metals}
      />
      <Column
        title="Kripto"
        icon={<Bitcoin size={14} className="text-fuchsia-400" />}
        borderClass="border-fuchsia-500/25 hover:border-fuchsia-500/50"
        items={crypto}
      />
    </div>
  );
}
