/**
 * Ekonomik Takvim Widget — Kürate edilmiş TR-odakli olay listesi.
 *
 * - Header tiklanir → /takvim sayfasi
 * - Item tiklanir → expand (free: paywall, pro: derinlemesine analiz)
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarClock,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  ChevronRight,
  ChevronDown,
  Lock,
  Crown,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  History,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth, isPro } from '@/store/auth';
import {
  CURATED_CALENDAR,
  upcomingEvents,
  type CalendarEvent,
  type EventImportance,
  type EventCategory,
  type EventCountry,
} from '@/data/curatedCalendar';

interface Props {
  compact?: boolean;
  maxItems?: number;
  daysAhead?: number;
  className?: string;
  /** Akordiyon olarak davranir: header'a tiklayinca acilir/kapanir, /takvim'e gitmez.
      Sag rail'de kompakt gosterim icin. localStorage'a kaydedilir. */
  collapsible?: boolean;
}

const CATEGORY_STYLE: Record<EventCategory, { label: string; cls: string }> = {
  monetary:     { label: 'PARA POL.',  cls: 'bg-accent/20 text-accent border-accent/40' },
  data:         { label: 'VERI',       cls: 'bg-info/20 text-info border-info/40' },
  political:    { label: 'SIYASI',     cls: 'bg-danger/20 text-danger border-danger/40' },
  holiday:      { label: 'TATIL',      cls: 'bg-warning/20 text-warning border-warning/40' },
  derivatives:  { label: 'VADE',       cls: 'bg-purple-500/20 text-purple-400 border-purple-500/40' },
  corporate:    { label: 'SIRKET',     cls: 'bg-slate-500/20 text-slate-300 border-slate-500/40' },
};

