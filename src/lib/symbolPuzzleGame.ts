/**
 * Sembol Bulmaca — günlük şirket tahmin oyunu.
 *
 * Mekanik:
 *  - Her gün BIST evreninden deterministic 1 şirket seçilir
 *  - 3 ipucu kademeli açılır:
 *    1. Sektör (ücretsiz)
 *    2. İlk harf + isim uzunluğu (10 puan kaybı)
 *    3. İsmin ilk yarısı + sektör detay (20 puan kaybı)
 *  - 3 deneme hakkı
 *  - Puan: 1. denemede = 50, 2. = 35, 3. = 20
 */

import { BIST_UNIQUE } from '@/data/bistAll';

const STORAGE_KEY = 'fa.symbolPuzzle.v1';

export interface PuzzleHint {
  level: 1 | 2 | 3;
  text: string;
  costPoints: number;  // ipucu kullanildiginda puan kaybi
}

export interface SymbolPuzzleState {
  date: string;
  symbol: string;       // hedef sembol
  name: string;
  sector: string;
  hints: PuzzleHint[];
  hintsUsed: number[];  // [1, 2] gibi - acilan ipucu seviyeleri
  attempts: string[];   // kullanicinin denedikleri
  guessedAt?: number;
  correct?: boolean;
  points?: number;
}

interface StoredState {
  [date: string]: SymbolPuzzleState;
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

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Date-seeded deterministic pick. Tum kullanicilar ayni puzzle'i goruyor. */
function pickForDate(date: string): typeof BIST_UNIQUE[number] {
  let seed = 0;
  for (const ch of date) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
  // Mulberry32
  seed = (seed + 0x6D2B79F5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  const idx = Math.floor(r * BIST_UNIQUE.length);
  return BIST_UNIQUE[idx];
}

/** 3 ipucu uret — sektor, ilk harf+uzunluk, isim yarisi. */
function buildHints(picked: typeof BIST_UNIQUE[number]): PuzzleHint[] {
  const name = picked.name;
  const firstChar = name.charAt(0);
  const len = name.length;
  const half = name.slice(0, Math.ceil(name.length / 2)) + '...';
  return [
    { level: 1, text: `Sektor: ${picked.sector}`, costPoints: 0 },
    { level: 2, text: `Isim ${firstChar} ile basliyor, ${len} karakter`, costPoints: 10 },
    { level: 3, text: `Ismin baslangici: "${half}"`, costPoints: 20 },
  ];
}

/** Bugünün puzzle'ini al — yoksa yeni olustur. */
export function getTodaysPuzzle(): SymbolPuzzleState {
  const date = todayIso();
  const all = load();
  if (all[date]) return all[date];
  const picked = pickForDate(date);
  const puzzle: SymbolPuzzleState = {
    date,
    symbol: picked.symbol,
    name: picked.name,
    sector: picked.sector,
    hints: buildHints(picked),
    hintsUsed: [1],  // ilk ipucu otomatik acik
    attempts: [],
  };
  all[date] = puzzle;
  save(all);
  return puzzle;
}

/** Bir ipucunu ac. Geri donusu: guncellenmis state. */
export function revealHint(level: 1 | 2 | 3): SymbolPuzzleState {
  const all = load();
  const date = todayIso();
  const p = all[date] ?? getTodaysPuzzle();
  if (!p.hintsUsed.includes(level)) {
    p.hintsUsed = [...p.hintsUsed, level].sort();
  }
  all[date] = p;
  save(all);
  return p;
}

/** Bir tahmin gonder. Geri donusu: { state, correct }. */
export function submitGuess(guess: string): { state: SymbolPuzzleState; correct: boolean } {
  const all = load();
  const date = todayIso();
  const p = all[date] ?? getTodaysPuzzle();
  if (p.guessedAt) return { state: p, correct: !!p.correct };
  const norm = (s: string) => s.toUpperCase().replace(/[İıÖöÜüŞşÇçĞğ]/g, (c) => ({
    'İ': 'I', 'ı': 'I', 'Ö': 'O', 'ö': 'O', 'Ü': 'U', 'ü': 'U',
    'Ş': 'S', 'ş': 'S', 'Ç': 'C', 'ç': 'C', 'Ğ': 'G', 'ğ': 'G',
  } as Record<string, string>)[c] || c).trim();
  const guessNorm = norm(guess);
  const correct = guessNorm === norm(p.symbol) || guessNorm === norm(p.name) ||
    norm(p.name).startsWith(guessNorm) && guessNorm.length >= 4;
  p.attempts = [...p.attempts, guess];
  if (correct || p.attempts.length >= 3) {
    p.correct = correct;
    p.guessedAt = Date.now();
    // Puan hesabi: attempt sayisi + acilan ipucu maliyeti
    let basePoints = 0;
    if (correct) {
      basePoints = p.attempts.length === 1 ? 50 : p.attempts.length === 2 ? 35 : 20;
    }
    // Acilan ekstra ipucu maliyeti (level 1 free; 2 = -10, 3 = -20)
    const hintCost = p.hintsUsed.reduce((sum, lv) => sum + (p.hints[lv - 1]?.costPoints ?? 0), 0);
    p.points = Math.max(0, basePoints - hintCost);
  }
  all[date] = p;
  save(all);
  return { state: p, correct };
}

export function getHistory(): SymbolPuzzleState[] {
  const all = load();
  return Object.values(all)
    .filter((g) => g.guessedAt != null)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 30);
}

export function getStats() {
  const h = getHistory();
  const correct = h.filter((g) => g.correct).length;
  const points = h.reduce((s, g) => s + (g.points ?? 0), 0);
  let streak = 0;
  for (let i = 0; i < h.length; i++) {
    if (h[i].correct) {
      if (i === streak) streak += 1;
    } else break;
  }
  return {
    totalGames: h.length,
    correctCount: correct,
    accuracy: h.length > 0 ? (correct / h.length) * 100 : 0,
    totalPoints: points,
    currentStreak: streak,
  };
}
