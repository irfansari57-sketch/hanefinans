/**
 * Stateless email-verification token — KV namespace gerektirmez.
 *
 * Format: base64url(JSON{email, code, exp}).base64url(HMAC-SHA256 imzası)
 * - exp: unix ms (kod geçerlilik bitiş zamanı, default 15 dk)
 * - HMAC: AUTH_TOKEN_SECRET ile imzalanır (Cloudflare Pages env)
 *
 * Akış:
 *   1) /api/auth/send-code → randomCode + signToken(email, code) → token
 *      Frontend token'ı localStorage'a alır + email'e kod gönderilir
 *   2) /api/auth/verify-code → frontend (token, user-input-code) gönderir
 *      Backend token'ı doğrular + içindeki kod ile user-input eşleşiyor mu kontrol eder
 *
 * Güvenlik notları:
 * - Token bir kez kullanılır mantığı YOK (stateless). Kullanıcı kodu birden fazla
 *   submit edebilir; exp'e kadar geçerli. Brute-force koruması rate limit ile
 *   sağlanmalı (CF Pages dashboard'unda WAF kuralı veya frontend backoff).
 * - Kod 6 hane (10^6 olası kombinasyon) + 15dk exp → mantıklı güvenlik.
 */

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

async function hmac(secret: string, payload: string): Promise<string> {
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

export interface VerificationPayload {
  email: string;
  code: string;
  exp: number;
  purpose?: 'verify-email' | 'reset-password';
}

/** Şifre sıfırlama için payload — code yok. */
export interface ResetPayload {
  email: string;
  exp: number;
  purpose: 'reset-password';
  nonce: string;
}

/** Constant-time string compare — timing attack savunması (#N2). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signToken<T extends { exp: number }>(payload: T, secret: string): Promise<string> {
  const body = base64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmac(secret, body);
  return `${body}.${sig}`;
}

export async function verifyToken<T extends { exp: number }>(token: string, secret: string): Promise<T | null> {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expectedSig = await hmac(secret, body);
  if (!timingSafeEqual(sig, expectedSig)) return null;
  try {
    const json = new TextDecoder().decode(base64urlDecode(body));
    const payload = JSON.parse(json) as T;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** 16 byte rastgele nonce. */
export function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return base64urlEncode(bytes);
}

export function generateCode(): string {
  const v = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return v.toString().padStart(6, '0');
}

export function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  });
}

export function corsPreflightResponse(): Response {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
