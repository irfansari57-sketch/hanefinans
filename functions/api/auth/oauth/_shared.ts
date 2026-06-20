/**
 * OAuth shared helpers — Google + Apple ortak mantik.
 *
 * findOrCreateOauthUser(): Email + provider + providerId ile user bul/olustur.
 * Mevcut email/password user'a sosyal provider eklenebilir (link).
 *
 * issueSessionAndRedirect(): JWT imzala, fa_session cookie set et, redirect Response don.
 */

import {
  type Env,
  type UserRow,
  signJwt,
  makeSessionCookie,
  randomColor,
  isAdminEmail,
} from '../_utils';

export interface OauthProfile {
  email: string;
  name?: string;
  provider: 'google' | 'apple';
  providerId: string;
  emailVerified: boolean; // Google + Apple ikisi de verified email doner
}

/**
 * D1 user upsert mantigi:
 * 1) provider + provider_id ile arar -> varsa kullan
 * 2) email ile arar -> varsa provider'i bagla (link)
 * 3) ikisi de yok -> yeni user olustur (tier='free', email_verified=1)
 */
export async function findOrCreateOauthUser(
  db: D1Database,
  profile: OauthProfile,
): Promise<UserRow> {
  const emailLc = profile.email.trim().toLowerCase();
  const now = Date.now();

  // 1) Provider + ID ile bul
  let row = await db
    .prepare(
      `SELECT * FROM users WHERE provider = ? AND provider_id = ? LIMIT 1`,
    )
    .bind(profile.provider, profile.providerId)
    .first<UserRow>();

  if (row) {
    // Last login guncelle
    await db
      .prepare(`UPDATE users SET last_login_at = ? WHERE id = ?`)
      .bind(now, row.id)
      .run();
    return row;
  }

  // 2) Email ile bul (mevcut password user'i OAuth'a link etme)
  row = await db
    .prepare(`SELECT * FROM users WHERE LOWER(email) = ? LIMIT 1`)
    .bind(emailLc)
    .first<UserRow>();

  if (row) {
    // Provider'i mevcut hesaba bagla; email_verified true yap (Google/Apple verified)
    await db
      .prepare(
        `UPDATE users SET provider = ?, provider_id = ?, email_verified = 1,
                          email_verified_at = COALESCE(email_verified_at, ?),
                          last_login_at = ?
         WHERE id = ?`,
      )
      .bind(profile.provider, profile.providerId, now, now, row.id)
      .run();
    // Tekrar oku
    const fresh = await db
      .prepare(`SELECT * FROM users WHERE id = ?`)
      .bind(row.id)
      .first<UserRow>();
    return fresh ?? row;
  }

  // 3) Yeni kullanici olustur
  const avatarColor = randomColor(emailLc);
  const isAdmin = isAdminEmail(emailLc) ? 1 : 0;
  // password_hash NULL kabul etmiyorsa bos string yaz; OAuth user'da hicbir sekilde
  // login.ts'in password compare etmesi yok cunku /api/auth/login provider yoksa calisir.
  const insertResult = await db
    .prepare(
      `INSERT INTO users (email, name, password_hash, tier, tier_expires_at,
                          email_verified, email_verified_at, avatar_color,
                          is_admin, provider, provider_id,
                          created_at, last_login_at)
       VALUES (?, ?, '', 'free', NULL, 1, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      emailLc,
      profile.name ?? null,
      now,
      avatarColor,
      isAdmin,
      profile.provider,
      profile.providerId,
      now,
      now,
    )
    .run();

  const newId = insertResult.meta?.last_row_id ?? 0;
  const fresh = await db
    .prepare(`SELECT * FROM users WHERE id = ?`)
    .bind(newId)
    .first<UserRow>();
  if (!fresh) throw new Error('user_create_failed');
  return fresh;
}

/**
 * JWT imzala, fa_session cookie set et, kullanici /panel'e redirect olsun.
 */
export async function issueSessionAndRedirect(
  env: Env,
  user: UserRow,
  redirectTo = '/panel',
): Promise<Response> {
  if (!env.AUTH_TOKEN_SECRET) {
    return new Response('AUTH_TOKEN_SECRET not configured', { status: 500 });
  }
  const token = await signJwt(user.id, user.email, env.AUTH_TOKEN_SECRET);
  const cookie = makeSessionCookie(token);
  return new Response(null, {
    status: 302,
    headers: {
      Location: redirectTo,
      'Set-Cookie': cookie,
      'Cache-Control': 'no-store',
    },
  });
}

/** State token uretici — CSRF korumasi icin oauth_state cookie + URL'de state. */
export function makeStateToken(): string {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function makeStateCookie(state: string, ttlSec = 600): string {
  // 10 dk TTL — OAuth flow icinde yeterli
  return `oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${ttlSec}`;
}

export function clearStateCookie(): string {
  return `oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function readStateFromCookie(req: Request): string | null {
  const c = req.headers.get('cookie');
  if (!c) return null;
  const m = c.match(/oauth_state=([^;]+)/);
  return m ? m[1] : null;
}

/** OAuth callback URL'i ureten helper — request'in origin'inden. */
export function callbackUrl(req: Request, provider: 'google' | 'apple'): string {
  const url = new URL(req.url);
  return `${url.origin}/api/auth/oauth/${provider}/callback`;
}

/** Hata sayfasina redirect — login sayfasi error param ile yonlendirir. */
export function errorRedirect(req: Request, reason: string): Response {
  const url = new URL(req.url);
  const dest = new URL('/auth/login', url.origin);
  dest.searchParams.set('oauth_error', reason);
  return new Response(null, {
    status: 302,
    headers: {
      Location: dest.toString(),
      'Set-Cookie': clearStateCookie(),
      'Cache-Control': 'no-store',
    },
  });
}
