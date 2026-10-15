/**
 * Ortak auth helper'ları — D1, hash, JWT, cookie, admin check.
 *
 * Env binding:
 *   DB                 — Cloudflare D1 database (Pages Settings → Functions → bindings)
 *   AUTH_TOKEN_SECRET  — JWT imza secret (Pages Settings → Environment variables)
 */

export interface Env {
  DB: D1Database;
  AUTH_TOKEN_SECRET?: string;
}

export interface UserRow {
  id: number;
  email: string;
  name: string | null;
  password_hash: string;
  tier: 'free' | 'pro' | 'elite';
  tier_expires_at: number | null;
  email_verified: 0 | 1;
  email_verified_at: number | null;
  avatar_color: string | null;
  /** DB kolonu — migration 002 ile eklendi. Eski satırlarda null gelebilir. */
  is_admin?: 0 | 1 | null;
  /** Migration 018 — JWT iptali için. Yoksa 0. */
  token_version?: number | null;
  created_at: number;
  last_login_at: number | null;
}

export interface PublicUser {
  id: number;
  email: string;
  name?: string;
  tier: 'free' | 'pro' | 'elite';
  tierExpiresAt?: number;
  emailVerified: boolean;
  emailVerifiedAt?: number;
  avatarColor: string;
  /** True ise frontend admin UI'larını render edebilir. */
  isAdmin: boolean;
  createdAt: number;
  lastLoginAt?: number;
}

/**
 * Eski email-bazlı admin kontrolü — sadece fallback olarak korunuyor.
 * Migration 002 sonrası tüm kontroller `isAdminUser(row)` üzerinden DB'deki
 * `is_admin` kolonunu okur. Bu liste yalnızca DB'de henüz işaretlenmemiş
 * kullanıcılar için emniyet ağı.
 */
const ADMIN_EMAILS_LC = ['irfansari57@gmail.com', 'haneassistance@gmail.com'];

export function isAdminEmail(email: string): boolean {
  return ADMIN_EMAILS_LC.includes(email.trim().toLowerCase());
}

/**
 * Tek truth source: DB `is_admin` kolonu (#Ö2 + #Ö15).
 * Email fallback kaldırıldı — migration 002 uygulandı, fallback artık güvenlik açığı:
 * saldırgan `haneassistance@gmail.com` ile signup olup auto-grant'ı atlayabilir.
 * Yeni admin eklemek için manuel SQL: UPDATE users SET is_admin=1 WHERE email=?
 */
export function isAdminUser(row: UserRow): boolean {
  return row.is_admin === 1;
}

export function publicUser(row: UserRow): PublicUser {
  const admin = isAdminUser(row);
  return {
    id: row.id,
    email: row.email,
    name: row.name ?? undefined,
    tier: row.tier,
    tierExpiresAt: row.tier_expires_at ?? undefined,
    emailVerified: admin || row.email_verified === 1,
    emailVerifiedAt: row.email_verified_at ?? undefined,
    avatarColor: row.avatar_color ?? randomColor(row.email),
    isAdmin: admin,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at ?? undefined,
  };
}

export function randomColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return `hsl(${Math.abs(h) % 360}, 65%, 55%)`;
}

// --- Şifre hash ---
//
// ESKİ (legacy): SHA-256("email::password::hane-finans") — salt yok, tek tur. DB
// sızarsa hızlı kırılır. 13 Eki 2026 denetimi (P1) ile PBKDF2'ye geçildi.
//
// YENİ: "pbkdf2$<iter>$<saltB64url>$<hashB64url>" — PBKDF2-HMAC-SHA256, 16 byte
// rastgele salt, 210.000 iterasyon (OWASP 2023 önerisi). Kademeli geçiş: eski
// hash ile giriş başarılı olunca `needsRehash` döner, login yeni hash'i yazar.

export async function hashPasswordLegacy(email: string, password: string): Promise<string> {
  const enc = new TextEncoder().encode(`${email.toLowerCase()}::${password}::hane-finans`);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * PBKDF2 iterasyonu. OWASP önerisi 600k; Workers CPU bütçesi (ücretsiz planda ~10 ms,
 * ücretli 30 s) içinde kalmak için 100k varsayılan. 15 Eki 2026: 210k ile login,
 * "1102 Worker exceeded resource limits" HTML sayfasına düşüyordu (DOĞRULANDI: istemci
 * "<!DOCTYPE … is not valid JSON" aldı). Env `PBKDF2_ITERATIONS` ile yükseltilebilir.
 */
const PBKDF2_ITER_DEFAULT = 100_000;
let PBKDF2_ITER = PBKDF2_ITER_DEFAULT;
export function configurePbkdf2(env: { PBKDF2_ITERATIONS?: string }): void {
  const n = parseInt(env.PBKDF2_ITERATIONS ?? '', 10);
  if (Number.isFinite(n) && n >= 10_000 && n <= 1_000_000) PBKDF2_ITER = n;
}

async function pbkdf2(password: string, salt: Uint8Array, iter: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: iter }, key, 256);
  return new Uint8Array(bits);
}

/** Yeni kayıt / şifre değişikliği için PBKDF2 hash üretir. */
export async function hashPassword(_email: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITER);
  return `pbkdf2$${PBKDF2_ITER}$${base64urlEncode(salt)}$${base64urlEncode(hash)}`;
}

