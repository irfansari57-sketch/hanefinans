/**
 * Kural tabanlı alarmlar — saf değerlendirme (Hafta 4b, 22 Eki 2026).
 *
 * Fiyat eşiği alarmlarından farklı olarak burada koşul bir GÖSTERGE durumudur:
 * RSI eşiği, SMA kesişimi, sinyal motoru kuralı, 52h zirveye yakınlık veya
 * tarayıcı filtresi. Girdi `computeMetrics` çıktısı (bugün + isteğe bağlı dün)
 * ve `evaluateSignals` listesidir; çıktı "koşul sağlandı mı" + kanıt satırları.
 *
 * Bu modül hem sunucu cron'unda (functions/api/cron/rule-alerts.ts) hem istemcide
 * (etiket/validasyon) kullanılır; DOM/D1 bağımlılığı YOKTUR.
 *
 * SPK dili: "al/sat" yok — yalnızca "koşul sağlandı". Yatırım tavsiyesi değildir.
 */
import type { StockMetrics, ScreenFilter } from './metrics';
import { matchesFilter, describeFilter, EMPTY_FILTER } from './metrics';
import { SIGNAL_LABELS, type Signal, type SignalKind } from './signals';

export type RuleKind =
  | 'rsi_below'
  | 'rsi_above'
  | 'cross_sma50'
  | 'cross_sma200'
  | 'signal'
  | 'near_52w_high'
  | 'screen';

export const RULE_KINDS: RuleKind[] = ['rsi_below', 'rsi_above', 'cross_sma50', 'cross_sma200', 'signal', 'near_52w_high', 'screen'];

export const RULE_KIND_LABELS: Record<RuleKind, string> = {
  rsi_below: 'RSI(14) eşiğin altına indi',
  rsi_above: 'RSI(14) eşiğin üstüne çıktı',
  cross_sma50: 'Fiyat SMA50 ile kesişti',
  cross_sma200: 'Fiyat SMA200 ile kesişti',
  signal: 'Sinyal motoru kuralı sağlandı',
  near_52w_high: '52 haftalık zirveye yaklaştı',
  screen: 'Tarayıcı filtresi sağlandı',
};

export type CrossDirection = 'up' | 'down' | 'any';

/** rule_json içerikleri — kind'a göre. */
export interface RsiRuleJson { threshold: number }
export interface CrossRuleJson { direction?: CrossDirection }
export interface SignalRuleJson { kind: SignalKind }
export interface Near52wRuleJson { maxPct: number }
export type ScreenRuleJson = ScreenFilter;

export type RuleAlertRule =
  | { kind: 'rsi_below'; params: RsiRuleJson }
  | { kind: 'rsi_above'; params: RsiRuleJson }
  | { kind: 'cross_sma50'; params: CrossRuleJson }
  | { kind: 'cross_sma200'; params: CrossRuleJson }
  | { kind: 'signal'; params: SignalRuleJson }
  | { kind: 'near_52w_high'; params: Near52wRuleJson }
  | { kind: 'screen'; params: ScreenRuleJson };

export interface RuleEvidence { label: string; value: string; source?: string }

export interface RuleEvaluation {
  /** Koşul bugünkü barda sağlandı mı. */
  matched: boolean;
  /** Veri yetersizse (ör. SMA200 için 200 bar yok) true; matched her zaman false. */
  insufficient: boolean;
  /** İnsan diliyle tek satır (bildirim gövdesi / UI). */
  summary: string;
  evidence: RuleEvidence[];
}

const f2 = (v: number) => v.toFixed(2);
const SRC = 'bars_daily';

/** Kuralı tek satır Türkçe etiketler — liste kartı ve bildirim başlığı için. */
export function describeRule(rule: RuleAlertRule): string {
  switch (rule.kind) {
    case 'rsi_below': return `RSI(14) < ${rule.params.threshold}`;
    case 'rsi_above': return `RSI(14) > ${rule.params.threshold}`;
    case 'cross_sma50':
    case 'cross_sma200': {
      const sma = rule.kind === 'cross_sma50' ? 'SMA50' : 'SMA200';
      const d = rule.params.direction ?? 'any';
      return d === 'up' ? `Fiyat ${sma} üstüne kesişti` : d === 'down' ? `Fiyat ${sma} altına kesişti` : `Fiyat ${sma} ile kesişti (iki yön)`;
    }
    case 'signal': return `Sinyal: ${SIGNAL_LABELS[rule.params.kind] ?? rule.params.kind}`;
    case 'near_52w_high': return `52h zirveye ≤ %${rule.params.maxPct}`;
    case 'screen': {
      const parts = describeFilter(rule.params);
      return parts.length ? `Filtre: ${parts.join(' · ')}` : 'Filtre: koşul yok';
    }
  }
}

