import type { NewsItem } from '@/data/types';

/**
 * Grafik olay katmanı — Sinyal Motoru Hafta 2 (15 Eki 2026).
 * Sembol haber akışından deterministik sınıflandırma; LLM yok. Olay = tarih + tür +
 * kısa etiket + kaynak haber. Grafikte numaralı işaret, altında numaralı liste.
 */
export type ChartEventKind = 'kritik' | 'temettu' | 'bedelsiz' | 'geri-alim' | 'bilanco' | 'kap';

export interface ChartEvent {
  n: number;            // 1..N, grafik ve liste aynı numarayı kullanır
  date: number;         // ms (gün başı, TR)
  kind: ChartEventKind;
  label: string;        // "Temettü", "Bedelsiz", "KAP", "Kritik · İflas"
  title: string;
  url?: string;
  source: string;
}

const RULES: Array<{ kind: ChartEventKind; label: string; re: RegExp }> = [
  { kind: 'temettu', label: 'Temettü', re: /temett[üu]|kar\s+pay[ıi]\s+da[ğg][ıi]t/i }, // \b Türkçe harflerle çalışmaz (JS word boundary ASCII)
  { kind: 'bedelsiz', label: 'Bedelsiz', re: /bedelsiz|sermaye\s+art[ıi]r[ıi]m/i },
  { kind: 'geri-alim', label: 'Geri alım', re: /pay\s+geri\s+al[ıi]m|geri\s+al[ıi]m\s+program/i },
  { kind: 'bilanco', label: 'Bilanço', re: /bilan[çc]o|finansal\s+sonu[çc]|net\s+(kar|zarar)\s+a[çc][ıi]kla|dönem\s+kar/i },
  { kind: 'kap', label: 'KAP', re: /\bKAP\b|özel\s+durum\s+a[çc][ıi]klama|ihale|sözleşme\s+imzala|iş\s+ilişkisi/i },
];

export function classifyEvent(n: NewsItem): { kind: ChartEventKind; label: string } | null {
  if (n.critical) return { kind: 'kritik', label: `Kritik${n.criticalReason ? ` · ${n.criticalReason}` : ''}` };
  const text = `${n.title} ${n.summary ?? ''}`;
  for (const r of RULES) if (r.re.test(text)) return { kind: r.kind, label: r.label };
  return null;
}

const dayKeyTR = (ms: number) => new Date(ms + 3 * 3_600_000).toISOString().slice(0, 10);

/**
 * Haberlerden olay listesi. Aynı gün + aynı tür tek olay (ilk/en güncel haber kalır).
 * Pencere dışı (grafiğin ilk tarihinden eski) olaylar atılır. En fazla `max` olay,
 * kronolojik (eski → yeni) numaralanır.
 */
export function buildChartEvents(news: NewsItem[], opts: { from?: number; to?: number; max?: number } = {}): ChartEvent[] {
  const max = opts.max ?? 8;
  const seen = new Set<string>();
  const out: Omit<ChartEvent, 'n'>[] = [];
  const sorted = [...news].sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt));
  for (const item of sorted) {
    const t = +new Date(item.publishedAt);
    if (!Number.isFinite(t)) continue;
    if (opts.from != null && t < opts.from) continue;
    if (opts.to != null && t > opts.to) continue;
    const c = classifyEvent(item);
    if (!c) continue;
    const key = `${dayKeyTR(t)}|${c.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ date: t, kind: c.kind, label: c.label, title: item.title, url: item.url, source: item.source });
  }
  // Öncelik: kritik > temettü/bedelsiz/geri alım/bilanço > KAP; sonra en yeni
  const rank: Record<ChartEventKind, number> = { kritik: 0, temettu: 1, bedelsiz: 1, 'geri-alim': 1, bilanco: 1, kap: 2 };
  out.sort((a, b) => rank[a.kind] - rank[b.kind] || b.date - a.date);
  return out.slice(0, max).sort((a, b) => a.date - b.date).map((e, i) => ({ ...e, n: i + 1 }));
}
