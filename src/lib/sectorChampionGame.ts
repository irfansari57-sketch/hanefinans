/**
 * Sektör Şampiyonu — haftalık BIST sektör endeksi tahmin oyunu.
 *
 * Mekanik:
 *  - Pazartesi: kullanıcı haftanın en iyi 3 sektörünü sırayla tahmin eder
 *  - Cuma 18:10: her sektörün haftalık % değişimi hesaplanır, sıralanır
 *  - Puanlama:
 *    - 1. sıra doğru: 75 puan
 *    - 2. sıra doğru: 50 puan
 *    - 3. sıra doğru: 30 puan
 *    - 3'ü de tam sırasıyla doğru (Trifekta): +100 bonus
 *    - Doğru sırada değilse ama listede ise: 10 puan teselli
 */

import { fetchIndexYahoo } from '@/data/api/yahoo';
import { thisMonday, thisFriday } from './virtualPortfolioGame';

const STORAGE_KEY = 'fa.sectorChampion.v1';

export interface SectorDef {
  symbol: string;       // Yahoo: XBANK.IS
  short: string;        // BANK
  name: string;         // Bankacılık
}

export const SECTOR_INDICES: SectorDef[] = [
  { symbol: 'XBANK.IS', short: 'XBANK', name: 'Bankacılık' },
  { symbol: 'XHOLD.IS', short: 'XHOLD', name: 'Holding & Yatırım' },
  { symbol: 'XSANI.IS', short: 'XSANI', name: 'Sanayi' },
  { symbol: 'XGIDA.IS', short: 'XGIDA', name: 'Gıda & İçecek' },
  { symbol: 'XTRZM.IS', short: 'XTRZM', name: 'Turizm' },
  { symbol: 'XELKT.IS', short: 'XELKT', name: 'Elektrik' },
  { symbol: 'XILTM.IS', short: 'XILTM', name: 'İletişim' },
  { symbol: 'XKMYA.IS', short: 'XKMYA', name: 'Kimya & Petrol' },
  { symbol: 'XMANA.IS', short: 'XMANA', name: 'Madencilik' },
  { symbol: 'XHIZM.IS', short: 'XHIZM', name: 'Hizmetler' },
];

export interface SectorChampionState {
  weekStart: string;          // YYYY-MM-DD (Pazartesi)
  weekEnd: string;            // YYYY-MM-DD (Cuma)
  picks: [string?, string?, string?];  // 1, 2, 3. sıra
  submittedAt?: number;
  resolvedAt?: number;
  results?: { sym: string; changePct: number }[];  // hafta sonu sıralı
  points?: number;
  correctSlots?: number[];    // [0, 2] gibi - doğru olan slot'lar
}

interface StoredState {
  [weekStart: string]: SectorChampionState;
}

function load(): StoredState {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as StoredState;
  } catch {
    return {};
  }
}

function save(s: StoredState): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* */ }
}

/** Bu haftanın state'ini al. */
export function getThisWeek(): SectorChampionState {
  const monday = thisMonday();
  const all = load();
  if (all[monday]) return all[monday];
  const state: SectorChampionState = {
    weekStart: monday,
    weekEnd: thisFriday(),
    picks: [undefined, undefined, undefined],
  };
  all[monday] = state;
  save(all);
  return state;
}

/** Pick'i guncelle (slot 0-2, sembol short). */
export function updatePick(slot: 0 | 1 | 2, sectorShort: string | undefined): SectorChampionState {
  const all = load();
  const monday = thisMonday();
  const state = all[monday] ?? getThisWeek();
  if (state.submittedAt) return state;
  const picks: [string?, string?, string?] = [...state.picks];
  // Eger sembol zaten baska slot'taysa kaldir
  for (let i = 0; i < 3; i++) {
    if (i !== slot && picks[i] === sectorShort) picks[i] = undefined;
  }
  picks[slot] = sectorShort;
  state.picks = picks;
  all[monday] = state;
  save(all);
  return state;
}

/** Tahminleri gonder — 3 secim de yapilmis olmali. */
export function submitPicks(): { ok: true; state: SectorChampionState } | { ok: false; error: string } {
  const all = load();
  const monday = thisMonday();
  const state = all[monday] ?? getThisWeek();
  if (state.submittedAt) return { ok: false, error: 'Bu hafta tahminin zaten gönderildi' };
  if (state.picks.some((p) => !p)) return { ok: false, error: '3 sektör tahmini gerekli' };
  state.submittedAt = Date.now();
  all[monday] = state;
  save(all);
  return { ok: true, state };
}

/** Cuma kapanışı sonrası resolve et — sektörlerin haftalık %'lerini cek, sırala, puanla. */
export async function tryResolve(): Promise<SectorChampionState | null> {
  const all = load();
  const monday = thisMonday();
  const state = all[monday] ?? getThisWeek();
  if (state.resolvedAt) return state;
  if (!state.submittedAt) return null;
  const now = new Date();
  const day = now.getDay();
  const isAfterClose = (day === 5 && (now.getHours() > 18 || (now.getHours() === 18 && now.getMinutes() >= 15)))
    || day === 6 || day === 0;
  if (!isAfterClose) return null;

  // Tum sektorlerin haftalik %'sini cek (basit: gunluk changePct yerine, ideal: weekly diff)
  // MVP: fetchIndexYahoo zaten gunluk donem; bunu hafta sonu icin yorumla
  // (Sonra dogru weekly icin /api/yahoo/historical kullanilabilir)
  const results: { sym: string; changePct: number }[] = [];
  for (const s of SECTOR_INDICES) {
    const r = await fetchIndexYahoo(s.symbol).catch(() => null);
    if (r && Number.isFinite(r.changePct)) {
      results.push({ sym: s.short, changePct: r.changePct });
    }
  }
  if (results.length === 0) return null;
  results.sort((a, b) => b.changePct - a.changePct);

  // Puanlama
  const correctSlots: number[] = [];
  let points = 0;
  for (let i = 0; i < 3; i++) {
    if (state.picks[i] === results[i].sym) {
      correctSlots.push(i);
      points += i === 0 ? 75 : i === 1 ? 50 : 30;
    } else if (state.picks[i] && results.slice(0, 3).some((r) => r.sym === state.picks[i])) {
      // Sektör top 3'te ama yanlış sırada
      points += 10;
    }
  }
  // Trifekta bonus
  if (correctSlots.length === 3) points += 100;

  state.results = results;
  state.correctSlots = correctSlots;
  state.points = points;
  state.resolvedAt = Date.now();
  all[monday] = state;
  save(all);
  return state;
}

export function getHistory(): SectorChampionState[] {
  const all = load();
  return Object.values(all)
    .filter((g) => g.resolvedAt != null)
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
    .slice(0, 10);
}

export function getStats() {
  const h = getHistory();
  const totalPoints = h.reduce((s, g) => s + (g.points ?? 0), 0);
  const trifectas = h.filter((g) => (g.correctSlots?.length ?? 0) === 3).length;
  return {
    totalWeeks: h.length,
    trifectas,
    totalPoints,
  };
}