/**
 * Ham (DB'den veya istekten gelen) kind + json'u doğrular ve tipli kurala çevirir.
 * Geçersizse null — sunucu 400, cron ise satırı atlar.
 */
export function parseRule(kind: string, raw: unknown): RuleAlertRule | null {
  const o = (raw != null && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  switch (kind as RuleKind) {
    case 'rsi_below':
    case 'rsi_above': {
      const t = num(o.threshold);
      if (t == null || t <= 0 || t >= 100) return null;
      return { kind, params: { threshold: t } } as RuleAlertRule;
    }
    case 'cross_sma50':
    case 'cross_sma200': {
      const d = o.direction;
      const direction: CrossDirection = d === 'up' || d === 'down' ? d : 'any';
      return { kind, params: { direction } } as RuleAlertRule;
    }
    case 'signal': {
      const k = o.kind;
      if (typeof k !== 'string' || !(k in SIGNAL_LABELS)) return null;
      return { kind: 'signal', params: { kind: k as SignalKind } };
    }
    case 'near_52w_high': {
      const m = num(o.maxPct);
      if (m == null || m <= 0 || m > 50) return null;
      return { kind: 'near_52w_high', params: { maxPct: m } };
    }
    case 'screen': {
      const f: ScreenFilter = { ...EMPTY_FILTER, ...(o as Partial<ScreenFilter>) };
      f.trends = Array.isArray(f.trends) ? f.trends : [];
      f.signals = Array.isArray(f.signals) ? f.signals : [];
      if (f.sma50 !== 'above' && f.sma50 !== 'below') f.sma50 = 'any';
      if (f.sma200 !== 'above' && f.sma200 !== 'below') f.sma200 = 'any';
      if (describeFilter(f).length === 0) return null; // boş filtre her gün tetiklenir → reddet
      return { kind: 'screen', params: f };
    }
    default:
      return null;
  }
}

function crossEval(
  label: 'SMA50' | 'SMA200',
  cur: number | null,
  prev: number | null | undefined,
  direction: CrossDirection,
  close: number,
): RuleEvaluation {
  if (cur == null || prev == null) {
    return { matched: false, insufficient: true, summary: `${label} için yeterli bar yok`, evidence: [] };
  }
  const up = prev < 0 && cur > 0;
  const down = prev > 0 && cur < 0;
  const matched = direction === 'up' ? up : direction === 'down' ? down : up || down;
  const dir = up ? 'yukarı' : down ? 'aşağı' : 'kesişim yok';
  return {
    matched,
    insufficient: false,
    summary: matched ? `Fiyat ${label} ${up ? 'üstüne' : 'altına'} kesişti` : `${label} kesişimi yok`,
    evidence: [
      { label: `${label}'ye uzaklık dün → bugün`, value: `${prev >= 0 ? '+' : ''}${f2(prev)}% → ${cur >= 0 ? '+' : ''}${f2(cur)}%`, source: SRC },
      { label: 'Kapanış', value: close.toLocaleString('tr-TR', { maximumFractionDigits: 2 }), source: SRC },
      { label: 'Yön', value: dir },
    ],
  };
}

/**
 * Tek kuralı bugünkü (ve kesişim için dünkü) metriklerle değerlendirir.
 *
 * @param rule        parseRule çıktısı
 * @param metrics     bugünkü computeMetrics (kapanmış son bar)
 * @param prevMetrics dünkü computeMetrics (son bar hariç) — yalnız cross_* için gerekli
 * @param signals     bugünkü evaluateSignals listesi — yalnız 'signal' için gerekli
 */
export function evaluateRule(
  rule: RuleAlertRule,
  metrics: StockMetrics,
  prevMetrics?: StockMetrics | null,
  signals: Signal[] = [],
): RuleEvaluation {
  switch (rule.kind) {
    case 'rsi_below':
    case 'rsi_above': {
      const r = metrics.rsi14;
      if (r == null) return { matched: false, insufficient: true, summary: 'RSI hesaplanamadı', evidence: [] };
      const t = rule.params.threshold;
      const matched = rule.kind === 'rsi_below' ? r < t : r > t;
      return {
        matched,
        insufficient: false,
        summary: `RSI(14) ${f2(r)} — eşik ${rule.kind === 'rsi_below' ? '<' : '>'} ${t}`,
        evidence: [
          { label: 'RSI(14)', value: f2(r), source: SRC },
          { label: 'Eşik', value: `${rule.kind === 'rsi_below' ? '<' : '>'} ${t}` },
          { label: 'Bar tarihi', value: metrics.asOfDate },
        ],
      };
    }
    case 'cross_sma50':
      return crossEval('SMA50', metrics.sma50Pct, prevMetrics?.sma50Pct, rule.params.direction ?? 'any', metrics.close);
    case 'cross_sma200':
      return crossEval('SMA200', metrics.sma200Pct, prevMetrics?.sma200Pct, rule.params.direction ?? 'any', metrics.close);
    case 'signal': {
      const hit = signals.find((s) => s.kind === rule.params.kind);
      const label = SIGNAL_LABELS[rule.params.kind] ?? rule.params.kind;
      if (!hit) {
        return { matched: false, insufficient: false, summary: `${label} koşulu sağlanmadı`, evidence: [{ label: 'Sinyal', value: label }, { label: 'Bar tarihi', value: metrics.asOfDate }] };
      }
      return {
        matched: true,
        insufficient: false,
        summary: `${hit.title} — güç ${hit.strength}/3`,
        evidence: hit.evidence.map((e) => ({ label: e.label, value: e.value, source: e.source })),
      };
    }
    case 'near_52w_high': {
      const d = metrics.from52wHighPct;
      if (d == null) return { matched: false, insufficient: true, summary: '52h verisi yetersiz', evidence: [] };
      const dist = -d; // from52wHighPct ≤ 0 → zirveye uzaklık pozitif
      const matched = dist <= rule.params.maxPct;
      return {
        matched,
        insufficient: false,
        summary: `52h zirveye uzaklık %${f2(dist)} — eşik ≤ %${rule.params.maxPct}`,
        evidence: [
          { label: 'Zirveye uzaklık', value: `%${f2(dist)}`, source: SRC },
          { label: 'Eşik', value: `≤ %${rule.params.maxPct}` },
          { label: 'Kapanış', value: metrics.close.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) },
        ],
      };
    }
    case 'screen': {
      const matched = matchesFilter(metrics, rule.params);
      const parts = describeFilter(rule.params);
      const ev: RuleEvidence[] = [];
      if (rule.params.rsiMin != null || rule.params.rsiMax != null) ev.push({ label: 'RSI(14)', value: metrics.rsi14 != null ? f2(metrics.rsi14) : '—', source: SRC });
      if (rule.params.sma50 !== 'any') ev.push({ label: 'SMA50 uzaklık', value: metrics.sma50Pct != null ? `${f2(metrics.sma50Pct)}%` : '—', source: SRC });
      if (rule.params.sma200 !== 'any' || rule.params.goldenCross) ev.push({ label: 'SMA200 uzaklık', value: metrics.sma200Pct != null ? `${f2(metrics.sma200Pct)}%` : '—', source: SRC });
      if (rule.params.near52wHighMax != null) ev.push({ label: '52h zirveye', value: metrics.from52wHighPct != null ? `${f2(metrics.from52wHighPct)}%` : '—', source: SRC });
      if (rule.params.volRatioMin != null) ev.push({ label: 'Hacim / 20g', value: metrics.volRatio20 != null ? `${f2(metrics.volRatio20)}×` : '—', source: SRC });
      if (rule.params.trends.length) ev.push({ label: 'Trend', value: metrics.trend ?? '—' });
      if (rule.params.signals.length) ev.push({ label: 'Sinyaller', value: metrics.signals.length ? metrics.signals.join(', ') : 'yok' });
      ev.push({ label: 'Filtre', value: parts.join(' · ') });
      return {
        matched,
        insufficient: false,
        summary: matched ? 'Tarayıcı filtresi sağlandı' : 'Filtre koşulları sağlanmadı',
        evidence: ev,
      };
    }
  }
}
