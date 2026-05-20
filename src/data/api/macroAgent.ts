/**
 * Frontend client — /api/agents/macro Pages Function.
 * Claude Haiku ile günlük makro risk skoru + yorumu.
 */

export interface MacroAgentDriver {
  name: string;
  impact: 'pozitif' | 'negatif' | 'nötr';
  note: string;
}

export interface MacroAgentSnapshot {
  symbol: string;
  label: string;
  value: number;
  changePct: number;
  unit?: string;
}

export interface MacroAgentResponse {
  ok: boolean;
  generatedAt: string;
  model: string;
  riskScore?: number;
  riskLabel?: 'düşük' | 'orta' | 'yüksek' | 'çok yüksek';
  headline?: string;
  commentary?: string;
  drivers?: MacroAgentDriver[];
  snapshot?: MacroAgentSnapshot[];
  error?: string;
}

const TTL_MS = 60 * 60_000; // 1 saat (Claude değerlendirmesi pahalı, yavaş güncelle)
let _cache: { data: MacroAgentResponse; t: number } | null = null;

export async function runMacroAgent(force = false): Promise<MacroAgentResponse | null> {
  if (!force && _cache && Date.now() - _cache.t < TTL_MS) {
    return _cache.data;
  }
  try {
    const r = await fetch('/api/agents/macro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({}),
    });
    const ct = r.headers.get('content-type') ?? '';
    if (!ct.includes('application/json')) return null;
    // ok:false JSON cevabini da dondur, widget gercek hata mesajini gostersin
    const data = (await r.json()) as MacroAgentResponse;
    _cache = { data, t: Date.now() };
    return data;
  } catch {
    return null;
  }
}

export function riskTone(label?: string): { bg: string; text: string; border: string } {
  switch (label) {
    case 'düşük':       return { bg: 'bg-success/15', text: 'text-success', border: 'border-success/30' };
    case 'orta':        return { bg: 'bg-warning/15', text: 'text-warning', border: 'border-warning/30' };
    case 'yüksek':      return { bg: 'bg-danger/15',  text: 'text-danger',  border: 'border-danger/30' };
    case 'çok yüksek':  return { bg: 'bg-danger/20',  text: 'text-danger',  border: 'border-danger/50' };
    default:            return { bg: 'bg-slate-500/15', text: 'text-slate-400', border: 'border-border' };
  }
}