const COUNTRY_STYLE: Record<EventCountry, { flag: string; cls: string }> = {
  TR:     { flag: '🇹🇷', cls: 'bg-danger/15 text-danger border-danger/30' },
  US:     { flag: '🇺🇸', cls: 'bg-info/15 text-info border-info/30' },
  EU:     { flag: '🇪🇺', cls: 'bg-warning/15 text-warning border-warning/30' },
  UK:     { flag: '🇬🇧', cls: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  GLOBAL: { flag: '🌐',  cls: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
};

const IMPORTANCE_STYLE: Record<EventImportance, { bar: string; label: string; glow: string }> = {
  high:   { bar: 'bg-danger',  label: 'YUKSEK', glow: 'shadow-[0_0_8px_rgba(239,68,68,0.5)]' },
  medium: { bar: 'bg-warning', label: 'ORTA',   glow: '' },
  low:    { bar: 'bg-slate-500', label: 'DUSUK', glow: '' },
};

function formatDate(iso: string, now: Date = new Date()): { label: string; isToday: boolean; isTomorrow: boolean } {
  const d = new Date(iso + 'T00:00:00');
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  const dayName = ['Paz', 'Pzt', 'Sal', 'Car', 'Per', 'Cum', 'Cmt'][d.getDay()];
  const dayNum = d.getDate();
  const monthName = ['Oca', 'Sub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Agu', 'Eyl', 'Eki', 'Kas', 'Ara'][d.getMonth()];

  if (diffDays === 0) return { label: 'BUGUN', isToday: true, isTomorrow: false };
  if (diffDays === 1) return { label: 'YARIN', isToday: false, isTomorrow: true };
  if (diffDays > 1 && diffDays < 7) return { label: `${dayName} ${dayNum} ${monthName}`.toUpperCase(), isToday: false, isTomorrow: false };
  return { label: `${dayNum} ${monthName} ${dayName}`.toUpperCase(), isToday: false, isTomorrow: false };
}

function ImpactIcon({ impact, large }: { impact?: CalendarEvent['impact']; large?: boolean }) {
  const sz = large ? 14 : 12;
  if (impact === 'bullish') return <TrendingUp size={sz} className="text-success" strokeWidth={2.5} />;
  if (impact === 'bearish') return <TrendingDown size={sz} className="text-danger" strokeWidth={2.5} />;
  if (impact === 'neutral') return <Minus size={sz} className="text-slate-400" strokeWidth={2.5} />;
  return null;
}

/** PRO-gated detail panel — bullish/base/bearish + asset impact + watchlist */
/** Kategori bazli default analiz — her olay icin asgari icerik garantisi. */
function defaultAnalysis(event: CalendarEvent): NonNullable<CalendarEvent['proAnalysis']> {
  const cat = event.category;
  const isHigh = event.importance === 'high';
  const country = event.country;

  if (cat === 'monetary') {
    return {
      bullishScenario: 'Guvercin karar / faiz indirimi sinyali — risk varliklar pozitif. BIST + EM hisseler ralisi, USD/TRY indirim alani.',
      baseScenario: 'Beklenti dahilinde karar — sinirli ilk tepki. Asil hareket forward guidance metnine bagli.',
      bearishScenario: 'Sahin karar / faiz artisi — risk varliklar satis, USD guclenir, EM hisseler ve TRY zayif.',
      bistImpact: 'Endekste %1-3 hareket olasi. Banka endeksi (XBANK) ve faiz hassas sektorler (GYO, REIT) en duyarli.',
      usdtryImpact: 'Karar sonrasi ilk 60 dakikada %0,3-1,5 hareket bekleniyor. Spread genislemesi olasi.',
      goldImpact: 'Guvercin tonlu kararlar altin icin pozitif. Sahin tonlu kararlar ons altinda baski yaratir.',
      watchlist: country === 'TR' ? ['XBANK', 'GARAN', 'AKBNK', 'USDTRY', 'TR10Y'] : ['DXY', 'SPY', 'GLD', 'USDTRY', 'XU100'],
      historicalContext: 'Para politikasi kararlari piyasada en yuksek volatilite yaratan olaylardandir. Karar metnindeki tek bir kelime piyasayi hareket ettirebilir.',
    };
  }

  if (cat === 'data') {
    return {
      bullishScenario: 'Konsensus altinda enflasyon / iyi buyume / guclu istihdam — risk varliklar pozitif, faiz indirim beklentisi artar.',
      baseScenario: 'Veri konsensus seviyesinde — sinirli piyasa tepkisi, ana hareket sonraki veri/karar setine kalir.',
      bearishScenario: 'Konsensus ustunde enflasyon / zayif buyume / dusuk istihdam — risk varliklar satis, faiz indirim beklentisi geri itilir.',
      bistImpact: country === 'TR' ? 'TR verileri BIST 100 endeksinde dogrudan etki yaratir. Enflasyon yuksek gelirse banka satisi, dusuk gelirse rali olasi.' : 'ABD/AB verileri TR borsasini dolayli etkiler — DXY ve risk istahi uzerinden.',
      usdtryImpact: country === 'TR' ? 'TR verileri TRY uzerinde dogrudan etkili.' : 'ABD verileri DXY uzerinden USD/TRY yonune etki eder.',
      goldImpact: 'Enflasyon sürprizleri altin icin kritik. Yuksek enflasyon -> altin pozitif; düsük enflasyon -> altin baski.',
      watchlist: country === 'TR' ? ['XU100', 'XBANK', 'USDTRY', 'Gram Altin'] : ['DXY', 'TLT', 'GLD', 'SPY'],
      historicalContext: 'Veri aciklamasindan sonra ilk 30 dakikada hacim ve oynaklik en yuksek seviyede. Surpriz veriler trend donusumlerine yol acabilir.',
    };
  }

  if (cat === 'political') {
    return {
      bullishScenario: 'Belirsizligi azaltan / piyasa dostu karar — risk primi duser, BIST yukseli, TRY pozitif.',
      baseScenario: 'Karar belirsizlik suresini uzatir — piyasa kararsiz, TRY zayif bias, BIST yatay.',
      bearishScenario: 'Kriz yaratan / piyasa karsiti karar — derin risk primi yukseli, BIST satis, TRY hizla deger kaybeder.',
      bistImpact: 'XU100 endeksinde %2-5 hareket araliği. Bankacilik ve buyuk olcekli sanayi en duyarli.',
      usdtryImpact: 'Siyasi gelismeler TRY oynakligini sert artirir. Stop emirleri ve spread genislemesi olasi.',
      goldImpact: 'TRY zayiflarsa gram altin guclu. Jeopolitik prim ons altina yansiyabilir.',
      watchlist: ['XU100', 'XBANK', 'GARAN', 'USDTRY', 'EURTRY', 'Gram Altin'],
      historicalContext: 'Siyasi olaylarin piyasa etkisi yorum subjektif. Pozisyon almak yerine pozisyonu hafifletme stratejisi daha guvenli.',
    };
  }

  if (cat === 'holiday') {
    return {
      bullishScenario: 'Tatil sonrasi guclu acilis — birikmis olumlu haberlerin fiyatlanmasi.',
      baseScenario: 'Tatil oncesi/sonrasi sinirli hareket — likidite dusuk, gercek trend tatil sonrasi 2-3 gunde belli olur.',
      bearishScenario: 'Tatilde gelisen olumsuz haber/global gelisme — acilista boslukla satis baskisi.',
      bistImpact: 'Tatil oncesi pozisyon hafifletme egilimi. Tatil donusu acilista volatilite yuksek olabilir.',
      usdtryImpact: 'TR tatillerinde TRY offshore islemlerle hareket edebilir. Tatil donusu ilk islem gununde fark olusabilir.',
      goldImpact: 'Tatil donemlerinde fiziki altin talebi etkili olabilir (bayram, dugun donemleri).',
      watchlist: ['XU100', 'USDTRY', 'Gram Altin'],
      historicalContext: 'Uzun tatil oncesi pozisyon hafifletme stratejik dogrudur. Gap riski sinirli pozisyonla yonetilebilir.',
    };
  }

  if (cat === 'derivatives') {
    return {
      bullishScenario: 'Vade sonu yakini squeeze - kisaklamalardan zorla kapama ile spot yukari hareket.',
      baseScenario: 'Vade sonu yaklasirken volatilite artar, spot fiyat olusumu vadeli pozisyonlarinin etkisinde.',
      bearishScenario: 'Vadeli uzun pozisyonlar baskili — rollover yapilmadiginda spot da satilir.',
      bistImpact: 'BIST 30 vade sonunda volatilite artar. Endeks fiyatinda son saatlerde hizli hareket olasi.',
      usdtryImpact: 'USD/TRY vade sonu offshore baski ile sapma yaratabilir.',
      goldImpact: 'Altin vadeli ortemler sinirli; spot piyasa eskoritle hareket eder.',
      watchlist: ['XU30', 'XU100', 'USDTRY', 'F_XU0306'],
      historicalContext: 'Vade sonu son 30 dakikada islem hacmi katlanir, spread genisler. Vadeli pozisyon kapama icin son hafta tercih edilir.',
    };
  }

  // corporate veya bilinmeyen
  return {
    bullishScenario: 'Olumlu gelisme — ilgili hisse/sektor pozitif tepki.',
    baseScenario: 'Beklenti dahili karar — sinirli tepki, ana trend devam eder.',
    bearishScenario: 'Olumsuz gelisme — ilgili hisse/sektor satis baskisi altinda.',
    bistImpact: 'Sirket bazli haberler ilgili hissede dogrudan etki yaratir.',
    watchlist: [],
    historicalContext: 'Sirket gelismelerinde ilk fiyatlama ozellikle ilk 15-30 dakikada netlesir.',
  };
}

function ProDetailPanel({ event, proUser }: { event: CalendarEvent; proUser: boolean }) {
  const a = event.proAnalysis ?? defaultAnalysis(event);

  if (!proUser) {
    // Free user — paywall card
    return (
      <div className="relative overflow-hidden rounded-lg border-2 border-warning/50 bg-gradient-to-br from-warning/15 via-warning/5 to-transparent p-3 shadow-[0_0_24px_rgba(245,158,11,0.15)]">
        <div className="flex items-start gap-2.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-warning/20 text-warning shadow-inner">
            <Crown size={18} strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-warning uppercase tracking-wider mb-0.5">PRO Analiz Kilitli</div>
            <p className="text-[11px] leading-relaxed text-slate-300">
              3 senaryo (yukseli/baz/dusus), BIST + USD + altin etkisi, izlenecek varliklar listesi ve tarihsel context.
            </p>
            <Link
              to="/uyelik"
              className="mt-2 inline-flex items-center gap-1 rounded-md bg-warning px-2.5 py-1 text-[11px] font-bold text-bg-base hover:bg-warning/90 transition"
            >
              PRO Ol — Tum Detaylara Eris
              <ArrowUpRight size={11} strokeWidth={3} />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // PRO user — full content
  return (
    <div className="space-y-2.5">
      {/* Senaryo cards */}
      <div className="grid grid-cols-1 gap-1.5">
        {a.bullishScenario && (
          <div className="flex items-start gap-2 rounded-md border-l-2 border-success bg-success/10 px-2.5 py-1.5">
            <ArrowUpRight size={12} className="mt-0.5 shrink-0 text-success" strokeWidth={2.5} />
            <div className="text-[11px] leading-snug">
              <span className="font-bold text-success">YUKSELIS: </span>
              <span className="text-slate-200">{a.bullishScenario}</span>
            </div>
          </div>
        )}
        {a.baseScenario && (
          <div className="flex items-start gap-2 rounded-md border-l-2 border-slate-500 bg-slate-500/10 px-2.5 py-1.5">
            <Minus size={12} className="mt-0.5 shrink-0 text-slate-400" strokeWidth={2.5} />
            <div className="text-[11px] leading-snug">
              <span className="font-bold text-slate-300">BAZ: </span>
              <span className="text-slate-300">{a.baseScenario}</span>
            </div>
          </div>
        )}
        {a.bearishScenario && (
          <div className="flex items-start gap-2 rounded-md border-l-2 border-danger bg-danger/10 px-2.5 py-1.5">
            <ArrowDownRight size={12} className="mt-0.5 shrink-0 text-danger" strokeWidth={2.5} />
            <div className="text-[11px] leading-snug">
              <span className="font-bold text-danger">DUSUS: </span>
              <span className="text-slate-200">{a.bearishScenario}</span>
            </div>
          </div>
        )}
      </div>

      {/* Asset impact grid */}
      {(a.bistImpact || a.usdtryImpact || a.goldImpact) && (
        <div className="rounded-md border border-border bg-bg-card/30 p-2">
          <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-1">Varlik Etkisi</div>
          <div className="space-y-1 text-[11px] leading-snug">
            {a.bistImpact && (
              <div className="flex gap-1.5"><span className="font-semibold text-accent shrink-0">BIST:</span><span className="text-slate-300">{a.bistImpact}</span></div>
            )}
            {a.usdtryImpact && (
              <div className="flex gap-1.5"><span className="font-semibold text-success shrink-0">USD/TRY:</span><span className="text-slate-300">{a.usdtryImpact}</span></div>
            )}
            {a.goldImpact && (
              <div className="flex gap-1.5"><span className="font-semibold text-warning shrink-0">Altin:</span><span className="text-slate-300">{a.goldImpact}</span></div>
            )}
          </div>
        </div>
      )}

      {/* Watchlist */}
      {a.watchlist && a.watchlist.length > 0 && (
        <div>
          <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-1">
            <Eye size={10} /> Izlenecek
          </div>
          <div className="flex flex-wrap gap-1">
            {a.watchlist.map((sym) => (
              <span key={sym} className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-accent ring-1 ring-accent/30">
                {sym}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Historical context */}
      {a.historicalContext && (
        <div className="flex items-start gap-1.5 rounded-md bg-slate-900/40 px-2.5 py-1.5">
          <History size={11} className="mt-0.5 shrink-0 text-slate-400" />
          <p className="text-[11px] italic leading-snug text-slate-400">{a.historicalContext}</p>
        </div>
      )}
    </div>
  );
}

const CALENDAR_COLLAPSE_KEY = 'fa.rightCalendar.collapsed';

export function EconomicCalendarWidget({
  compact = false,
  maxItems,
  daysAhead = 14,
  className,
  collapsible = false,
}: Props) {
  const [calCollapsed, setCalCollapsed] = useState<boolean>(() => {
    if (!collapsible) return false;
    try {
      return localStorage.getItem(CALENDAR_COLLAPSE_KEY) !== '0';  // default kapali
    } catch {
      return true;
    }
  });
  const toggleCalCollapsed = (e: React.MouseEvent) => {
    if (!collapsible) return;
    e.preventDefault();
    e.stopPropagation();
    const next = !calCollapsed;
    setCalCollapsed(next);
    try {
      localStorage.setItem(CALENDAR_COLLAPSE_KEY, next ? '1' : '0');
    } catch { /* ignore */ }
  };
  const limit = maxItems ?? (compact ? 5 : 25);
  const events = useMemo(() => {
    const ev = upcomingEvents(new Date(), daysAhead);
    return ev.slice(0, limit);
  }, [daysAhead, limit]);

  const user = useAuth((s) => s.user);
  const proUser = isPro(user);
  const [openId, setOpenId] = useState<string | null>(null);

  if (events.length === 0) {
    return (
      <div className={cn('rounded-xl border border-border bg-bg-soft p-4 text-center text-xs text-slate-500', className)}>
        <CalendarClock size={24} className="mx-auto mb-2 opacity-50" />
        Yaklasan onemli olay yok.
      </div>
    );
  }

  return (
    <div className={cn('rounded-xl border border-border bg-bg-soft overflow-hidden shadow-lg', className)}>
      {/* HEADER — collapsible ise akordiyon toggle, degilse /takvim'e Link */}
      {collapsible ? (
        <button
          type="button"
          onClick={toggleCalCollapsed}
          className="group relative flex w-full items-center justify-between border-b border-border bg-gradient-to-r from-accent/20 via-accent/10 to-transparent px-3 py-2.5 transition hover:from-accent/30 hover:via-accent/15"
          aria-expanded={!calCollapsed}
        >
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-warning/20 text-warning shadow-inner group-hover:bg-warning/30 transition">
            <CalendarClock size={15} strokeWidth={2.5} />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-200 tracking-tight flex items-center gap-1">
              Ekonomik Takvim
              <ChevronRight size={14} className="text-slate-400 group-hover:translate-x-0.5 group-hover:text-accent transition" />
            </div>
            <div className="text-[10px] text-slate-400 -mt-0.5">{events.length} onemli olay yaklasiyor — detay icin tikla</div>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-md bg-danger/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-danger ring-1 ring-danger/40">
          <Sparkles size={9} />
          Canli
        </div>
        </button>
      ) : (
        <Link
          to="/takvim"
          className="group relative flex items-center justify-between border-b border-border bg-gradient-to-r from-accent/20 via-accent/10 to-transparent px-3 py-2.5 transition hover:from-accent/30 hover:via-accent/15"
        >
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-md bg-warning/20 text-warning shadow-inner group-hover:bg-warning/30 transition">
              <CalendarClock size={15} strokeWidth={2.5} />
            </div>
            <div className="text-left">
              <div className="text-sm font-semibold text-slate-200 tracking-tight flex items-center gap-1">
                Ekonomik Takvim
                <ChevronDown size={14} className={cn("text-slate-400 transition-transform", calCollapsed && '-rotate-90')} />
              </div>
              <div className="text-[10px] text-slate-400 -mt-0.5">{events.length} onemli olay yaklasiyor{calCollapsed ? ' — tikla ac' : ''}</div>
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-md bg-danger/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-danger ring-1 ring-danger/40">
            <Sparkles size={9} />
            Canli
          </div>
        </Link>
      )}

      {/* LIST — collapsible iken collapsed ise gizle */}
      {(!collapsible || !calCollapsed) && (
        <>
      <ul className="divide-y divide-border max-h-[680px] overflow-y-auto">
        {events.map((e) => {
          const imp = IMPORTANCE_STYLE[e.importance];
          const cat = CATEGORY_STYLE[e.category];
          const ctry = COUNTRY_STYLE[e.country];
          const date = formatDate(e.date);
          const isOpen = openId === e.id;
          const hasProContent = !!e.proAnalysis;

          return (
            <li
              key={e.id}
              className={cn(
                'relative transition-colors',
                date.isToday && 'bg-accent/5',
              )}
            >
              {/* Tiklanir kart */}
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : e.id)}
                className="flex w-full gap-3 px-3 py-3 text-left hover:bg-bg-card/40 transition"
              >
                {/* SOL: Importance dikey cubuk */}
                <div className={cn('w-1 rounded-full self-stretch shrink-0', imp.bar, e.importance === 'high' && imp.glow)} />

                <div className="flex-1 min-w-0 space-y-1.5">
                  {/* Top row: tarih + saat + ulke + kategori */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wider',
                        date.isToday && 'bg-accent text-white shadow-[0_0_8px_rgba(56,189,248,0.5)]',
                        date.isTomorrow && 'bg-accent/30 text-accent ring-1 ring-accent/50',
                        !date.isToday && !date.isTomorrow && 'bg-accent/15 text-accent ring-1 ring-accent/30',
                      )}
                    >
                      {date.label}
                    </span>

                    {e.time && (
                      <span className="inline-flex items-center rounded-md bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-accent ring-1 ring-accent/25">
                        {e.time}
                      </span>
                    )}

                    <span className={cn(
                      'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold',
                      ctry.cls,
                    )}>
                      <span className="text-sm leading-none">{ctry.flag}</span>
                      {e.country}
                    </span>

                    <span className={cn(
                      'ml-auto inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider',
                      cat.cls,
                    )}>
                      {cat.label}
                    </span>
                  </div>

                  {/* Title + chevron */}
                  <div className="flex items-start gap-1.5">
                    <ImpactIcon impact={e.impact} large={!compact} />
                    <h4 className={cn(
                      'flex-1 font-bold leading-snug text-slate-50',
                      compact ? 'text-xs' : 'text-sm',
                    )}>
                      {e.title}
                    </h4>
                    {hasProContent && !proUser && (
                      <Lock size={11} className="mt-0.5 shrink-0 text-warning" strokeWidth={2.5} />
                    )}
                    <ChevronDown
                      size={14}
                      className={cn(
                        'mt-0.5 shrink-0 text-slate-500 transition-transform',
                        isOpen && 'rotate-180 text-accent',
                      )}
                    />
                  </div>

                  {/* Description + expectation (sadece full mode, kapali iken bile gorunur) */}
                  {!compact && (
                    <>
                      {e.description && (
                        <p className="text-[11px] leading-relaxed text-slate-400 pl-5">
                          {e.description}
                        </p>
                      )}
                      {e.expectation && (
                        <div className="flex items-start gap-1.5 rounded-md border-l-2 border-accent bg-accent/10 px-2 py-1.5 ml-5">
                          <AlertCircle size={11} className="mt-0.5 shrink-0 text-accent" strokeWidth={2.5} />
                          <p className="text-[11px] leading-snug font-medium text-slate-200">
                            {e.expectation}
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </button>

              {/* Expanded: PRO detail panel */}
              {isOpen && (
                <div className="border-t border-border bg-bg-card/20 px-3 py-3">
                  {/* Compact mode'da description'i acmadan once goster */}
                  {compact && e.description && (
                    <p className="text-[11px] leading-relaxed text-slate-400 mb-2">{e.description}</p>
                  )}
                  {compact && e.expectation && (
                    <div className="flex items-start gap-1.5 rounded-md border-l-2 border-accent bg-accent/10 px-2 py-1.5 mb-2">
                      <AlertCircle size={11} className="mt-0.5 shrink-0 text-accent" strokeWidth={2.5} />
                      <p className="text-[11px] leading-snug font-medium text-slate-200">{e.expectation}</p>
                    </div>
                  )}
                  <ProDetailPanel event={e} proUser={proUser} />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* FOOTER */}
      <Link
        to="/takvim"
        className="flex items-center justify-between border-t border-border bg-bg-card/30 px-3 py-2 text-[10px] text-slate-400 hover:bg-bg-card/50 hover:text-accent transition"
      >
        <span><span className="font-semibold">Kaynaklar:</span> TCMB, FED, ECB, TUIK, BLS</span>
        <span className="flex items-center gap-0.5 font-semibold">
          Tum takvim <ArrowUpRight size={10} strokeWidth={2.5} />
        </span>
      </Link>
        </>
      )}
    </div>
  );
}

export function useUpcomingEventCount(daysAhead = 7): number {
  return upcomingEvents(new Date(), daysAhead).length;
}

export { CURATED_CALENDAR, upcomingEvents };
export type { CalendarEvent };
