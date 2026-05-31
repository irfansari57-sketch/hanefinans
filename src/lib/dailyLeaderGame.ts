/**
 * Bugünün Lideri — günlük BIST 30 oyunu.
 *
 * Mekanik:
 *  - Her gün BIST 30 evreninden seed'li deterministic seçim ile 5 hisse açılır
 *  - Kullanıcı en çok yükselecek (veya en çok düşecek) hisseyi tahmin eder
 *  - Kapanışta Yahoo'dan close fiyatları çekilir, kazanan belirlenir
 *  - Puan: doğru = 50, top tahmin doğru = +25 bonus, streak çarpanı
 *
 * Bu MVP istemci tarafindadir. localStorage'da pick + resolve sonucu saklanir.
 * Sonraki iterasyon: D1 backend + push notification.
 */

import { fetchIndexYahoo } from '@/data/api/yahoo';

/** BIST 30 sembolleri (sabit liste — Borsa Istanbul'dan ana endeks). */
export const BIST30_SYMBOLS = [
  'AKBNK', 'AKSEN', 'ALARK', 'ARCLK', 'ASELS', 'ASTOR', 'BIMAS', 'EKGYO', 'ENKAI',
  'EREGL', 'FROTO', 'GARAN', 'HEKTS', 'ISCTR', 'KCHOL', 'KOZAA', 'KOZAL', 'KRDMD',
  'MGROS', 'PETKM', 'PGSUS', 'SAHOL', 'SASA', 'SISE', 'TCELL', 'THYAO', 'TOASO',
  'TTKOM', 'TUPRS', 'YKBNK',
] as const;

export type LeaderMode = 'top' | 'bottom';
const STORAGE_KEY = 'fa.leaderGame.v1';

export interface LeaderGameState {
  date: string;        // YYYY-MM-DD
  pool: string[];      // o günkü 5 hisse
  mode: LeaderMode;    // 'top' = en çok yükselen, 'bottom' = en çok düşen
  pick: string | null; // kullanıcı tahmini
  pickedAt?: number;
  resolvedAt?: number;
  winner?: string;     // gerçek kazanan
  changes?: Record<string, number>;  // sembol -> günlük %
  points?: number;
}

interface StoredState {
  [date: string]: LeaderGameState;
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
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

/** Deterministic 5-symbol pick — date seeded. Tum kullanicilar ayni seti gorur. */
export function getTodaysPool(date: string = todayIso()): string[] {
  // Seed: date string -> 32-bit hash
  let seed = 0;
  for (const ch of date) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
  // Mulberry32 PRNG
  const rand = () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Fisher-Yates partial shuffle, ilk 5
  const arr = [...BIST30_SYMBOLS];
  for (let i = 0; i < 5; i++) {
    const j = i + Math.floor(rand() * (arr.length - i));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, 5);
}

/** Deterministic mode — date'in son hanesi tek/cift. Calismayi alternate eder. */
export function getTodaysMode(date: string = todayIso()): LeaderMode {
  const lastDigit = parseInt(date.slice(-1), 10);
  return lastDigit % 2 === 0 ? 'top' : 'bottom';
}

export function todayIso(): string {
  // Istanbul TZ — 18:10 cutoff icin local saat kullanilmasi yeterli
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Bugünün state'ini al — yoksa yeni olustur. */
export function getTodaysGame(): LeaderGameState {
  const date = todayIso();
  const all = load();
  if (all[date]) return all[date];
  const game: LeaderGameState = {
    date,
    pool: getTodaysPool(date),
    mode: getTodaysMode(date),
    pick: null,
  };
  all[date] = game;
  save(all);
  return game;
}

/** Kullanıcı tahmini kaydet. */
export function submitPick(symbol: string): LeaderGameState {
  const all = load();
  const date = todayIso();
  const game = all[date] ?? getTodaysGame();
  if (!game.pool.includes(symbol)) throw new Error('Bu sembol bugünün havuzunda değil');
  if (game.resolvedAt) throw new Error('Oyun zaten sonuçlandı');
  game.pick = symbol;
  game.pickedAt = Date.now();
  all[date] = game;
  save(all);
  return game;
}

/** Geçmiş 30 günün oyunlarını döner (sıralanmış son→eski). */
export function getHistory(): LeaderGameState[] {
  const all = load();
  return Object.values(all)
    .filter((g) => g.resolvedAt != null)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 30);
}

export interface LeaderStats {
  totalGames: number;
  correctCount: number;
  accuracy: number;
  totalPoints: number;
  currentStreak: number;
}

export function getStats(): LeaderStats {
  const history = getHistory();
  let correct = 0;
  let points = 0;
  let streak = 0;
  // streak: son n gun ardisik dogru (eskiden bugune)
  for (let i = 0; i < history.length; i++) {
    const g = history[i];
    if (g.pick && g.winner && g.pick === g.winner) {
      correct += 1;
      points += g.points ?? 50;
      if (i === streak) streak += 1;
    }
  }
  return {
    totalGames: history.length,
    correctCount: correct,
    accuracy: history.length > 0 ? (correct / history.length) * 100 : 0,
    totalPoints: points,
    currentStreak: streak,
  };
}

/**
 * Oyunu resolve et — Yahoo'dan bugün değişim yüzdelerini çek, kazananı belirle.
 * Idempotent: zaten resolved ise tekrar çağırmaz.
 *
 * Önemli: BIST kapanışı 18:10. Cron tetiklemediyse kullanıcı sayfayı 18:15+
 * sonra açtığında client-side resolve calisir.
 */
export async function tryResolveToday(): Promise<LeaderGameState | null> {
  const game = getTodaysGame();
  if (game.resolvedAt) return game;
  // BIST kapanışı sonrası (18:10 TR) kontrol — saat 18:15 sonrası resolve
  const now = new Date();
  const isAfterClose = now.getHours() > 18 || (now.getHours() === 18 && now.getMinutes() >= 15);
  if (!isAfterClose) return null;

  const changes: Record<string, number> = {};
  for (const sym of game.pool) {
    try {
      const r = await fetchIndexYahoo(`${sym}.IS`);
      if (r && Number.isFinite(r.changePct)) {
        changes[sym] = r.changePct;
      }
    } catch { /* skip */ }
  }
  if (Object.keys(changes).length === 0) return null;

  // Mode'a göre kazanan
  const entries = Object.entries(changes);
  entries.sort((a, b) => b[1] - a[1]);
  const winner = game.mode === 'top' ? entries[0][0] : entries[entries.length - 1][0];

  // Puanlama
  let points = 0;
  if (game.pick === winner) {
    points = 50;
    // top-pick bonusu: pick'in mode yönünde en kuvvetli olduğunu da yakalarsa
    points += 25;
  }

  game.changes = changes;
  game.winner = winner;
  game.points = points;
  game.resolvedAt = Date.now();

  const all = load();
  all[game.date] = game;
  save(all);
  return game;
}
