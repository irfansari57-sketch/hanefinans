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
 * Dual-mode admin check: önce DB kolonuna bak, yoksa email fallback.
 * Migration uygulandıktan sonra is_admin=1 olan kullanıcılar admin sayılır.
 * Migration uygulanmadıysa hardcoded liste hâlâ admin erişimi verir.
 */
export function isAdminUser(row: UserRow): boolean {
  if (row.is_admin === 1) return true;
  // Migration uygulanmamışsa veya kolon henüz değer almamışsa email fallback
  return isAdminEmail(row.email);
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

// Aynı hash algoritması frontend ile (mevcut auth.ts) eşleşir:
// SHA-256("email::password::hane-finans")
export async function hashPassword(email: string, password: string): Promise<string> {
  const enc = new TextEncoder().encode(`${email.toLowerCase()}::${password}::hane-finans`);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// --- JWT (HS256) ---

interface JwtPayload {
  uid: number;
  email: string;
  iat: number;
  exp: number;
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

const JWT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 gün

export async function signJwt(uid: number, email: string, secret: string): Promise<string> {
  const header = base64urlEncode(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const now = Date.now();
  const payload = base64urlEncode(new TextEncoder().encode(JSON.stringify({
    uid, email, iat: now, exp: now + JWT_TTL_MS,
  } satisfies JwtPayload)));
  const sig = await hmacSha256(secret, `${header}.${payload}`);
  return `${header}.${payload}.${sig}`;
}

export async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const expected = await hmacSha256(secret, `${header}.${payload}`);
  if (sig !== expected) return null;
  try {
    const json = new TextDecoder().decode(base64urlDecode(payload));
    const p = JSON.parse(json) as JwtPayload;
    if (p.exp < Date.now()) return null;
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
  return { payload, user: row };
}

export async function requireAdmin(req: Request, env: Env): Promise<{ payload: JwtPayload; user: UserRow } | Response> {
  const auth = await getAuthedUser(req, env);
  if (!auth) return jsonResponse({ ok: false, error: 'Yetkisiz' }, 401);
  if (!isAdminUser(auth.user)) return jsonResponse({ ok: false, error: 'Admin yetkisi gerekli' }, 403);
  return auth;
}
