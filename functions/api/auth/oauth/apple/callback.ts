/**
 * POST /api/auth/oauth/apple/callback
 *
 * Apple Sign In: response_mode=form_post -> POST form-data ile gelir.
 * Body fields: code, state, user? (sadece ilk authorize'da name+email gelir)
 *
 * Akis:
 *   1. state cookie ile body state karsilastir
 *   2. Apple .p8 private key ile ES256 client_secret JWT olustur (1 saat TTL)
 *   3. code'u Apple token endpoint'inde id_token'a degis
 *   4. id_token (JWT) decode: sub + email
 *   5. findOrCreateOauthUser -> issueSessionAndRedirect
 *
 * Apple SubjectClaim: id_token.sub her zaman ayni. Email Hide-My-Email kullaniyorsa
 * private relay adresi gelir (xxxxx@privaterelay.appleid.com).
 */

import { type Env } from '../../_utils';
import {
  errorRedirect,
  findOrCreateOauthUser,
  issueSessionAndRedirect,
  readStateFromCookie,
} from '../_shared';

interface AppleEnv extends Env {
  APPLE_SERVICE_ID?: string;
  APPLE_TEAM_ID?: string;
  APPLE_KEY_ID?: string;
  APPLE_PRIVATE_KEY?: string; // PEM formatinda .p8 icerigi
}

// ES256 JWT signing — Apple'in .p8 private key'iyle client_secret olustur.
async function signES256(payload: object, privateKeyPem: string): Promise<string> {
  // PEM -> CryptoKey
  const pemBody = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const enc = (obj: object) => {
    const json = JSON.stringify(obj);
    const b64 = btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return b64;
  };
  const header = enc({ alg: 'ES256', typ: 'JWT' });
  const body = enc(payload);
  const signingInput = new TextEncoder().encode(`${header}.${body}`);
  const sigBuf = await crypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    key,
    signingInput,
  );
  const sigArr = new Uint8Array(sigBuf);
  let sigStr = '';
  for (const b of sigArr) sigStr += String.fromCharCode(b);
  const sigB64 = btoa(sigStr).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${header}.${body}.${sigB64}`;
}

async function makeAppleClientSecret(env: AppleEnv): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: env.APPLE_TEAM_ID,
    iat: now,
    exp: now + 3000, // 50 dk
    aud: 'https://appleid.apple.com',
    sub: env.APPLE_SERVICE_ID,
  };
  const header = { alg: 'ES256', kid: env.APPLE_KEY_ID, typ: 'JWT' };

  // header'i custom signES256 yerine signing icin manuel — kid'i header'a koymak gerek
  const enc = (obj: object) => {
    const json = JSON.stringify(obj);
    return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const h = enc(header);
  const p = enc(payload);

  const pemBody = (env.APPLE_PRIVATE_KEY ?? '')
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'pkcs8', der,
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  );
  const sigBuf = await crypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    key,
    new TextEncoder().encode(`${h}.${p}`),
  );
  const sigArr = new Uint8Array(sigBuf);
  let sigStr = '';
  for (const b of sigArr) sigStr += String.fromCharCode(b);
  const sigB64 = btoa(sigStr).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${h}.${p}.${sigB64}`;
}

interface AppleTokenResponse {
  access_token?: string;
  id_token?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const norm = parts[1].replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((parts[1].length + 3) % 4);
    const json = atob(norm);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export const onRequestPost: PagesFunction<AppleEnv> = async ({ request, env }) => {
  if (!env.APPLE_SERVICE_ID || !env.APPLE_TEAM_ID || !env.APPLE_KEY_ID || !env.APPLE_PRIVATE_KEY) {
    return errorRedirect(request, 'not_configured');
  }

  const form = await request.formData();
  const code = form.get('code')?.toString();
  const stateParam = form.get('state')?.toString();
  const userJson = form.get('user')?.toString(); // Sadece ilk authorize'da, JSON: {"name":{"firstName":"...","lastName":"..."},"email":"..."}
  const errorParam = form.get('error')?.toString();

  if (errorParam) return errorRedirect(request, errorParam);
  if (!code || !stateParam) return errorRedirect(request, 'missing_code');

  const stateCookie = readStateFromCookie(request);
  if (!stateCookie || stateCookie !== stateParam) {
    return errorRedirect(request, 'invalid_state');
  }

  // 1) client_secret JWT (ES256, kid header, Apple Team ID iss)
  let clientSecret: string;
  try {
    clientSecret = await makeAppleClientSecret(env);
  } catch (e) {
    console.warn('[oauth/apple] client_secret sign error:', e);
    return errorRedirect(request, 'sign_error');
  }

  // 2) code -> id_token
  let tokenResp: AppleTokenResponse;
  try {
    const r = await fetch('https://appleid.apple.com/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.APPLE_SERVICE_ID,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${new URL(request.url).origin}/api/auth/oauth/apple/callback`,
      }).toString(),
    });
    tokenResp = (await r.json()) as AppleTokenResponse;
    if (!r.ok || !tokenResp.id_token) {
      console.warn('[oauth/apple] token exchange failed:', tokenResp.error, tokenResp.error_description);
      return errorRedirect(request, 'token_exchange_failed');
    }
  } catch (e) {
    console.warn('[oauth/apple] token fetch error:', e);
    return errorRedirect(request, 'token_fetch_error');
  }

  // 3) id_token decode (signature verify production'da Apple JWKS ile yapilmali)
  const claims = decodeJwtPayload(tokenResp.id_token);
  if (!claims || typeof claims.sub !== 'string' || typeof claims.email !== 'string') {
    return errorRedirect(request, 'id_token_invalid');
  }

  // user form alani sadece ilk login'de gelir — name'i oradan al
  let name: string | undefined;
  if (userJson) {
    try {
      const parsed = JSON.parse(userJson) as { name?: { firstName?: string; lastName?: string } };
      const first = parsed.name?.firstName;
      const last = parsed.name?.lastName;
      name = [first, last].filter(Boolean).join(' ').trim() || undefined;
    } catch { /* ignore */ }
  }

  // 4) D1 upsert
  let user;
  try {
    user = await findOrCreateOauthUser(env.DB, {
      email: claims.email as string,
      name,
      provider: 'apple',
      providerId: claims.sub as string,
      emailVerified: (claims.email_verified as boolean | string) === true || claims.email_verified === 'true',
    });
  } catch (e) {
    console.warn('[oauth/apple] db upsert error:', e);
    return errorRedirect(request, 'db_error');
  }

  // 5) Session + redirect
  return issueSessionAndRedirect(env, user, '/panel');
};