/**
 * Kayıtlı hash'e karşı doğrula. Legacy SHA-256 hash'leri de kabul eder ve
 * `needsRehash:true` ile geri döner — çağıran taraf DB'yi günceller.
 */
export async function verifyPassword(
  email: string,
  password: string,
  stored: string,
): Promise<{ ok: boolean; needsRehash: boolean }> {
  if (!stored) return { ok: false, needsRehash: false };
  if (stored.startsWith('pbkdf2$')) {
    const [, iterStr, saltB64, hashB64] = stored.split('$');
    const iter = parseInt(iterStr, 10);
    if (!Number.isFinite(iter) || !saltB64 || !hashB64) return { ok: false, needsRehash: false };
    const calc = base64urlEncode(await pbkdf2(password, base64urlDecode(saltB64), iter));
    const ok = timingSafeEqual(calc, hashB64);
    // Daha düşük iterasyonlu eski kayıtları da kabul et; rehash yalnızca hedefin altındaysa
    return { ok, needsRehash: ok && iter < PBKDF2_ITER };
  }
  const legacy = await hashPasswordLegacy(email, password);
  const ok = timingSafeEqual(legacy, stored);
  return { ok, needsRehash: ok };
}

// --- JWT (HS256) ---

interface JwtPayload {
  uid: number;
  email: string;
  iat: number;
  exp: number;
  /** Token sürümü — users.token_version ile eşleşmezse oturum geçersiz (13 Eki 2026). */
  tv?: number;
}

function base64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(s: string): Uint8Array {
  const norm = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(norm);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacSha256(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return base64urlEncode(sig);
}

const JWT_TTL_SEC = 30 * 24 * 60 * 60; // 30 gün (saniye)
const JWT_TTL_MS = JWT_TTL_SEC * 1000;

/**
 * RFC 7519: iat / exp UNIX SANIYE cinsindendir (#Ö6).
 * verifyJwt eski (ms) ve yeni (sn) token'ları birlikte kabul eder; 30 gün sonra
 * tüm eski token'lar zaten expire olur.
 *
 * HMAC karşılaştırması sabit-zamanlı (#N2 timing attack savunması).
 */

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

/** Constant-time string compare — timing attack savunması (#N2). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signJwt(uid: number, email: string, secret: string, tokenVersion = 0): Promise<string> {
  const header = base64urlEncode(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const now = nowSec();
  const payload = base64urlEncode(new TextEncoder().encode(JSON.stringify({
    uid, email, iat: now, exp: now + JWT_TTL_SEC, tv: tokenVersion,
  } satisfies JwtPayload)));
  const sig = await hmacSha256(secret, `${header}.${payload}`);
  return `${header}.${payload}.${sig}`;
}

export async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const expected = await hmacSha256(secret, `${header}.${payload}`);
  if (!timingSafeEqual(sig, expected)) return null;
  try {
    const json = new TextDecoder().decode(base64urlDecode(payload));
    const p = JSON.parse(json) as JwtPayload;
    // Backward-compat: eski token'lar ms cinsinden. Eşik 1e11 (≈ yıl 5138).
    const expSec = p.exp > 1e11 ? Math.floor(p.exp / 1000) : p.exp;
    if (expSec < nowSec()) return null;
    return p;
  } catch {
    return null;
  }
}

// --- Cookie helpers ---

const COOKIE_NAME = 'fa_session';

export function makeSessionCookie(token: string): string {
  const maxAge = Math.floor(JWT_TTL_MS / 1000);
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function readSessionToken(req: Request): string | null {
  const cookie = req.headers.get('cookie');
  if (!cookie) return null;
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return match ? match[1] : null;
}

// --- Response helpers ---

export function jsonResponse(payload: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

export async function getAuthedUser(req: Request, env: Env): Promise<{ payload: JwtPayload; user: UserRow } | null> {
  if (!env.AUTH_TOKEN_SECRET) return null;
  const token = readSessionToken(req);
  if (!token) return null;
  const payload = await verifyJwt(token, env.AUTH_TOKEN_SECRET);
  if (!payload) return null;
  const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(payload.uid).first<UserRow>();
  if (!row) return null;
  // Token sürümü: şifre değişti/sıfırlandı → users.token_version arttı → eski
  // token'lar düşer. Kolon yoksa (migration 018 uygulanmadı) 0 kabul edilir.
  const dbTv = row.token_version ?? 0;
  const tokTv = payload.tv ?? 0;
  if (dbTv !== tokTv) return null;
  return { payload, user: row };
}

/** Şifre değişikliği/sıfırlama sonrası tüm oturumları düşür; yeni sürümü döner. */
export async function bumpTokenVersion(db: D1Database, uid: number): Promise<number> {
  try {
    await db.prepare('UPDATE users SET token_version = COALESCE(token_version, 0) + 1 WHERE id = ?').bind(uid).run();
    const r = await db.prepare('SELECT token_version FROM users WHERE id = ?').bind(uid).first<{ token_version: number }>();
    return r?.token_version ?? 0;
  } catch {
    return 0; // kolon yok → sürüm 0 ile devam (eski davranış)
  }
}

export async function requireAdmin(req: Request, env: Env): Promise<{ payload: JwtPayload; user: UserRow } | Response> {
  const auth = await getAuthedUser(req, env);
  if (!auth) return jsonResponse({ ok: false, error: 'Yetkisiz' }, 401);
  if (!isAdminUser(auth.user)) return jsonResponse({ ok: false, error: 'Admin yetkisi gerekli' }, 403);
  return auth;
}
