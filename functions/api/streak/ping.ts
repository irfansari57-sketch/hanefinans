/**
 * POST /api/streak/ping
 *
 * Layout'tan her sayfa açılışta çağrılır (debounced, günde 1 etkili).
 * Kullanıcının streak'ini günceller:
 *   - Bugün ilk ziyaret → current_streak += 1 (eğer dün de geldiyse)
 *   - Bir gün atladıysa → current_streak = 1 (sıfırla)
 *   - Bugün ikinci kez geliyorsa → değişiklik yok (idempotent)
 *
 * Anon kullanıcı: ok:true ama streak yok (anonim için cookie'den fallback yapılabilir,
 * ama şimdilik sadece auth kullanıcılar için tutuyoruz).
 *
 * Response:
 *   { ok: true, current: 12, longest: 30, total: 145, isNewDay: false }
 */

import { getAuthedUser, type Env as AuthEnv, jsonResponse } from '../auth/_utils';

interface Env extends AuthEnv {
  DB: D1Database;
}

interface StreakRow {
  user_id: number;
  current_streak: number;
  longest_streak: number;
  last_visit_date: string;
  total_visits: number;
}

/** YYYY-MM-DD formatında Europe/Istanbul bugünün tarihini döner. */
function todayInIstanbul(): string {
  // Istanbul = UTC+3 (DST yok)
  const nowMs = Date.now();
  const istMs = nowMs + 3 * 60 * 60 * 1000;
  const d = new Date(istMs);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function daysBetween(dateA: string, dateB: string): number {
  // YYYY-MM-DD string → Date → diff in days (always positive)
  const a = new Date(dateA + 'T00:00:00Z').getTime();
  const b = new Date(dateB + 'T00:00:00Z').getTime();
  return Math.round((b - a) / 86_400_000);
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.AUTH_TOKEN_SECRET) return jsonResponse({ ok: false, error: 'AUTH_TOKEN_SECRET env eksik' }, 503);
  if (!env.DB) return jsonResponse({ ok: false, error: 'D1 binding eksik' }, 503);

  const auth = await getAuthedUser(request, env);
  if (!auth) {
    // Anonim → 200 boş döner; frontend rozet göstermez
    return jsonResponse({ ok: true, current: 0, longest: 0, total: 0, isNewDay: false, anon: true });
  }

  const today = todayInIstanbul();
  const now = Math.floor(Date.now() / 1000);

  try {
    const row = await env.DB
      .prepare('SELECT user_id, current_streak, longest_streak, last_visit_date, total_visits FROM user_streaks WHERE user_id = ?')
      .bind(auth.user.id)
      .first<StreakRow>();

    if (!row) {
      // İlk ziyaret
      await env.DB
        .prepare(
          `INSERT INTO user_streaks (user_id, current_streak, longest_streak, last_visit_date, total_visits, updated_at)
           VALUES (?, 1, 1, ?, 1, ?)`,
        )
        .bind(auth.user.id, today, now)
        .run();
      return jsonResponse({ ok: true, current: 1, longest: 1, total: 1, isNewDay: true });
    }

    if (row.last_visit_date === today) {
      // Aynı gün ikinci ping → no-op
      return jsonResponse({
        ok: true,
        current: row.current_streak,
        longest: row.longest_streak,
        total: row.total_visits,
        isNewDay: false,
      });
    }

    const diff = daysBetween(row.last_visit_date, today);
    let newCurrent: number;
    if (diff === 1) {
      // Ardışık → streak +1
      newCurrent = row.current_streak + 1;
    } else if (diff <= 0) {
      // Saat bozulması / tz weirdness — değişiklik yok
      newCurrent = row.current_streak;
    } else {
      // Gün atladı → streak 1'e sıfırla
      newCurrent = 1;
    }
    const newLongest = Math.max(row.longest_streak, newCurrent);
    const newTotal = row.total_visits + 1;

    await env.DB
      .prepare(
        `UPDATE user_streaks
         SET current_streak = ?, longest_streak = ?, last_visit_date = ?, total_visits = ?, updated_at = ?
         WHERE user_id = ?`,
      )
      .bind(newCurrent, newLongest, today, newTotal, now, auth.user.id)
      .run();

    return jsonResponse({
      ok: true,
      current: newCurrent,
      longest: newLongest,
      total: newTotal,
      isNewDay: true,
      brokeStreak: diff > 1 && row.current_streak > 1,
    });
  } catch (e) {
    return jsonResponse({ ok: false, error: `DB: ${(e as Error).message.slice(0, 100)}` }, 500);
  }
};
