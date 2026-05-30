/**
 * Predictions client — günlük tahmin oyunu.
 */

export type PredictionAsset = 'BIST100' | 'BIST30';
export type PredictionBucket = 'strongUp' | 'up' | 'flat' | 'down' | 'strongDown';

export interface PredictionSlot {
  asset: PredictionAsset;
  date: string;
  label: string;
}

export interface UserPrediction {
  id: number;
  asset: PredictionAsset;
  date: string;
  prediction: PredictionBucket;
  base_value: number | null;
  actual_change_pct: number | null;
  actual_bucket: PredictionBucket | null;
  points_earned: number | null;
  resolved_at: number | null;
}

export interface PredictionsTodayResponse {
  ok: boolean;
  slots: PredictionSlot[];
  userPredictions: UserPrediction[];
  userStats: { totalPoints: number; correctCount: number; totalCount: number };
  anon?: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  tier: 'free' | 'pro' | 'elite';
  totalPoints: number;
  correctCount: number;
  totalCount: number;
  accuracy: number;
}

export interface LeaderboardResponse {
  ok: boolean;
  period: 'week' | 'month' | 'all';
  list: LeaderboardEntry[];
}

export const BUCKET_LABELS: Record<PredictionBucket, { emoji: string; label: string; range: string; tone: string }> = {
  strongUp:   { emoji: '🚀', label: 'Sert yukarı', range: '+%2 ve üstü', tone: 'text-success' },
  up:         { emoji: '↗',  label: 'Yukarı',     range: '+%0.5 / +%2', tone: 'text-success' },
  flat:       { emoji: '→',  label: 'Yatay',      range: '±%0.5',       tone: 'text-slate-400' },
  down:       { emoji: '↘',  label: 'Aşağı',      range: '-%0.5 / -%2', tone: 'text-danger' },
  strongDown: { emoji: '💥', label: 'Sert aşağı', range: '-%2 ve altı', tone: 'text-danger' },
};

export async function fetchPredictionsToday(): Promise<PredictionsTodayResponse | null> {
  try {
    const r = await fetch('/api/predictions/today', { credentials: 'same-origin' });
    if (!r.ok) return null;
    return await r.json() as PredictionsTodayResponse;
  } catch {
    return null;
  }
}

export async function submitPrediction(
  asset: PredictionAsset,
  prediction: PredictionBucket,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch('/api/predictions/submit', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset, prediction }),
    });
    const d = await r.json() as { ok: boolean; error?: string };
    return d;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function fetchLeaderboard(period: 'week' | 'month' | 'all' = 'all'): Promise<LeaderboardResponse | null> {
  try {
    const r = await fetch(`/api/predictions/leaderboard?period=${period}`);
    if (!r.ok) return null;
    return await r.json() as LeaderboardResponse;
  } catch {
    return null;
  }
}
