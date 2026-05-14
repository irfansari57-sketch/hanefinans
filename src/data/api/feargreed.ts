// Fear & Greed Index — alternative.me, CORS açık, key gerek yok.

export interface FearGreedSnapshot {
  value: number;          // 0-100
  classification: string; // 'Extreme Fear' | 'Fear' | 'Neutral' | 'Greed' | 'Extreme Greed'
  timestamp: number;      // unix ms
}

export async function fetchFearGreed(): Promise<FearGreedSnapshot | null> {
  try {
    const r = await fetch('https://api.alternative.me/fng/?limit=1');
    if (!r.ok) return null;
    const j = (await r.json()) as {
      data: Array<{ value: string; value_classification: string; timestamp: string }>;
    };
    const entry = j.data?.[0];
    if (!entry) return null;
    return {
      value: parseInt(entry.value, 10),
      classification: entry.value_classification,
      timestamp: parseInt(entry.timestamp, 10) * 1000,
    };
  } catch {
    return null;
  }
}

export function fearGreedTone(value: number): { label: string; tone: 'danger' | 'warning' | 'slate' | 'success' | 'accent' } {
  if (value <= 24) return { label: 'Aşırı Korku', tone: 'danger' };
  if (value <= 44) return { label: 'Korku', tone: 'warning' };
  if (value <= 55) return { label: 'Nötr', tone: 'slate' };
  if (value <= 74) return { label: 'Açgözlülük', tone: 'success' };
  return { label: 'Aşırı Açgözlülük', tone: 'accent' };
}
