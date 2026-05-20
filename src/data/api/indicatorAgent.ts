/**
 * Frontend client — /api/agents/indicator Pages Function.
 * Teknik gosterge taramasi (RSI, MACD, MA cross, hacim spike).
 */

export interface IndicatorSignal {
  symbol: string;
  price: number;
  changePct: number;
  strength: number;
  label: 'güçlü-al' | 'al' | 'nötr' | 'sat' | 'güçlü-sat';
  reasons: string[];
  metrics: {
    rsi?: number;
    macdCross?: 'up' | 'down' | null;
    maPosition?: string;
    volumeRatio?: number;
  };
}

export interface IndicatorAgentResponse {
  ok: boolean;
  generatedAt: string;
  scannedSymbols: number;
  signals: IndicatorSignal[];
  error?: string;
}

const TTL_MS = 15 * 60_000;
let _cache: { key: string; data: IndicatorAgentResponse; t: number } | null = null;

export async function runIndicatorAgent(opts: {
  symbols?: string[];
  force?: boolean;
} = {}): Promise<IndicatorAgentResponse | null> {
  const key = (opts.symbols ?? []).join(',');
  if (!opts.force && _cache && _cache.key === key && Date.now() - _cache.t < TTL_MS) {
    return _cache.data;
  }
  try {
    const r = await fetch('/api/agents/indicator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ symbols: opts.symbols }),
    });
    const ct = r.headers.get('content-type') ?? '';
    if (!ct.includes('application/json')) return null;
    // ok:false JSON cevabini da dondur, widget gercek hata mesajini gostersin
    const data = (await r.json()) as IndicatorAgentResponse;
    _cache = { key, data, t: Date.now() };
    return data;
  } catch {
    return null;
  }
}

export function labelTone(label: string): { bg: string; text: string; border: string } {
  switch (label) {
    case 'güçlü-al':  return { bg: 'bg-success/25', text: 'text-success', border: 'border-success/50' };
    case 'al':        return { bg: 'bg-success/15', text: 'text-success', border: 'border-success/30' };
    case 'nötr':      return { bg: 'bg-slate-500/15', text: 'text-slate-400', border: 'border-border' };
    case 'sat':       return { bg: 'bg-danger/15', text: 'text-danger', border: 'border-danger/30' };
    case 'güçlü-sat': return { bg: 'bg-danger/25', text: 'text-danger', border: 'border-danger/50' };
    default:          return { bg: 'bg-slate-500/15', text: 'text-slate-400', border: 'border-border' };
  }
}
