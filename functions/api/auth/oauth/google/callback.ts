/**
 * GET /api/auth/oauth/google/callback
 *
 * Google authorize redirect'inden donen code+state'i isler:
 *   1. state cookie ile URL state'i karsilastir (CSRF korumasi)
 *   2. code'u Google token endpoint'inde access_token'a degis
 *   3. access_token ile userinfo endpoint'inden email + sub + name al
 *   4. findOrCreateOauthUser ile D1'de upsert
 *   5. JWT imzala, fa_session cookie set et, /panel'e redirect
 *
 * Hata durumlari -> /auth/login?oauth_error=<reason>
 */

import { type Env } from '../../_utils';
import {
  callbackUrl,
  errorRedirect,
  findOrCreateOauthUser,
  issueSessionAndRedirect,
  readStateFromCookie,
} from '../_shared';

interface GoogleEnv extends Env {
  GOOGLE_OAUTH_CLIENT_ID?: string;
  GOOGLE_OAUTH_CLIENT_SECRET?: string;
}

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  id_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

interface GoogleUserInfo {
  sub?: string; // Google'in unique user ID'si
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  picture?: string;
}

export const onRequestGet: PagesFunction<GoogleEnv> = async ({ request, env }) => {
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
    return errorRedirect(request, 'not_configured');
  }

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const stateParam = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');

  // Kullanici Google'da iptal etti
  if (errorParam) return errorRedirect(request, errorParam);
  if (!code || !stateParam) return errorRedirect(request, 'missing_code');

  // CSRF: state cookie ile URL state karsilastir
  const stateCookie = readStateFromCookie(request);
  if (!stateCookie || stateCookie !== stateParam) {
    return errorRedirect(request, 'invalid_state');
  }

  // 1) code -> access_token + id_token
  let tokenResp: GoogleTokenResponse;
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.GOOGLE_OAUTH_CLIENT_ID,
        client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: callbackUrl(request, 'google'),
      }).toString(),
    });
    tokenResp = (await r.json()) as GoogleTokenResponse;
    if (!r.ok || !tokenResp.access_token) {
      console.warn('[oauth/google] token exchange failed:', tokenResp.error, tokenResp.error_description);
      return errorRedirect(request, 'token_exchange_failed');
    }
  } catch (e) {
    console.warn('[oauth/google] token fetch error:', e);
    return errorRedirect(request, 'token_fetch_error');
  }

  // 2) access_token -> userinfo
  let userInfo: GoogleUserInfo;
  try {
    const r = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokenResp.access_token}` },
    });
    userInfo = (await r.json()) as GoogleUserInfo;
    if (!r.ok || !userInfo.sub || !userInfo.email) {
      console.warn('[oauth/google] userinfo missing fields:', userInfo);
      return errorRedirect(request, 'userinfo_missing');
    }
  } catch (e) {
    console.warn('[oauth/google] userinfo error:', e);
    return errorRedirect(request, 'userinfo_error');
  }

  // 3) D1 upsert
  let user;
  try {
    user = await findOrCreateOauthUser(env.DB, {
      email: userInfo.email,
      name: userInfo.name ?? userInfo.given_name,
      provider: 'google',
      providerId: userInfo.sub,
      emailVerified: userInfo.email_verified === true,
    });
  } catch (e) {
    console.warn('[oauth/google] db upsert error:', e);
    return errorRedirect(request, 'db_error');
  }

  // 4) Session cookie + redirect /panel
  return issueSessionAndRedirect(env, user, '/panel');
};
